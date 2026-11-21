from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    database_url: str = "sqlite:///./data/app.db"

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

    jwt_secret: str = ""
    allowed_email_domain: str = "dgist.ac.kr"
    smtp_host: str = ""
    smtp_user: str = ""
    smtp_password: str = ""

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


@lru_cache
def get_settings() -> Settings:
    return Settings()
