"""3D 실내 스캔 뷰어와 스캔 파일 (명세 6.8, 담당: 김도현).

통합 시 main.py에서:  app.include_router(scans.router, prefix="/api/v1")
운영에서는 Caddy가 /api 만 백엔드로 넘기므로, 뷰어 페이지도 /api/v1 아래에 둔다.

- GET /api/v1/scans/splat-viewer?scan=e8_3f_gs   가우시안 스플래팅 뷰어 (HTML)
- GET /api/v1/scans/points-viewer?scan=e8_3f     점 구름 뷰어 (HTML)
- GET /api/v1/scans/files/{name}                 스캔 파일 (.splat / .ply / .json)
"""

from __future__ import annotations

import re
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse, JSONResponse

router = APIRouter(prefix="/scans", tags=["scans"])

STATIC = Path(__file__).resolve().parents[2] / "static"
VIEWERS = STATIC / "viewers"
SCANS = STATIC / "scans"
_NAME = re.compile(r"[\w\-]+\.(splat|ply|json)")  # 파일 이름만 허용 (경로 이동 방지)
_MEDIA = {"splat": "application/octet-stream", "ply": "application/octet-stream", "json": "application/json"}


def _not_found(message: str) -> JSONResponse:
    return JSONResponse(status_code=404, content={"error": {"code": "NOT_FOUND", "message": message}})


@router.get("/splat-viewer", include_in_schema=False)
def splat_viewer() -> FileResponse:
    return FileResponse(VIEWERS / "splat.html", media_type="text/html")


@router.get("/points-viewer", include_in_schema=False)
def points_viewer() -> FileResponse:
    return FileResponse(VIEWERS / "points.html", media_type="text/html")


@router.get("/files/{name}")
def scan_file(name: str):
    if not _NAME.fullmatch(name) or not (SCANS / name).is_file():
        return _not_found("스캔 파일이 없습니다.")
    ext = name.rsplit(".", 1)[1]
    # 메타데이터(.json)는 시작 시점 등을 자주 고치므로 캐시하지 않고, 큰 스캔 파일만 하루 캐시
    cache = "no-cache" if ext == "json" else "public, max-age=86400"
    return FileResponse(SCANS / name, media_type=_MEDIA[ext], headers={"Cache-Control": cache})
