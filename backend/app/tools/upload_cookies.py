"""포탈 쿠키를 서버에 넣는 도우미.

    cd backend
    uv run python -m app.tools.upload_cookies                       # 로컬 서버 (localhost:8000)
    uv run python -m app.tools.upload_cookies --url https://서버주소  # 배포 서버

쿠키 값을 붙여넣으면 화면에 표시하지 않고 서버로 보낸다. ADMIN_TOKEN 은 backend/.env 에서 읽는다.
"""

import argparse
import getpass
import json
import sys
import time

import httpx

from app.core.config import get_settings


def main() -> int:
    ap = argparse.ArgumentParser(description="포탈 쿠키 업로드")
    ap.add_argument("--url", default="http://localhost:8000", help="백엔드 주소")
    args = ap.parse_args()

    token = get_settings().admin_token
    if not token:
        print("backend/.env 에 ADMIN_TOKEN 이 없습니다.", file=sys.stderr)
        return 1

    print("개발자도구 Network → listBbs.do → Request Headers 의 cookie 값을 붙여넣고 Enter")
    raw = getpass.getpass("cookie (입력 내용은 보이지 않음): ").strip()
    if not raw:
        print("입력이 비어 있습니다.", file=sys.stderr)
        return 1

    base = args.url.rstrip("/")
    headers = {"X-Admin-Token": token, "Content-Type": "text/plain; charset=utf-8"}
    r = httpx.put(
        f"{base}/api/v1/admin/portal-cookies", content=raw.encode(), headers=headers, timeout=20
    )
    if r.status_code != 200:
        print(f"업로드 실패 ({r.status_code}): {r.text}", file=sys.stderr)
        return 1
    print("저장됨:", r.json())

    # 업로드 직후 도는 수집 결과 확인
    print("수집 결과 확인 중…")
    for _ in range(30):
        time.sleep(2)
        status = httpx.get(f"{base}/api/v1/admin/crawl-status", headers=headers, timeout=20).json()
        last = (status.get("logs") or [{}])[0]
        if (
            last.get("finished_at")
            and last.get("started_at", "") >= status.get("cookies_updated_at", "")[:19]
        ):
            print(json.dumps(last, ensure_ascii=False, indent=1))
            return 0 if last.get("status") == "success" else 2
    print("아직 수집 중입니다. 잠시 후 /api/v1/admin/crawl-status 를 확인하세요.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
