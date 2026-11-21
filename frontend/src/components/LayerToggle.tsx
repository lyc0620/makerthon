import { type LayerKey, useUi } from '../store/ui'

// 팀원 레이어가 붙으면 여기에 추가
const ITEMS: { key: LayerKey; label: string; icon: string }[] = [
  { key: 'bus', label: '버스', icon: '🚌' },
  { key: 'seminar', label: '세미나', icon: '🎤' },
]

export default function LayerToggle() {
  const layers = useUi((s) => s.layers)
  const toggle = useUi((s) => s.toggleLayer)

  return (
    <div className="pointer-events-auto flex gap-2 overflow-x-auto px-4 py-3">
      {ITEMS.map(({ key, label, icon }) => {
        const on = layers[key]
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(key)}
            className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium shadow-md transition ${
              on ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'
            }`}
          >
            <span aria-hidden>{icon}</span>
            {label}
          </button>
        )
      })}
    </div>
  )
}
