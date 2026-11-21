import { type Tab, useUi } from '../store/ui'

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'map', label: '지도', icon: '🗺️' },
  { key: 'seminars', label: '세미나', icon: '🎤' },
  { key: 'bus', label: '버스', icon: '⭐' },
]

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
          aria-current={tab === key ? 'page' : undefined}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
            tab === key ? 'font-semibold text-slate-900' : 'text-slate-400'
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
