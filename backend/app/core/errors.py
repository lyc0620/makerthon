import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger(__name__)

STATUS_CODES = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    422: "VALIDATION_ERROR",
    500: "INTERNAL_ERROR",
    502: "UPSTREAM_ERROR",
}


class ApiError(Exception):
    """라우터에서 raise ApiError(404, "세미나를 찾을 수 없습니다.") 로 사용."""

    def __init__(self, status_code: int, message: str, code: str | None = None):
        self.status_code = status_code
        self.code = code or STATUS_CODES.get(status_code, "INTERNAL_ERROR")
        self.message = message


def error_body(code: str, message: str) -> dict:
    return {"error": {"code": code, "message": message}}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError):
        return JSONResponse(error_body(exc.code, exc.message), status_code=exc.status_code)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException):
        code = STATUS_CODES.get(
            exc.status_code, "BAD_REQUEST" if exc.status_code < 500 else "INTERNAL_ERROR"
        )
        message = exc.detail if isinstance(exc.detail, str) else code
        return JSONResponse(error_body(code, message), status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError):
        parts = []
        for err in exc.errors():
            loc = ".".join(str(p) for p in err.get("loc", ()) if p not in ("query", "body", "path"))
            parts.append(f"{loc}: {err.get('msg')}" if loc else str(err.get("msg")))
        return JSONResponse(error_body("VALIDATION_ERROR", "; ".join(parts)), status_code=422)

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception):
        log.exception("unhandled error", exc_info=exc)
        return JSONResponse(
            error_body("INTERNAL_ERROR", "서버 오류가 발생했습니다."), status_code=500
        )
