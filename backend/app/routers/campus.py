"""DGIST 건물·강의실 검색 API (명세 6.8, 담당: 김도현).

통합 시 main.py에서:  app.include_router(campus.router, prefix="/api/v1")
"""

from __future__ import annotations

import httpx
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse, Response

from app.services.campus import get_campus, search

router = APIRouter(tags=["campus"])

_image_cache: dict[str, bytes] = {}


@router.get("/campus/floor-plans/{plan_id}/image")
def floor_plan_image(plan_id: str):
    """학교 사이트의 안내도 이미지를 중계한다. seed에 등록된 안내도만 허용 (임의 URL 프록시 아님)."""
    plan = get_campus().plans.get(plan_id)
    if plan is None:
        return JSONResponse(
            status_code=404, content={"error": {"code": "NOT_FOUND", "message": "안내도를 찾을 수 없습니다."}}
        )
    if plan_id not in _image_cache:
        # 학교 사이트가 가끔 첫 요청에 실패한다 → 한 번 더 시도 (통합 확인 중 502 후 바로 200 을 봄)
        r = None
        for _ in range(2):
            try:
                r = httpx.get(plan["image_url"], timeout=10, headers={"User-Agent": "hyeonpung-map/0.1"})
                r.raise_for_status()
                break
            except httpx.HTTPError:
                r = None
        if r is None:
            return JSONResponse(
                status_code=502,
                content={"error": {"code": "UPSTREAM_ERROR", "message": "학교 사이트에서 안내도를 가져오지 못했습니다."}},
            )
        _image_cache[plan_id] = r.content
    return Response(_image_cache[plan_id], media_type="image/png", headers={"Cache-Control": "public, max-age=86400"})


@router.get("/campus/search")
def campus_search(
    q: str = Query(..., min_length=1, max_length=50, description='예: "E7 L21", "233", "멀티미디어", "도서관"'),
    limit: int = Query(20, ge=1, le=50),
):
    items = search(q, limit)
    return {"items": items, "count": len(items), "updated_at": None}
