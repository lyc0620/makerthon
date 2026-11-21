"""개발용 로그인 요청/응답 (인증 6.7과 같은 토큰 형식)."""

from pydantic import BaseModel, Field, field_validator


class DevLoginIn(BaseModel):
    nickname: str = Field(min_length=2, max_length=20)

    @field_validator("nickname", mode="before")
    @classmethod
    def _strip(cls, v):
        return v.strip() if isinstance(v, str) else v


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
