"""앱 설정 (pydantic-settings). 값은 backend/.env 또는 환경변수에서 읽는다 (대소문자 무시).

필드 이름은 소문자. DB 파트 코드가 쓰는 대문자 이름(DATABASE_URL, JWT_SECRET, APP_ENV, ...)은
아래 @property 별칭으로 제공한다 — 같은 이름의 필드를 둘 두면 pydantic-settings 가 환경변수를 헷갈린다.
"""

import logging
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
logger = logging.getLogger("hyeonpung")

# 개발용 기본 비밀키. 운영(APP_ENV 가 dev 가 아님)에서 이 값이면 서버가 켜지지 않는다.
DEV_JWT_SECRET = "dev-only-secret-change-me-please-0123456789"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    database_url: str = "sqlite:///./data/app.db"
    # dev 이면 비밀번호 없는 개발용 로그인(/api/v1/auth/dev-login)이 켜진다. 기본은 안전한 prod
    app_env: str = "prod"

    bus_source: Literal["mock", "crawl", "api"] = "crawl"
    bus_api_key: str = ""
    bus_refresh_seconds: int = 30
    bus_stale_seconds: int = 180

    seminar_source: Literal["mock", "portal"] = "mock"
    portal_cookie_file: str = "data/portal_cookies.json"  # 관리자 API로 넣은 포탈 쿠키
    crawl_delay_seconds: float = 1.0
    seminar_poll_minutes: int = 10  # 변경 감지 주기 (07~23시)
    seminar_full_pages: int = 3  # 하루 1번 다시 확인할 최근 페이지 수

    admin_token: str = ""  # 관리자 API (X-Admin-Token). 비우면 관리자 API 꺼짐
    discord_webhook_url: str = ""  # 크롤러 로그인 만료 알림

    jwt_secret: str = DEV_JWT_SECRET
    allowed_email_domain: str = "dgist.ac.kr"
    smtp_host: str = ""
    smtp_user: str = ""
    smtp_password: str = ""

    # 맛집 장소 검색 (카카오 로컬 API, 서버가 대신 호출). 없으면 지도에서 직접 찍기로 대신
    kakao_rest_api_key: str | None = None
    # 서비스 지역: 지도의 지역 원 중심(frontend stylize.ts REGION_CENTER)과 같게.
    # 반경은 원(3.6km) 가장자리를 구름이 덮기 시작하는 3km — 그 밖의 제보·가게는 구름에 가려 안 보인다
    campus_lat: float = 35.700
    campus_lng: float = 128.4575
    service_radius_m: float = 3000

    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]

    # 테스트에서 끄기 위한 스위치
    scheduler_enabled: bool = True
    auto_migrate: bool = True

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, v: object) -> object:
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @field_validator("jwt_secret")
    @classmethod
    def _empty_secret_means_default(cls, v: str) -> str:
        # .env.example 을 그대로 복사해 비어 있으면 빈 키로 서명하지 않게 기본값으로
        return v.strip() or DEV_JWT_SECRET

    @property
    def resolved_database_url(self) -> str:
        """sqlite 상대경로를 backend/ 기준으로 고정한다 (실행 위치와 무관하게)."""
        prefix = "sqlite:///"
        url = self.database_url
        if url.startswith(prefix) and not url.startswith(prefix + "/") and ":memory:" not in url:
            path = url[len(prefix) :]
            if not Path(path).is_absolute():
                return prefix + (BACKEND_DIR / path).resolve().as_posix()
        return url

    @property
    def resolved_cookie_file(self) -> Path:
        p = Path(self.portal_cookie_file)
        return p if p.is_absolute() else (BACKEND_DIR / p).resolve()

    @property
    def is_dev(self) -> bool:
        return self.app_env == "dev"

    # ── DB 파트 코드가 쓰는 이름 (별칭) ──
    @property
    def DATABASE_URL(self) -> str:  # noqa: N802
        return self.resolved_database_url

    @property
    def JWT_SECRET(self) -> str:  # noqa: N802
        return self.jwt_secret

    @property
    def APP_ENV(self) -> str:  # noqa: N802
        return self.app_env

    @property
    def KAKAO_REST_API_KEY(self) -> str | None:  # noqa: N802
        return self.kakao_rest_api_key

    @property
    def CAMPUS_LAT(self) -> float:  # noqa: N802
        return self.campus_lat

    @property
    def CAMPUS_LNG(self) -> float:  # noqa: N802
        return self.campus_lng

    @property
    def SERVICE_RADIUS_M(self) -> float:  # noqa: N802
        return self.service_radius_m

    @property
    def cors_origin_list(self) -> list[str]:
        return self.cors_origins


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if settings.jwt_secret == DEV_JWT_SECRET:
        if not settings.is_dev:
            raise RuntimeError(
                "운영 환경에서는 JWT_SECRET 을 꼭 설정해야 합니다. "
                "개발 중이면 backend/.env 에 APP_ENV=dev 를 적어 주세요."
            )
        logger.warning("JWT_SECRET 이 개발용 기본값입니다. 운영에서는 꼭 바꿔 주세요.")
    if settings.is_dev:
        logger.warning(
            "APP_ENV=dev: 비밀번호 없는 개발용 로그인(/api/v1/auth/dev-login)이 켜져 있습니다."
        )
    return settings
