"""대구광역시 버스정보시스템(businfo.daegu.go.kr) 실시간 도착정보 수집기.

사이트 지도 화면이 쓰는 JSON 엔드포인트를 그대로 호출한다 (HTML 파싱 없음).
  GET {BASE}/realtime/arr2/{bsId}   → 노선별 도착 예정 버스 목록
  GET {BASE}/bs/search?wincId=...    → 정류장 정보 (좌표는 EPSG:5187)

주의
  - User-Agent 를 지정하지 않으면(httpx 기본값) 400 을 돌려준다.
  - 노선은 이름 대신 routeId 로 구분한다 (사이트 언어 설정에 따라 이름이 영어로 바뀜).
  - 방향(moveDir) 이름은 사이트가 주지 않으므로 seed/bus_stops.json 의 routes 설정을 쓴다.
"""

import asyncio
import json
import logging
import re
from datetime import datetime, timedelta
from pathlib import Path

import httpx

from app.core.time import now_kst
from app.models import BusStop
from app.services.bus.base import Arrival

log = logging.getLogger(__name__)

BASE_URL = "https://businfo.daegu.go.kr:8095/dbms_web_api"
USER_AGENT = "hyeonpung-map/0.1 (DGIST makerthon)"
SEED_FILE = Path(__file__).resolve().parents[3] / "seed" / "bus_stops.json"

_MIN_RE = re.compile(r"(\d+)\s*분")
_DEPART_RE = re.compile(r"(\d{1,2}):(\d{2})\s*기점출발")


def load_route_config(path: Path = SEED_FILE) -> dict[str, dict]:
    """routeId → {"name": "직행2", "directions": {"0": "...", "1": "..."}}"""
    return json.loads(path.read_text(encoding="utf-8")).get("routes", {})


def _eta_from_state(state: str) -> int | None:
    """arrState 문자열 → 남은 분. 해석할 수 없으면 None."""
    state = state.strip()
    if m := _MIN_RE.search(state):
        return int(m.group(1))
    if state in ("곧 도착", "도착예정", "전"):
        return 1
    if state == "전전":
        return 3
    return None


def parse_arrivals(
    payload: dict, routes: dict[str, dict], now: datetime | None = None
) -> list[Arrival]:
    """/realtime/arr2 응답 → Arrival 목록. routes 에 없는 노선은 버린다."""
    now = now or now_kst()
    body = payload.get("body") or {}
    if body.get("block"):  # 사이트가 일시적으로 정보를 막은 경우
        raise RuntimeError(body.get("blockMsg") or "businfo blocked")

    out: list[Arrival] = []
    for group in body.get("list") or []:
        for item in group.get("arrList") or []:
            cfg = routes.get(str(item.get("routeId")))
            if cfg is None:
                continue
            direction = cfg.get("directions", {}).get(str(item.get("moveDir")))
            state = str(item.get("arrState") or "")
            bs_gap = item.get("bsGap")

            # 기점에서 아직 출발 전: "13:55 기점출발예정" → 출발 예정 시각으로 계산
            if m := _DEPART_RE.search(str(item.get("bsNm") or "")):
                dep = now.replace(hour=int(m[1]), minute=int(m[2]), second=0, microsecond=0)
                if dep < now - timedelta(minutes=5):
                    dep += timedelta(days=1)
                out.append(
                    Arrival(
                        route=cfg["name"],
                        route_type="city",
                        direction=direction,
                        eta_min=max(0, int((dep - now).total_seconds() // 60)),
                        stops_left=None,
                        departure_time=dep,
                        source="timetable",
                    )
                )
                continue

            eta = _eta_from_state(state)
            if eta is None:
                log.debug("unknown arrState %r", state)
                continue
            out.append(
                Arrival(
                    route=cfg["name"],
                    route_type="city",
                    direction=direction,
                    eta_min=eta,
                    stops_left=bs_gap if isinstance(bs_gap, int) and bs_gap > 0 else None,
                    source="realtime",
                )
            )
    return sorted(out, key=lambda a: a.eta_min)


class CrawlBusSource:
    def __init__(
        self,
        routes: dict[str, dict] | None = None,
        client: httpx.AsyncClient | None = None,
        delay_seconds: float = 0.3,
    ):
        self.routes = routes if routes is not None else load_route_config()
        self.delay = delay_seconds
        self._client = client or httpx.AsyncClient(
            base_url=BASE_URL, timeout=10, headers={"User-Agent": USER_AGENT}
        )

    async def fetch(self, stops: list[BusStop]) -> dict[str, list[Arrival]]:
        result: dict[str, list[Arrival]] = {}
        errors = 0
        for i, stop in enumerate(s for s in stops if s.external_id):
            if i:
                await asyncio.sleep(self.delay)
            try:
                resp = await self._client.get(f"/realtime/arr2/{stop.external_id}")
                resp.raise_for_status()
                result[stop.id] = parse_arrivals(resp.json(), self.routes)
            except Exception as exc:
                errors += 1
                log.warning("businfo fetch failed for %s: %r", stop.id, exc)
        if errors and not result:
            raise RuntimeError("businfo: 모든 정류장 조회 실패")
        return result
