from datetime import datetime, timedelta

from app.services.bus.base import Arrival

DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def next_shuttles(
    timetable: list[dict], stop_id: str, now: datetime, horizon_min: int = 120, limit: int = 2
) -> list[Arrival]:
    """시간표에서 now 이후 horizon_min 분 안에 출발하는 셔틀을 노선별로 limit개씩 돌려준다."""
    out: list[Arrival] = []
    for entry in timetable:
        if entry["stop_id"] != stop_id:
            continue
        found = 0
        for day_offset in (0, 1):  # 자정을 넘기는 경우
            day = now + timedelta(days=day_offset)
            if DAYS[day.weekday()] not in entry["days"]:
                continue
            for hhmm in entry["times"]:
                h, m = map(int, hhmm.split(":"))
                dep = day.replace(hour=h, minute=m, second=0, microsecond=0)
                eta = (dep - now).total_seconds() / 60
                if 0 <= eta <= horizon_min and found < limit:
                    out.append(
                        Arrival(
                            route=entry["route"],
                            route_type="shuttle",
                            direction=entry.get("direction"),
                            eta_min=int(eta),
                            stops_left=None,
                            departure_time=dep,
                            source="timetable",
                        )
                    )
                    found += 1
    return out
