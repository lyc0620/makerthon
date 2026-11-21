# 통합 담당(lyc0620) 영역의 임시 대역 — 통합 때 그쪽 파일로 교체
"""공통 에러 형식: {"error": {"code", "message", "details"?}}"""

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("hyeonpung")

# HTTP 상태코드 → 에러 코드
STATUS_CODES = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMITED",
    500: "INTERNAL_ERROR",
    502: "UPSTREAM_ERROR",
}

DEFAULT_MESSAGES = {
    400: "요청이 올바르지 않아요.",
    401: "로그인이 필요해요.",
    403: "권한이 없어요.",
    404: "찾을 수 없어요.",
    405: "지원하지 않는 요청 방식이에요.",
    409: "이미 처리된 요청이에요.",
    422: "입력값을 확인해 주세요.",
    429: "잠시 후 다시 시도해 주세요.",
    500: "서버에 문제가 생겼어요.",
    502: "외부 서비스 연결에 실패했어요.",
}


class AppError(Exception):
    """라우터에서 이걸 raise 하면 공통 에러 형식으로 응답해요."""

    def __init__(self, code: str, status: int, message: str, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.code = code
        self.status = status
        self.message = message
        self.details = details


def error_body(code: str, message: str, details: dict | None = None) -> dict:
    body: dict[str, Any] = {"code": code, "message": message}
    if details is not None:
        body["details"] = details
    return {"error": body}


def _code_for(status: int) -> str:
    if status in STATUS_CODES:
        return STATUS_CODES[status]
    return "INTERNAL_ERROR" if status >= 500 else "BAD_REQUEST"


async def _app_error(_req: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(error_body(exc.code, exc.message, exc.details), status_code=exc.status)


async def _http_error(_req: Request, exc: StarletteHTTPException) -> JSONResponse:
    # FastAPI 기본 영어 메시지("Not Found" 등)는 한국어 기본 문구로 바꿔요
    message = DEFAULT_MESSAGES.get(exc.status_code, "요청을 처리하지 못했어요.")
    return JSONResponse(
        error_body(_code_for(exc.status_code), message),
        status_code=exc.status_code,
        headers=getattr(exc, "headers", None),
    )


async def _validation_error(_req: Request, exc: RequestValidationError) -> JSONResponse:
    fields = [{"loc": [str(p) for p in e.get("loc", [])], "msg": e.get("msg", "")} for e in exc.errors()]
    return JSONResponse(
        jsonable_encoder(error_body("VALIDATION_ERROR", DEFAULT_MESSAGES[422], {"fields": fields})),
        status_code=422,
    )


async def _unhandled(_req: Request, exc: Exception) -> JSONResponse:
    logger.exception("처리하지 못한 오류", exc_info=exc)
    return JSONResponse(error_body("INTERNAL_ERROR", DEFAULT_MESSAGES[500]), status_code=500)


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, _app_error)
    app.add_exception_handler(StarletteHTTPException, _http_error)
    app.add_exception_handler(RequestValidationError, _validation_error)
    app.add_exception_handler(Exception, _unhandled)


# 자주 쓰는 에러를 짧게 만드는 함수들
def not_found(message: str = "찾을 수 없어요.") -> AppError:
    return AppError("NOT_FOUND", 404, message)


def forbidden(message: str) -> AppError:
    return AppError("FORBIDDEN", 403, message)


def conflict(message: str, details: dict | None = None) -> AppError:
    return AppError("CONFLICT", 409, message, details)


def validation(message: str) -> AppError:
    return AppError("VALIDATION_ERROR", 422, message)
