# 통합 담당(lyc0620) 영역의 임시 대역 — 통합 때 그쪽 파일로 교체
"""앱 설정. `.env` 파일이나 환경변수에서 값을 읽어요 (pydantic-settings)."""

import logging
from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("hyeonpung")

# 개발용 기본 비밀키예요. 운영(APP_ENV가 dev가 아님)에서는 꼭 바꿔야 해요.
DEV_JWT_SECRET = "dev-only-secret-change-me-please-0123456789"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    DATABASE_URL: str = "sqlite:///./data/app.db"
    JWT_SECRET: str = DEV_JWT_SECRET
    # 기본값은 안전한 운영 모드(prod)예요. 개발할 때는 .env에 APP_ENV=dev 를 직접 적어 주세요.
    # (dev 이면 비밀번호 없는 개발용 로그인이 켜지니까, 깜빡해도 운영에서 켜지지 않게 했어요)
    APP_ENV: str = "prod"
    KAKAO_REST_API_KEY: str | None = None
    # 캠퍼스 중심 좌표 — OSM 기준 정문(35.7003,128.4576)과 강의동(35.7063,128.4538)의 중간점. 맵 담당과 최종 확인
    CAMPUS_LAT: float = 35.7033
    CAMPUS_LNG: float = 128.4557
    SERVICE_RADIUS_M: float = 8000
    # 쉼표로 구분해서 여러 개 넣을 수 있어요
    CORS_ORIGINS: str = "http://localhost:5173"

    @field_validator("JWT_SECRET")
    @classmethod
    def _empty_secret_means_default(cls, v: str) -> str:
        # .env.example을 그대로 복사해서 비어 있으면 빈 키로 서명하지 않게 기본값으로 바꿔요
        return v.strip() or DEV_JWT_SECRET

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def is_dev(self) -> bool:
        return self.APP_ENV == "dev"


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if settings.JWT_SECRET == DEV_JWT_SECRET:
        if not settings.is_dev:
            raise RuntimeError(
                "운영 환경에서는 JWT_SECRET을 꼭 설정해야 해요. 개발 중이면 .env에 APP_ENV=dev 를 적어 주세요."
            )
        logger.warning("JWT_SECRET이 개발용 기본값이에요. 운영에서는 꼭 바꿔 주세요.")
    if settings.is_dev:
        logger.warning(
            "APP_ENV=dev 라서 비밀번호 없는 개발용 로그인(/api/v1/auth/dev-login)이 켜져 있어요. "
            "운영에서는 절대 쓰면 안 돼요!"
        )
    return settings
