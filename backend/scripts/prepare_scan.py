"""COLMAP 복원 결과(fused.ply)를 웹 뷰어용으로 정리한다 (담당: 김도현).

실행:
  python backend/scripts/prepare_scan.py <fused.ply> <sparse 모델 TXT 폴더> <출력.ply> [--max-points 600000]

하는 일
1. 카메라들의 '위쪽' 방향 평균으로 중력 방향을 추정해, 바닥이 아래(+Y가 위)로 오게 회전
2. 중심에서 너무 먼 잡음 점 제거 (거리 상위 2%)
3. 복셀 다운샘플로 점 수를 줄여 브라우저에서 가볍게
4. x, y, z(float) + r, g, b(uchar) 바이너리 PLY로 저장
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np


def read_ply(path: Path) -> tuple[np.ndarray, np.ndarray]:
    with open(path, "rb") as f:
        props, count = [], 0
        while True:
            line = f.readline().decode("ascii").strip()
            if line.startswith("element vertex"):
                count = int(line.split()[-1])
            elif line.startswith("property"):
                _, typ, name = line.split()
                props.append((name, {"float": "<f4", "double": "<f8", "uchar": "u1"}[typ]))
            elif line == "end_header":
                break
        data = np.frombuffer(f.read(), dtype=np.dtype(props), count=count)
    xyz = np.stack([data["x"], data["y"], data["z"]], axis=1).astype(np.float64)
    rgb = np.stack([data["red"], data["green"], data["blue"]], axis=1).astype(np.uint8)
    return xyz, rgb


def camera_up(images_txt: Path) -> np.ndarray:
    """images.txt의 각 카메라 회전에서 이미지 '위쪽'(-y축)의 월드 방향을 평균."""
    ups = []
    for l in images_txt.read_text().splitlines():
        t = l.split()
        # 이미지 줄: IMAGE_ID QW QX QY QZ TX TY TZ CAMERA_ID NAME (다음 줄은 2D 점 목록, 비어 있을 수 있음)
        if l.startswith("#") or len(t) != 10 or not t[9].lower().endswith((".jpg", ".jpeg", ".png")):
            continue
        qw, qx, qy, qz = map(float, t[1:5])
        r = np.array(
            [
                [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qz * qw), 2 * (qx * qz + qy * qw)],
                [2 * (qx * qy + qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qx * qw)],
                [2 * (qx * qz - qy * qw), 2 * (qy * qz + qx * qw), 1 - 2 * (qx * qx + qy * qy)],
            ]
        )
        ups.append(-r.T[:, 1])  # 카메라 좌표 -y(위) → 월드
    up = np.mean(ups, axis=0)
    return up / np.linalg.norm(up)


def rotation_to_y(v: np.ndarray) -> np.ndarray:
    y = np.array([0.0, 1.0, 0.0])
    axis = np.cross(v, y)
    s, c = np.linalg.norm(axis), float(np.dot(v, y))
    if s < 1e-9:
        return np.eye(3) if c > 0 else np.diag([1.0, -1.0, -1.0])
    k = axis / s
    kx = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    return np.eye(3) + s * kx + (1 - c) * kx @ kx


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("fused")
    ap.add_argument("sparse_txt")
    ap.add_argument("out")
    ap.add_argument("--max-points", type=int, default=600_000)
    a = ap.parse_args()

    xyz, rgb = read_ply(Path(a.fused))
    n0 = len(xyz)
    xyz = xyz @ rotation_to_y(camera_up(Path(a.sparse_txt) / "images.txt")).T

    center = np.median(xyz, axis=0)
    d = np.linalg.norm(xyz - center, axis=1)
    keep = d <= np.quantile(d, 0.98)
    xyz, rgb = xyz[keep] - center, rgb[keep]

    # 복셀 크기를 키워 가며 max_points 이하가 될 때까지 다운샘플
    voxel = (np.ptp(xyz, axis=0).max()) / 2000
    while True:
        keys = np.floor(xyz / voxel).astype(np.int64)
        _, idx = np.unique(keys, axis=0, return_index=True)
        if len(idx) <= a.max_points:
            break
        voxel *= 1.25
    xyz, rgb = xyz[idx].astype(np.float32), rgb[idx]

    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    rec = np.empty(len(xyz), dtype=[("x", "<f4"), ("y", "<f4"), ("z", "<f4"), ("r", "u1"), ("g", "u1"), ("b", "u1")])
    rec["x"], rec["y"], rec["z"] = xyz[:, 0], xyz[:, 1], xyz[:, 2]
    rec["r"], rec["g"], rec["b"] = rgb[:, 0], rgb[:, 1], rgb[:, 2]
    header = (
        "ply\nformat binary_little_endian 1.0\n"
        f"element vertex {len(rec)}\n"
        "property float x\nproperty float y\nproperty float z\n"
        "property uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n"
    )
    with open(out, "wb") as f:
        f.write(header.encode("ascii"))
        f.write(rec.tobytes())
    print(f"{n0:,} → {len(rec):,} points (voxel {voxel:.4f}), {out.stat().st_size / 1e6:.1f} MB → {out}")


if __name__ == "__main__":
    main()
