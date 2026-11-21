// 지도 위 표시용 공통 맵핀 (물방울 모양). <Marker anchor="bottom"> 안에 넣으면 핀 끝이 위치를 가리킨다.
// 팀원 레이어(맛집·제보 등)도 색과 아이콘만 바꿔 이걸 쓰면 모양이 통일된다.
type Props = {
  icon: string
  color: string // 핀 색
  activeColor: string // 선택됐을 때 색
  active?: boolean
  count?: number // 2 이상이면 오른쪽 위에 개수 배지
  label: string // 화면 읽기용 이름
}

export default function MapPin({ icon, color, activeColor, active = false, count, label }: Props) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      className={`relative block h-[42px] w-8 origin-bottom drop-shadow-[0_3px_3px_rgba(0,0,0,0.35)] transition-transform ${
        active ? 'scale-125' : 'hover:scale-110'
      }`}
    >
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
      {count !== undefined && count > 1 && (
        <span className="absolute -top-1.5 -right-2 min-w-[18px] rounded-full border-2 border-white bg-rose-500 px-1 text-center text-[10px] leading-[14px] font-bold text-white">
          {count}
        </span>
      )}
    </button>
  )
}
