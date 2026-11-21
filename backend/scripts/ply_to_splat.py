"""3DGS PLY → 웹용 .splat 변환 (담당: 김도현).

.splat 형식 (가우시안당 32바이트, antimatter15 규약, gaussian-splats-3d가 읽음):
  position float32 x3 | scale float32 x3 (exp 적용) | color uint8 x4 (RGB + 불투명도) | rotation uint8 x4 (정규화 쿼터니언 *128+128)
SH 고차항(시점별 색 변화)은 버리고 0차(기본색)만 쓴다. 불투명도가 낮은 가우시안은 제거.

실행: python ply_to_splat.py <입력.ply> <출력.splat> [--min-opacity 0.05]
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

C0 = 0.28209479177387814


def read_3dgs_ply(path: Path) -> dict[str, np.ndarray]:
    with open(path, "rb") as f:
        names, count = [], 0
        while True:
            line = f.readline().decode("ascii").strip()
            if line.startswith("element vertex"):
                count = int(line.split()[-1])
            elif line.startswith("property"):
                names.append(line.split()[-1])
            elif line == "end_header":
                break
        data = np.frombuffer(f.read(), dtype=np.float32, count=count * len(names)).reshape(count, len(names))
    return {n: data[:, i] for i, n in enumerate(names)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--min-opacity", type=float, default=0.05)
    a = ap.parse_args()

    v = read_3dgs_ply(Path(a.src))
    opacity = 1 / (1 + np.exp(-v["opacity"]))
    keep = opacity >= a.min_opacity
    n0 = len(opacity)

    pos = np.stack([v["x"], v["y"], v["z"]], 1)[keep]
    scale = np.exp(np.stack([v["scale_0"], v["scale_1"], v["scale_2"]], 1))[keep]
    rgb = np.stack([v["f_dc_0"], v["f_dc_1"], v["f_dc_2"]], 1)[keep] * C0 + 0.5
    rgba = np.concatenate([rgb, opacity[keep, None]], 1)
    rot = np.stack([v["rot_0"], v["rot_1"], v["rot_2"], v["rot_3"]], 1)[keep]
    rot /= np.linalg.norm(rot, axis=1, keepdims=True)

    # 크고 진한 가우시안부터 (뷰어가 앞부분부터 점진 로딩할 때 보기 좋게)
    order = np.argsort(-(scale.prod(1) * rgba[:, 3]))
    rec = np.empty(len(order), dtype=[("p", "<f4", 3), ("s", "<f4", 3), ("c", "u1", 4), ("r", "u1", 4)])
    rec["p"], rec["s"] = pos[order], scale[order]
    rec["c"] = np.clip(rgba[order] * 255, 0, 255).astype(np.uint8)
    rec["r"] = np.clip(rot[order] * 128 + 128, 0, 255).astype(np.uint8)
    Path(a.dst).write_bytes(rec.tobytes())
    print(f"{n0:,} → {len(rec):,} splats (opacity ≥ {a.min_opacity}), {Path(a.dst).stat().st_size / 1e6:.1f} MB → {a.dst}")


if __name__ == "__main__":
    main()
