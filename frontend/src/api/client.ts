import type { ApiErrorBody, ApiErrorCode } from './types'

export class ApiError extends Error {
  readonly status: number
  readonly code: ApiErrorCode

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

type Params = Record<string, string | number | undefined | null>

const BASE = '/api/v1'

function buildUrl(path: string, params?: Params) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
  }
  const q = qs.toString()
  return `${BASE}${path}${q ? `?${q}` : ''}`
}

export async function apiGet<T>(path: string, params?: Params, signal?: AbortSignal): Promise<T> {
  let res: Response
  try {
    res = await fetch(buildUrl(path, params), { signal })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError(0, 'INTERNAL_ERROR', '서버에 연결할 수 없습니다.')
  }
  if (res.ok) return (await res.json()) as T

  let body: Partial<ApiErrorBody> = {}
  try {
    body = await res.json()
  } catch {
    /* JSON 이 아닌 에러 (프록시 등) */
  }
  throw new ApiError(
    res.status,
    body.error?.code ?? 'INTERNAL_ERROR',
    body.error?.message ?? `요청 실패 (${res.status})`,
  )
}
