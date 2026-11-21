import type { SeminarCategory } from '../api/types'

const TZ = 'Asia/Seoul'

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: TZ,
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

export function formatTime(iso: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

/** 세미나 시작 시각. 공지에 시각이 없어 00:00 으로 저장된 경우 "종일" */
export function formatStartTime(iso: string) {
  const t = formatTime(iso)
  return t === '00:00' ? '종일' : t
}

/** 날짜 키 (YYYY-MM-DD, 서울 기준) — 목록 묶음용 */
export function dayKey(iso: string) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date(iso))
}

export function formatDay(iso: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: TZ,
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date(iso))
}

export function formatEta(min: number) {
  if (min <= 0) return '곧 도착'
  if (min < 60) return `${min}분`
  return `${Math.floor(min / 60)}시간 ${min % 60}분`
}

export const CATEGORY_LABEL: Record<SeminarCategory, string> = {
  seminar: '세미나',
  lecture: '강연',
  event: '행사',
  other: '기타',
}

export const CATEGORY_COLOR: Record<SeminarCategory, string> = {
  seminar: 'bg-indigo-100 text-indigo-700',
  lecture: 'bg-emerald-100 text-emerald-700',
  event: 'bg-amber-100 text-amber-800',
  other: 'bg-slate-100 text-slate-600',
}
