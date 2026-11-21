import random

from app.models import BusStop
from app.services.bus.base import Arrival


class MockBusSource:
    """실제 수집처가 붙기 전 개발용. 호출할 때마다 그럴듯한 값을 만든다."""

    def __init__(self, seed: int | None = None):
        self._rng = random.Random(seed)

    async def fetch(self, stops: list[BusStop]) -> dict[str, list[Arrival]]:
        result: dict[str, list[Arrival]] = {}
        for stop in stops:
            arrivals = []
            for route in stop.routes:
                if "셔틀" in route:  # 셔틀은 시간표로 계산
                    continue
                for direction in ("대구 방면", "현풍 방면"):
                    eta = self._rng.randint(1, 25)
                    arrivals.append(
                        Arrival(
                            route=route,
                            route_type="city",
                            direction=direction,
                            eta_min=eta,
                            stops_left=max(1, eta // 2),
                        )
                    )
            result[stop.id] = arrivals
        return result
