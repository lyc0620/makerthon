"""개발용 로그인 (APP_ENV=dev 일 때만 켜져요).

이메일 인증(통합 담당)이 붙기 전까지 닉네임만으로 토큰을 받아요.
처음 보는 닉네임이면 사용자를 만들고, 이미 있으면 그 사용자의 토큰을 줘요.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.core import timeutil
from app.core.auth import TOKEN_EXPIRES_IN, create_access_token
from app.core.db import get_session
from app.models import User
from app.schemas.auth import DevLoginIn, TokenOut

router = APIRouter(prefix="/api/v1/auth", tags=["인증(개발용)"])


@router.post("/dev-login", response_model=TokenOut, summary="개발용 로그인 (닉네임만)")
def dev_login(body: DevLoginIn, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.nickname == body.nickname)).first()
    if user is None:
        user = User(nickname=body.nickname, created_at=timeutil.now_utc())
        session.add(user)
        try:
            session.commit()
        except IntegrityError:  # 같은 닉네임이 동시에 들어온 경우
            session.rollback()
            user = session.exec(select(User).where(User.nickname == body.nickname)).one()
        session.refresh(user)
    return {"access_token": create_access_token(user.id), "token_type": "bearer", "expires_in": TOKEN_EXPIRES_IN}
