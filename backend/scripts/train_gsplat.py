"""COLMAP 결과로 3D 가우시안 스플래팅 학습 (gsplat, 담당: 김도현).

gsplat 공식 예제는 fused-ssim(컴파일 필요)을 쓰므로, SSIM을 PyTorch로 직접 구현한 최소 학습 스크립트.

실행 (gsplat 가상환경 파이썬으로):
  python train_gsplat.py --data <undistorted 폴더> --out <출력.ply> [--steps 15000] [--max-size 960]
  <undistorted 폴더>: COLMAP image_undistorter 결과 (images/ + sparse_txt/ 의 cameras/images/points3D.txt)

출력: 표준 3DGS PLY (x, y, z, f_dc_*, f_rest_*, opacity, scale_*, rot_*) + 같은 이름 .json (위쪽 방향 등)
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from gsplat import rasterization
from gsplat.strategy import DefaultStrategy
from PIL import Image

C0 = 0.28209479177387814  # SH 0차 상수


# ---------------- COLMAP TXT 읽기 ----------------
def qvec2rotmat(q):
    w, x, y, z = q
    return np.array(
        [
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
        ]
    )


def load_colmap(data: Path, max_size: int):
    txt = data / "sparse_txt"
    cams = {}
    for l in (txt / "cameras.txt").read_text().splitlines():
        if l.startswith("#") or not l.strip():
            continue
        t = l.split()
        assert t[1] == "PINHOLE", f"undistorted PINHOLE 카메라만 지원: {t[1]}"
        cams[int(t[0])] = (int(t[2]), int(t[3]), *map(float, t[4:8]))  # w, h, fx, fy, cx, cy

    frames = []
    for l in (txt / "images.txt").read_text().splitlines():
        t = l.split()
        if l.startswith("#") or len(t) != 10 or not t[9].lower().endswith((".jpg", ".jpeg", ".png")):
            continue
        r = qvec2rotmat(list(map(float, t[1:5])))
        tv = np.array(list(map(float, t[5:8])))
        w2c = np.eye(4)
        w2c[:3, :3], w2c[:3, 3] = r, tv
        frames.append((t[9], w2c, cams[int(t[8])]))
    frames.sort(key=lambda f: f[0])

    pts, cols = [], []
    for l in (txt / "points3D.txt").read_text().splitlines():
        if l.startswith("#") or not l.strip():
            continue
        t = l.split()
        pts.append(list(map(float, t[1:4])))
        cols.append(list(map(int, t[4:7])))

    images, viewmats, Ks = [], [], []
    for name, w2c, (w, h, fx, fy, cx, cy) in frames:
        im = Image.open(data / "images" / name).convert("RGB")
        s = min(1.0, max_size / max(w, h))
        if s < 1.0:
            im = im.resize((round(w * s), round(h * s)), Image.LANCZOS)
        images.append(torch.from_numpy(np.array(im)))  # uint8 HxWx3, CPU (np.array: 쓰기 가능한 복사본)
        viewmats.append(torch.tensor(w2c, dtype=torch.float32))
        Ks.append(torch.tensor([[fx * s, 0, cx * s], [0, fy * s, cy * s], [0, 0, 1]], dtype=torch.float32))
    return images, torch.stack(viewmats), torch.stack(Ks), np.array(pts), np.array(cols) / 255.0


# ---------------- SSIM (fused-ssim 대신) ----------------
def _gauss(size=11, sigma=1.5, device="cuda"):
    x = torch.arange(size, device=device, dtype=torch.float32) - size // 2
    g = torch.exp(-(x**2) / (2 * sigma**2))
    g = g / g.sum()
    return (g[:, None] @ g[None, :]).expand(3, 1, size, size).contiguous()


def ssim(a: torch.Tensor, b: torch.Tensor, win: torch.Tensor) -> torch.Tensor:
    """a, b: [1,3,H,W] 0~1"""
    pad = win.shape[-1] // 2
    mu_a = F.conv2d(a, win, padding=pad, groups=3)
    mu_b = F.conv2d(b, win, padding=pad, groups=3)
    sa = F.conv2d(a * a, win, padding=pad, groups=3) - mu_a**2
    sb = F.conv2d(b * b, win, padding=pad, groups=3) - mu_b**2
    sab = F.conv2d(a * b, win, padding=pad, groups=3) - mu_a * mu_b
    c1, c2 = 0.01**2, 0.03**2
    m = ((2 * mu_a * mu_b + c1) * (2 * sab + c2)) / ((mu_a**2 + mu_b**2 + c1) * (sa + sb + c2))
    return m.mean()


# ---------------- PLY 저장 ----------------
def save_ply(path: Path, params: torch.nn.ParameterDict):
    means = params["means"].detach().cpu().numpy()
    sh0 = params["sh0"].detach().cpu().numpy().reshape(len(means), -1)
    shN = params["shN"].detach().transpose(1, 2).cpu().numpy().reshape(len(means), -1)  # 채널 우선 (3DGS 규약)
    op = params["opacities"].detach().cpu().numpy()[:, None]
    sc = params["scales"].detach().cpu().numpy()
    rot = F.normalize(params["quats"].detach(), dim=-1).cpu().numpy()
    names = (
        ["x", "y", "z", "nx", "ny", "nz"]
        + [f"f_dc_{i}" for i in range(sh0.shape[1])]
        + [f"f_rest_{i}" for i in range(shN.shape[1])]
        + ["opacity", "scale_0", "scale_1", "scale_2", "rot_0", "rot_1", "rot_2", "rot_3"]
    )
    data = np.concatenate([means, np.zeros_like(means), sh0, shN, op, sc, rot], axis=1).astype(np.float32)
    header = "ply\nformat binary_little_endian 1.0\n" + f"element vertex {len(data)}\n"
    header += "".join(f"property float {n}\n" for n in names) + "end_header\n"
    with open(path, "wb") as f:
        f.write(header.encode("ascii"))
        f.write(data.tobytes())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--steps", type=int, default=15000)
    ap.add_argument("--max-size", type=int, default=960)
    ap.add_argument("--sh-degree", type=int, default=3)
    ap.add_argument("--max-splats", type=int, default=0, help="가우시안 수 상한 (0=무제한). 넘으면 증식 중단 (GPU 메모리 보호)")
    a = ap.parse_args()
    dev = "cuda"
    torch.manual_seed(0)

    images, viewmats, Ks, pts, cols = load_colmap(Path(a.data), a.max_size)
    n_img = len(images)
    cam_centers = torch.linalg.inv(viewmats)[:, :3, 3]
    scene_scale = float((cam_centers - cam_centers.mean(0)).norm(dim=1).max()) * 1.1
    # 카메라 '위쪽'(-y) 평균 → 뷰어의 up 벡터
    up = (-viewmats[:, 1, :3]).mean(0)
    up = (up / up.norm()).tolist()
    print(f"images {n_img}, points {len(pts)}, scene_scale {scene_scale:.3f}, size {tuple(images[0].shape[:2])}")

    # 초기 가우시안: COLMAP 점 + 가까운 3점 평균 거리로 크기
    means = torch.tensor(pts, dtype=torch.float32, device=dev)
    d2 = []
    for chunk in means.split(4096):
        d2.append(torch.cdist(chunk, means).topk(4, largest=False).values[:, 1:].pow(2).mean(1))
    dist = torch.cat(d2).sqrt().clamp_min(1e-4)
    n = len(means)
    k = (a.sh_degree + 1) ** 2
    rgb = torch.tensor(cols, dtype=torch.float32, device=dev)
    params = torch.nn.ParameterDict(
        {
            "means": torch.nn.Parameter(means),
            "scales": torch.nn.Parameter(torch.log(dist)[:, None].repeat(1, 3)),
            "quats": torch.nn.Parameter(torch.tensor([1.0, 0, 0, 0], device=dev).repeat(n, 1)),
            "opacities": torch.nn.Parameter(torch.logit(torch.full((n,), 0.1, device=dev))),
            "sh0": torch.nn.Parameter(((rgb - 0.5) / C0)[:, None, :]),
            "shN": torch.nn.Parameter(torch.zeros(n, k - 1, 3, device=dev)),
        }
    )
    lrs = {"means": 1.6e-4 * scene_scale, "scales": 5e-3, "quats": 1e-3, "opacities": 5e-2, "sh0": 2.5e-3, "shN": 2.5e-3 / 20}
    opts = {name: torch.optim.Adam([{"params": params[name], "lr": lr, "name": name}], eps=1e-15) for name, lr in lrs.items()}
    means_sched = torch.optim.lr_scheduler.ExponentialLR(opts["means"], gamma=0.01 ** (1.0 / a.steps))

    strategy = DefaultStrategy(verbose=False, refine_stop_iter=int(a.steps * 0.5), reset_every=3000)
    strategy.check_sanity(params, opts)
    state = strategy.initialize_state(scene_scale=scene_scale)
    win = _gauss(device=dev)

    t0 = time.time()
    for step in range(a.steps):
        i = int(torch.randint(n_img, (1,)))
        gt = images[i].to(dev, non_blocking=True).float() / 255.0
        h, w = gt.shape[:2]
        sh_deg = min(a.sh_degree, step // 1000)
        renders, alphas, info = rasterization(
            means=params["means"],
            quats=params["quats"],
            scales=torch.exp(params["scales"]),
            opacities=torch.sigmoid(params["opacities"]),
            colors=torch.cat([params["sh0"], params["shN"]], 1),
            viewmats=viewmats[i : i + 1].to(dev),
            Ks=Ks[i : i + 1].to(dev),
            width=w,
            height=h,
            sh_degree=sh_deg,
            packed=False,
        )
        img = renders[0].clamp(0, 1)
        strategy.step_pre_backward(params, opts, state, step, info)
        l1 = (img - gt).abs().mean()
        loss = 0.8 * l1 + 0.2 * (1 - ssim(img.permute(2, 0, 1)[None], gt.permute(2, 0, 1)[None], win))
        loss.backward()
        for o in opts.values():
            o.step()
            o.zero_grad(set_to_none=True)
        means_sched.step()
        if a.max_splats and len(params["means"]) >= a.max_splats:
            pass  # 상한 도달: 증식·가지치기 중단, 기존 가우시안만 계속 최적화
        else:
            strategy.step_post_backward(params, opts, state, step, info, packed=False)
        if step % 500 == 0 or step == a.steps - 1:
            el = time.time() - t0
            eta = el / (step + 1) * (a.steps - step - 1)
            print(f"step {step:6d}/{a.steps}  loss {loss.item():.4f}  l1 {l1.item():.4f}  splats {len(params['means']):,}  "
                  f"elapsed {el/60:.1f}m  eta {eta/60:.1f}m", flush=True)

    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    save_ply(out, params)
    # 뷰어 시작 시점: 영상 중간 프레임의 실제 카메라 위치와 보는 방향(+z)
    c2w = torch.linalg.inv(viewmats[n_img // 2])
    start_pos = c2w[:3, 3]
    start_look = start_pos + c2w[:3, 2] * 2.0
    meta = {
        "up": up,
        "splats": len(params["means"]),
        "steps": a.steps,
        "center": cam_centers.mean(0).tolist(),
        "start_position": start_pos.tolist(),
        "start_look_at": start_look.tolist(),
    }
    out.with_suffix(".json").write_text(json.dumps(meta), encoding="utf-8")
    print(f"saved {out} ({out.stat().st_size/1e6:.1f} MB), {len(params['means']):,} splats, {(time.time()-t0)/60:.1f} min")


if __name__ == "__main__":
    main()
