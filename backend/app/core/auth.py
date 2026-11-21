# 통합 담당(lyc0620) 영역의 임시 대역 — 통합 때 그쪽 파일로 교체
"""JWT Bearer 인증. HS256, sub = 사용자 정수 id 문자열."""

from datetime import timedelta

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session

from app.core import timeutil
from app.core.config import get_settings
from app.core.db import get_session
from app.core.errors import AppError
from app.models.user import User

TOKEN_EXPIRES_IN = 2_592_000  # 30일(초)
ALGORITHM = "HS256"

_bearer = HTTPBearer(auto_error=False)


def create_access_token(user_id: int) -> str:
    exp = timeutil.now_utc() + timedelta(seconds=TOKEN_EXPIRES_IN)
    payload = {"sub": str(user_id), "exp": exp}
    return jwt.encode(payload, get_settings().JWT_SECRET, algorithm=ALGORITHM)


def decode_user_id(token: str) -> int | None:
    """토큰이 맞으면 사용자 정수 id, 틀리거나 만료면 None이에요. (WebSocket에서도 써요)"""
    try:
        payload = jwt.decode(token, get_settings().JWT_SECRET, algorithms=[ALGORITHM])
        return int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError, TypeError):
        return None


def _unauthorized(message: str = "로그인이 필요해요.") -> AppError:
    return AppError("UNAUTHORIZED", 401, message)


def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    session: Session = Depends(get_session),
) -> User:
    """쓰기 API용: 토큰이 없거나 틀리면 401이에요."""
    if creds is None:
        raise _unauthorized()
    user_id = decode_user_id(creds.credentials)
    if user_id is None:
        raise _unauthorized("토큰이 올바르지 않거나 만료됐어요. 다시 로그인해 주세요.")
    user = session.get(User, user_id)
    if user is None:
        raise _unauthorized("사용자를 찾을 수 없어요. 다시 로그인해 주세요.")
    return user


def optional_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    session: Session = Depends(get_session),
) -> User | None:
    """읽기 API용: 토큰이 있으면 사용자, 없거나 틀리면 None(익명)으로 봐요."""
    if creds is None:
        return None
    user_id = decode_user_id(creds.credentials)
    return session.get(User, user_id) if user_id is not None else None
