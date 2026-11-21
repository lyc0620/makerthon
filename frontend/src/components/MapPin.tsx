// 지도 위 표시용 공통 맵핀 (물방울 모양). <Marker anchor="bottom"> 안에 넣으면 핀 끝이 위치를 가리킨다.
// 버스·세미나·맛집·밥약속·제보가 모두 이 모양을 쓴다 (색과 아이콘만 다르게).
import type { MouseEvent } from 'react'

type Props = {
  icon: string
  color: string // 핀 색
  activeColor: string // 선택됐을 때 색
  active?: boolean
  count?: number // 2 이상이면 오른쪽 위에 개수 배지
  badge?: string // 개수 대신 짧은 글자 배지 (예: 별점 "4.5")
  dim?: number // 불투명도 0~1 (예: 신뢰도 낮은 제보는 흐리게)
  pulse?: boolean // 핀 끝에서 퍼지는 동그라미 (새 제보 등)
  label: string // 화면 읽기용 이름
  title?: string
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
  onFocus?: () => void
  onBlur?: () => void
}

export default function MapPin({
  icon,
  color,
  activeColor,
  active = false,
  count,
  badge,
  dim,
  pulse = false,
  label,
  title,
  onClick,
  onFocus,
  onBlur,
}: Props) {
  const corner = badge ?? (count !== undefined && count > 1 ? String(count) : null)
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={title}
      onClick={onClick}
      onFocus={onFocus}
      onBlur={onBlur}
      style={dim !== undefined && !active ? { opacity: dim } : undefined}
      className={`relative block h-[42px] w-8 origin-bottom drop-shadow-[0_3px_3px_rgba(0,0,0,0.35)] transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
        active ? 'scale-125' : 'hover:scale-110'
      }`}
    >
      {pulse && (
        <span
          aria-hidden
          className="report-pulse absolute -bottom-2 left-1/2 -ml-2 size-4 rounded-full"
          style={{ background: color }}
        />
      )}
      <svg viewBox="0 0 32 42" className="absolute inset-0 size-full" aria-hidden>
        <path
          d="M16 1C7.7 1 1 7.6 1 15.8 1 26.9 16 41 16 41s15-14.1 15-25.2C31 7.6 24.3 1 16 1z"
          fill={active ? activeColor : color}
          stroke="#ffffff"
          strokeWidth="2"
        />
        <circle cx="16" cy="15.5" r="10" fill="#ffffff" />
      </svg>
      <span
        aria-hidden
        className="absolute top-[5px] left-0 w-full text-center text-[13px] leading-[21px]"
      >
        {icon}
      </span>
      {corner && (
        <span className="absolute -top-1.5 -right-2 min-w-[18px] rounded-full border-2 border-white bg-rose-500 px-1 text-center text-[10px] leading-[14px] font-bold text-white">
          {corner}
        </span>
      )}
    </button>
  )
}

/** 레이어별 핀 색 (한곳에서 관리) */
export const PIN_COLORS = {
  bus: ['#0ea5e9', '#0369a1'],
  seminar: ['#6366f1', '#4338ca'],
  restaurant: ['#f97316', '#c2410c'],
  meetup: ['#eab308', '#a16207'],
  report: ['#ef4444', '#b91c1c'],
} as const
