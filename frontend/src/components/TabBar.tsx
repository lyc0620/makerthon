import { type Tab, useUi } from '../store/ui'

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'map', label: '지도', icon: '🗺️' },
  { key: 'restaurant', label: '맛집', icon: '🍜' },
  { key: 'meetup', label: '밥친구', icon: '🍚' },
  { key: 'seminars', label: '세미나', icon: '🎤' },
  { key: 'bus', label: '버스', icon: '⭐' },
]
// 지도 위 "제보"·"길찾기" 버튼으로 연 화면은 하단 탭에서는 '지도'로 보인다
const shownTab = (t: Tab): Tab => (t === 'report' || t === 'route' ? 'map' : t)

export default function TabBar() {
  const tab = useUi((s) => s.tab)
  const setTab = useUi((s) => s.setTab)
  const select = useUi((s) => s.select)

  return (
    <nav className="relative z-20 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
      {TABS.map(({ key, label, icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => {
            setTab(key)
            select(null)
          }}
          aria-current={shownTab(tab) === key ? 'page' : undefined}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
            shownTab(tab) === key ? 'font-semibold text-slate-900' : 'text-slate-400'
          }`}
        >
          <span className="text-lg" aria-hidden>
            {icon}
          </span>
          {label}
        </button>
      ))}
    </nav>
  )
}
