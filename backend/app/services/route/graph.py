"""보행로 그래프: 좌표 스냅, 최단경로(Dijkstra), 목표 거리 순환 코스 생성.

seed/walk_graph.json 형식은 scripts/build_walk_graph.py 참고.
외부 라이브러리 없이 표준 라이브러리만 사용한다.
"""

from __future__ import annotations

import hashlib
import heapq
import json
import math
from dataclasses import dataclass
from pathlib import Path

WALK_SPEED_MPS = 1.3  # 약 4.7 km/h
RUN_SPEED_MPS = 2.8  # 약 6:00/km
MAX_SNAP_M = 300.0
RETURN_PENALTY = 3.0  # 이미 지난 길을 다시 쓸 때 가중치 배수
SIGNAL_RADIUS_M = 15.0


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


class SnapError(ValueError):
    """입력 좌표가 보행로에서 너무 멀다."""


class NoPathError(ValueError):
    """두 지점 사이에 경로가 없다."""


@dataclass
class Path_:
    nodes: list[int]
    length_m: float


@dataclass
class Loop:
    id: str
    name: str
    nodes: list[int]
    length_m: float
    signal_count: int


class WalkGraph:
    def __init__(self, nodes: list[list[float]], edges: list[list[float]], signals: list[list[float]] | None = None):
        self.lat = [float(n[1]) for n in nodes]
        self.lng = [float(n[2]) for n in nodes]
        self.adj: list[list[tuple[int, float]]] = [[] for _ in nodes]
        for a, b, d in edges:
            a, b, d = int(a), int(b), float(d)
            self.adj[a].append((b, d))
            self.adj[b].append((a, d))
        self.signals = [(float(s[0]), float(s[1])) for s in (signals or [])]
        self._cos = math.cos(math.radians(sum(self.lat) / len(self.lat))) if self.lat else 1.0

    # ---------- 로드 ----------
    @classmethod
    def load(cls, path: str | Path) -> "WalkGraph":
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        return cls(data["nodes"], data["edges"], data.get("signals"))

    def __len__(self) -> int:
        return len(self.lat)

    # ---------- 스냅 ----------
    def snap(self, lat: float, lng: float, max_m: float = MAX_SNAP_M) -> int:
        """가장 가까운 노드 인덱스. 노드 수천 개 수준이라 전수 탐색으로 충분하다."""
        best, best_d2 = -1, float("inf")
        c = self._cos
        for i in range(len(self.lat)):
            dy = self.lat[i] - lat
            dx = (self.lng[i] - lng) * c
            d2 = dx * dx + dy * dy
            if d2 < best_d2:
                best, best_d2 = i, d2
        if best < 0 or haversine_m(lat, lng, self.lat[best], self.lng[best]) > max_m:
            raise SnapError("보행로에서 너무 멉니다.")
        return best

    # ---------- 최단경로 ----------
    def dijkstra(
        self,
        src: int,
        dst: int | None = None,
        penalty: dict[tuple[int, int], float] | None = None,
    ) -> tuple[dict[int, float], dict[int, int]]:
        """가중 거리와 직전 노드. penalty는 간선(작은 인덱스, 큰 인덱스) → 가중치 배수."""
        dist: dict[int, float] = {src: 0.0}
        prev: dict[int, int] = {}
        heap = [(0.0, src)]
        done: set[int] = set()
        while heap:
            d, u = heapq.heappop(heap)
            if u in done:
                continue
            done.add(u)
            if u == dst:
                break
            for v, w in self.adj[u]:
                if penalty:
                    w *= penalty.get((u, v) if u < v else (v, u), 1.0)
                nd = d + w
                if nd < dist.get(v, float("inf")):
                    dist[v] = nd
                    prev[v] = u
                    heapq.heappush(heap, (nd, v))
        return dist, prev

    @staticmethod
    def _trace(prev: dict[int, int], src: int, dst: int) -> list[int]:
        if src == dst:
            return [src]
        if dst not in prev:
            raise NoPathError("경로를 찾을 수 없습니다.")
        out = [dst]
        while out[-1] != src:
            out.append(prev[out[-1]])
        out.reverse()
        return out

    def length_of(self, nodes: list[int]) -> float:
        total = 0.0
        for a, b in zip(nodes, nodes[1:]):
            total += min(w for v, w in self.adj[a] if v == b)
        return total

    def shortest_path(self, src: int, dst: int) -> Path_:
        _, prev = self.dijkstra(src, dst)
        nodes = self._trace(prev, src, dst)
        return Path_(nodes, self.length_of(nodes))

    def route(self, from_lat: float, from_lng: float, to_lat: float, to_lng: float) -> Path_:
        return self.shortest_path(self.snap(from_lat, from_lng), self.snap(to_lat, to_lng))

    # ---------- 순환 코스 ----------
    def _bearing(self, a: int, b: int) -> float:
        dy = self.lat[b] - self.lat[a]
        dx = (self.lng[b] - self.lng[a]) * self._cos
        return math.degrees(math.atan2(dx, dy)) % 360

    @staticmethod
    def _edges(nodes: list[int]) -> set[tuple[int, int]]:
        return {(a, b) if a < b else (b, a) for a, b in zip(nodes, nodes[1:])}

    def count_signals(self, nodes: list[int]) -> int:
        if not self.signals:
            return 0
        count = 0
        for slat, slng in self.signals:
            for n in nodes:
                if haversine_m(slat, slng, self.lat[n], self.lng[n]) <= SIGNAL_RADIUS_M:
                    count += 1
                    break
        return count

    def loops(
        self,
        lat: float,
        lng: float,
        target_m: float,
        k: int = 3,
        tolerance: float = 0.15,
        n_bearings: int = 12,
    ) -> list[Loop]:
        """출발점 → 경유지1 → 경유지2 → 출발점 순환 코스. 목표 거리 오차가 작은 순으로 최대 k개."""
        s = self.snap(lat, lng)
        d0, prev0 = self.dijkstra(s)

        # 경유지 후보: 출발점에서 목표의 20~40% 떨어진 노드, 방향별로 하나씩
        lo, hi = target_m * 0.2, target_m * 0.4
        ideal = target_m * 0.3
        sector_size = 360 / n_bearings
        best_in_sector: dict[int, int] = {}
        for node, d in d0.items():
            if lo <= d <= hi:
                sec = int(self._bearing(s, node) // sector_size) if node != s else 0
                cur = best_in_sector.get(sec)
                if cur is None or abs(d - ideal) < abs(d0[cur] - ideal):
                    best_in_sector[sec] = node
        w1_candidates = list(best_in_sector.values())

        results: list[tuple[float, list[int], float]] = []
        for w1 in w1_candidates:
            leg1 = self._trace(prev0, s, w1)
            penalty = {e: RETURN_PENALTY for e in self._edges(leg1)}
            d1, prev1 = self.dijkstra(w1, penalty=penalty)
            b1 = self._bearing(s, w1)

            # 경유지2: 출발점 기준 w1과 40~110도 벌어진 방향, 예상 총거리가 목표에 가까운 2곳
            scored = []
            for node, dw in d1.items():
                if node not in d0 or not (lo <= d0[node] <= hi):
                    continue
                diff = abs((self._bearing(s, node) - b1 + 180) % 360 - 180)
                if not 40 <= diff <= 110:
                    continue
                est = d0[w1] + dw + d0[node]
                scored.append((abs(est - target_m), node))
            scored.sort()
            for _, w2 in scored[:2]:
                leg2 = self._trace(prev1, w1, w2)
                pen2 = dict(penalty)
                for e in self._edges(leg2):
                    pen2[e] = RETURN_PENALTY
                _, prev2 = self.dijkstra(w2, s, penalty=pen2)
                try:
                    leg3 = self._trace(prev2, w2, s)
                except NoPathError:
                    continue
                nodes = leg1 + leg2[1:] + leg3[1:]
                length = self.length_of(nodes)
                err = abs(length - target_m) / target_m
                if err <= tolerance:
                    results.append((err, nodes, length))

        # 오차 순으로 정렬하고, 서로 70% 넘게 겹치는 코스는 하나만 남긴다
        results.sort(key=lambda r: r[0])
        picked: list[tuple[list[int], float]] = []
        picked_edges: list[set[tuple[int, int]]] = []
        for _, nodes, length in results:
            es = self._edges(nodes)
            if any(len(es & pe) / max(1, len(es | pe)) > 0.7 for pe in picked_edges):
                continue
            picked.append((nodes, length))
            picked_edges.append(es)
            if len(picked) >= k:
                break

        loops = []
        for i, (nodes, length) in enumerate(picked, 1):
            h = hashlib.sha1(",".join(map(str, nodes)).encode()).hexdigest()[:6]
            loops.append(
                Loop(
                    id=f"run_{h}",
                    name=f"{length / 1000:.1f}km 코스 {i}",
                    nodes=nodes,
                    length_m=length,
                    signal_count=self.count_signals(nodes),
                )
            )
        return loops

    # ---------- 출력 ----------
    def geometry(self, nodes: list[int]) -> dict:
        """GeoJSON LineString, 좌표 순서 [lng, lat]."""
        return {"type": "LineString", "coordinates": [[self.lng[n], self.lat[n]] for n in nodes]}
