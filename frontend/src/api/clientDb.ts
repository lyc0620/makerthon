// DB 파트용 작은 fetch 래퍼예요.
// ※ 통합 담당의 src/api/client.ts 가 생기면 그걸로 바꿔도 돼요.
//   (같은 에러 형식을 쓰니까 ApiError만 맞춰 주면 훅은 그대로 둘 수 있어요.)

import { getAuthToken } from "../store/db";
import type { ApiErrorBody } from "./types.db";

export const API_BASE = "/api/v1";

/** 서버 에러 형식 { error: { code, message, details? } } 을 담은 에러예요. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

/** 쿼리 객체를 ?a=1&b=2 로 바꿔요. undefined/null/빈 문자열은 빼요. */
export function toQuery(params?: object): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

type Method = "GET" | "POST" | "DELETE" | "PATCH" | "PUT";

export async function apiFetch<T>(
  path: string,
  options: { method?: Method; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw new ApiError(0, "NETWORK_ERROR", "서버에 연결하지 못했어요. 백엔드가 켜져 있는지 확인해 주세요.");
  }

  // 204 No Content (예: 후기 삭제)
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const err = (data as ApiErrorBody | null)?.error;
    if (err && typeof err.code === "string") {
      throw new ApiError(res.status, err.code, err.message || "요청을 처리하지 못했어요.", err.details);
    }
    // JSON이 아닌 5xx는 보통 개발 프록시가 백엔드에 못 붙은 경우예요.
    if (res.status >= 500 && data === null) {
      throw new ApiError(res.status, "NETWORK_ERROR", "서버에 연결하지 못했어요. 백엔드가 켜져 있는지 확인해 주세요.");
    }
    throw new ApiError(res.status, fallbackCode(res.status), `요청을 처리하지 못했어요. (${res.status})`);
  }
  return data as T;
}

function fallbackCode(status: number): string {
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 422) return "VALIDATION_ERROR";
  if (status === 429) return "RATE_LIMITED";
  if (status === 502) return "UPSTREAM_ERROR";
  return "INTERNAL_ERROR";
}

/** 화면에 보여 줄 한국어 에러 문구를 골라요. */
export function errorMessage(e: unknown): string {
  if (isApiError(e)) {
    if (e.code === "UNAUTHORIZED") return "먼저 닉네임으로 로그인해 주세요.";
    return e.message;
  }
  return "알 수 없는 문제가 생겼어요. 잠시 뒤 다시 해 주세요.";
}
