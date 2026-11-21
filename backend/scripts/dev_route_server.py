"""통합 전 단독 확인용 서버: 길찾기·러닝 API + 데모 지도 페이지.

실행 (backend 폴더에서):  python -m uvicorn scripts.dev_route_server:app --port 8000
브라우저:                 http://localhost:8000/
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.routers import route

app = FastAPI(title="hyeonpung-map route dev")
# 개발 전용: route_demo.html을 file://로 열어도 API를 부를 수 있게 (Origin: null)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"])
app.include_router(route.router, prefix="/api/v1")

DEMO = Path(__file__).with_name("route_demo.html")


@app.get("/", include_in_schema=False)
def demo() -> FileResponse:
    return FileResponse(DEMO)
