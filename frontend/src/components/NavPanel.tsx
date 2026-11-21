// 지도 위 "🧭 길찾기" 버튼이 여는 패널 안의 내용: 길찾기 · 러닝 코스 · 강의실 검색 (김도현 모듈).
// 길찾기·러닝은 지도 클릭으로 점을 찍으므로, 그 화면이 열려 있을 때만 해당 레이어가 클릭을 받는다 (App.tsx).
import { useEffect, useRef } from 'react'

import { RoomSearchPanel } from '../sheets/RoomSearchPanel'
import { RoutePanel, RunningPanel } from '../sheets/RoutePanel'
import { useRouteStore } from '../store/route'
import { type NavMode, useUi } from '../store/ui'

const MODES: { key: NavMode; label: string; icon: string }[] = [
  { key: 'route', label: '길찾기', icon: '🚶' },
  { key: 'run', label: '러닝 코스', icon: '🏃' },
  { key: 'room', label: '강의실', icon: '🏫' },
]

export default function NavPanel() {
  const navMode = useUi((s) => s.navMode)
  const setNavMode = useUi((s) => s.setNavMode)
  const to = useRouteStore((s) => s.to)

  // 강의실 검색에서 "여기까지 길찾기"를 누르면 도착점이 정해진다 → 길찾기 화면으로 넘어가 경로를 보여 준다
  const lastTo = useRef(to)
  useEffect(() => {
    if (to && to !== lastTo.current && navMode === 'room') setNavMode('route')
    lastTo.current = to
  }, [to, navMode, setNavMode])

  return (
    <div className="space-y-3">
      <nav className="flex gap-1 rounded-2xl bg-slate-100 p-1" aria-label="길찾기 메뉴">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            aria-current={navMode === m.key ? 'page' : undefined}
            onClick={() => setNavMode(m.key)}
            className={`flex flex-1 items-center justify-center gap-1 rounded-xl px-2 py-1.5 text-sm font-bold transition ${
              navMode === m.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600'
            }`}
          >
            <span aria-hidden>{m.icon}</span>
            {m.label}
          </button>
        ))}
      </nav>
      <div key={navMode} className="sheet-fade -mx-3">
        {navMode === 'route' && <RoutePanel />}
        {navMode === 'run' && <RunningPanel />}
        {navMode === 'room' && <RoomSearchPanel />}
      </div>
    </div>
  )
}
