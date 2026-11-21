import { ApiError } from '../api/client'

export function Loading() {
  return <p className="py-4 text-center text-sm text-slate-400">불러오는 중…</p>
}

export function ErrorMessage({ error }: { error: unknown }) {
  const msg = error instanceof ApiError ? error.message : '알 수 없는 오류가 발생했습니다.'
  return <p className="py-4 text-center text-sm text-rose-600">{msg}</p>
}
