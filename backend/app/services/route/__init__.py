"""길찾기·러닝 루트 서비스 (담당: 김도현)."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from .graph import NoPathError, SnapError, WalkGraph

DEFAULT_GRAPH_PATH = Path(__file__).resolve().parents[3] / "seed" / "walk_graph.json"


@lru_cache(maxsize=1)
def get_graph() -> WalkGraph:
    """프로세스당 한 번만 로드 (워커 1개 전제). WALK_GRAPH_PATH 환경변수로 경로 변경 가능."""
    return WalkGraph.load(os.environ.get("WALK_GRAPH_PATH", DEFAULT_GRAPH_PATH))


__all__ = ["WalkGraph", "SnapError", "NoPathError", "get_graph"]
