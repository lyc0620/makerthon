"""통합 전 단독 확인용 서버: 길찾기·러닝 API + 데모 지도 페이지.

실행 (backend 폴더에서):  python -m uvicorn scripts.dev_route_server:app --port 8000
브라우저:                 http://localhost:8000/
"""

from __future__ import annotations

import re
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from app.routers import campus, route

app = FastAPI(title="hyeonpung-map route dev")
app.include_router(campus.router, prefix="/api/v1")
# 개발 전용: route_demo.html을 file://로 열어도 API를 부를 수 있게 (Origin: null)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"])
app.include_router(route.router, prefix="/api/v1")

DEMO = Path(__file__).with_name("route_demo.html")
VIEWER = Path(__file__).with_name("scan_viewer.html")
SCANS = Path(__file__).resolve().parents[1] / "static" / "scans"


@app.get("/", include_in_schema=False)
def demo() -> FileResponse:
    return FileResponse(DEMO)


@app.get("/scan-viewer", include_in_schema=False)
def scan_viewer() -> FileResponse:
    return FileResponse(VIEWER)


@app.get("/splat-viewer", include_in_schema=False)
def splat_viewer() -> FileResponse:
    return FileResponse(Path(__file__).with_name("splat_viewer.html"))


@app.get("/scans/{name}", include_in_schema=False)
def scan_file(name: str):
    # 파일 이름만 허용 (경로 이동 방지)
    if not re.fullmatch(r"[\w\-]+\.(ply|splat|json)", name) or not (SCANS / name).is_file():
        return JSONResponse(status_code=404, content={"error": {"code": "NOT_FOUND", "message": "스캔 파일이 없습니다."}})
    return FileResponse(SCANS / name)
