"""포탈 세미나 공지에서 실제로 본 표기들 (2026-11)."""

from datetime import date, datetime

import pytest

from app.core.time import KST
from app.services.seminar.dates import extract_place, extract_when

POSTED = date(2026, 11, 18)


def dt(m, d, h, mi=0, y=2026):
    return datetime(y, m, d, h, mi, tzinfo=KST)


@pytest.mark.parametrize(
    "title, body, start, end",
    [
        (
            "",
            "- 일 시 : 2026년 11월 26일 (목) 12시\n* 사전신청자 식사 제공\n- 장 소 : DGIST E4-114",
            dt(11, 26, 12),
            None,
        ),
        ("", "1. Date: November 24(Tue)-25(Wed), 2026\n2. Venue: R1-203", dt(11, 24, 0), None),
        (
            "",
            "1. Date: 10:30am, Nov 26(Thu), 2026\n4. Venue: E2-625 (offline only)",
            dt(11, 26, 10, 30),
            None,
        ),
        (
            "",
            "1. Date & Time : 16:00, November 25(Wed), 2026\n2. Venue : E4-114",
            dt(11, 25, 16),
            None,
        ),
        (
            "",
            "1. 일시(Date&Time) : 11월 24일(화), 16:30 / Tue, NOV 24, 16:30\n2. 장소(Lacation) : E3-112호",
            dt(11, 24, 16, 30),
            None,
        ),
        (
            "",
            "- 일시 : 2026년 11월 23일(월) 17:00~\n- 장소\n· 오프라인 DGIST E8 312호",
            dt(11, 23, 17),
            None,
        ),
        (
            "",
            "1. 일시: 2026년 11월 24일(화), 12:00~13:30\n2. 장소: R1-301호 대회의실",
            dt(11, 24, 12),
            dt(11, 24, 13, 30),
        ),
        ("", "1. Date: 4:30 pm, Nov 24(Tue), 2026\n2. Speaker: X", dt(11, 24, 16, 30), None),
        (
            "",
            " - 일시: 2026. 11. 26.(목) 14:00~17:00\n - 장소: E7 L29",
            dt(11, 26, 14),
            dt(11, 26, 17),
        ),
        ("", "1. Date & Time: November 26(Thu), 2026, 4:30 PM", dt(11, 26, 16, 30), None),
        ("", "시간: 11월 19일(목) 12:00~13:00\n장소: E7-229", dt(11, 19, 12), dt(11, 19, 13)),
        # 라벨 없이 제목에만 있는 경우
        (
            "[뇌과학과 세미나] Sebastien Royer, Ph.D.(KIST), 11월 25일 16:00pm, E4-114",
            "본문",
            dt(11, 25, 16),
            None,
        ),
        (
            "[화학물리학과] 2026 특별 세미나(11월 26일 (목) 10:30 MIT 박사)",
            "",
            dt(11, 26, 10, 30),
            None,
        ),
        ("[뇌과학과] 세미나 안내(11/26목 12:00, 식사 제공)", "", dt(11, 26, 12), None),
        (
            "(′26. 11. 24.(화) 12:00~13:30, R1-301호 대회의실)",
            "",
            dt(11, 24, 12),
            dt(11, 24, 13, 30),
        ),
        ("향기콘서트", "다음주 11월 23일 (월) 오후 5시부터 개최", dt(11, 23, 17), None),
    ],
)
def test_extract_when(title, body, start, end):
    assert extract_when(title, body, POSTED) == (start, end)


def test_year_rolls_over():
    # 12월에 올라온 "1월 5일" 공지는 내년
    assert extract_when("1월 5일 14:00 세미나", "", date(2026, 12, 20))[0] == dt(1, 5, 14, y=2027)


def test_registration_deadline_is_not_event_time():
    # 실제 공지(#139323): 본문의 날짜는 신청 마감뿐
    body = (
        "In this mentorial seminar, we will explore DGIST's linguistic landscape.\n"
        "A light lunch will be provided to those who register by Monday, November 9 at 6am.\n"
        "11월 9일 월요일 아침 6시까지 신청한 학생에게 간편식이 제공됩니다."
    )
    assert extract_when("[멘토리얼 세미나]Linguistic Landscape at DGIST", body, POSTED) is None


def test_end_time_only_for_ranges():
    # 두 번째 시각이 범위가 아니면 끝 시각으로 쓰지 않는다
    r = extract_when("", "Nov 11 (Wed), 1:00 PM 행사. 문의는 18:00 이전에", POSTED)
    assert r == (dt(11, 11, 13), None)
    r = extract_when("", "1. 일시: 2026년 11월 11일(수) 13:00 ~ 18:00", POSTED)
    assert r == (dt(11, 11, 13), dt(11, 11, 18))


def test_no_date():
    assert extract_when("일정 추후 공지", "장소: E7", POSTED) is None


@pytest.mark.parametrize(
    "title, body, place",
    [
        ("", "- 장 소 : DGIST E4-114", "E4-114"),
        ("", "2. Venue: E2-625 (offline only)", "E2-625 (offline only)"),
        ("", "2. 장소(Lacation) : E3-112호", "E3-112호"),
        # 콜론 없는 "장소" 줄 → 강의실 코드 검색으로 대체
        ("", "- 장소\n· 오프라인 DGIST E8 312호(참석자 저녁 도시락 제공)", "E8 312호"),
        ("", "ㅇ 장 소 : E2 115호 강의실", "E2 115호 강의실"),
        # 실제 공지(#139350): 한 줄에 일시와 장소가 같이 있음
        ("", "-강연일시 및 장소: 2026.11.11.(수) 17:30~19:30 / E7-235", "E7-235"),
        ("", "2. 장소: DGIST 도서관(E8) 312호", "도서관(E8) 312호"),
        ("Seminar, 11월 25일 16:00pm, E4-114", "본문", "E4-114"),
        ("안내", "내용 없음", None),
    ],
)
def test_extract_place(title, body, place):
    assert extract_place(title, body) == place
