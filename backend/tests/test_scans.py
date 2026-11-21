"""3D 스캔 라우터 테스트. 실행: backend 폴더에서 python -m pytest tests/test_scans.py"""

from __future__ import annotations

import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers import campus, scans


@pytest.fixture(scope="module")
def client() -> TestClient:
    app = FastAPI()
    app.include_router(campus.router, prefix="/api/v1")
    app.include_router(scans.router, prefix="/api/v1")
    return TestClient(app)


def test_viewer_pages_are_html(client):
    for path in ("/api/v1/scans/splat-viewer", "/api/v1/scans/points-viewer"):
        r = client.get(path)
        assert r.status_code == 200 and r.headers["content-type"].startswith("text/html")
        assert "/api/v1/scans/files/" in r.text  # 뷰어가 새 파일 경로를 씀


def test_search_viewer_url_resolves(client):
    """강의실 검색이 주는 viewer_url이 실제로 열리는지 (같은 서버 안에서)."""
    item = client.get("/api/v1/campus/search", params={"q": "E8 301"}).json()["items"][0]
    url = item["scans"][0]["viewer_url"]
    assert client.get(url).status_code == 200


def test_scan_files(client):
    meta = client.get("/api/v1/scans/files/e8_3f_gs.json")
    assert meta.status_code == 200 and json.loads(meta.text)["format"] == "splat"
    splat = client.get("/api/v1/scans/files/e8_3f_gs.splat")
    assert splat.status_code == 200 and len(splat.content) % 32 == 0  # .splat = 가우시안당 32바이트


@pytest.mark.parametrize("name", ["nope.splat", "e8_3f_gs.exe"])
def test_scan_file_rejects_bad_names(client, name):
    r = client.get(f"/api/v1/scans/files/{name}")
    assert r.status_code == 404 and r.json()["error"]["code"] == "NOT_FOUND"


def test_scan_file_no_path_traversal(client):
    # %2F는 경로 구분자로 풀려 라우트 자체가 안 맞음 → 404 (seed 파일이 새어 나가지 않음)
    r = client.get("/api/v1/scans/files/..%2F..%2Fseed%2Fscans.json")
    assert r.status_code == 404
