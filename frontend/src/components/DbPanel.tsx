// 맛집·밥친구 탭, 지도 위 "제보" 버튼이 여는 아래쪽 패널 (DB 파트 패널을 담는다).
// 패널 안에서 "지도에서 위치 찍기"를 하므로 세미나·버스 탭처럼 지도를 덮지 않고 아래쪽만 쓴다.
// 위치를 찍는 동안은 패널을 접어 지도가 보이게 한다.
import { useState } from 'react'

import { MeetupPanel } from '../panels/MeetupPanel'
import { ReportPanel } from '../panels/ReportPanel'
import { RestaurantPanel } from '../panels/RestaurantPanel'
import { usePickStore } from '../store/db'
import { type Tab, useUi } from '../store/ui'

const TITLES: Partial<Record<Tab, string>> = {
  restaurant: '🍜 맛집',
  meetup: '🍚 밥친구',
  report: '🚨 경찰 제보',
}

export default function DbPanel() {
  const tab = useUi((s) => s.tab)
  const setTab = useUi((s) => s.setTab)
  const pickLabel = usePickStore((s) => s.label)
  const stopPick = usePickStore((s) => s.stop)
  const [collapsed, setCollapsed] = useState(false)

  if (tab !== 'restaurant' && tab !== 'meetup' && tab !== 'report') return null

  // 위치 찍기 중에는 패널을 숨기고 안내 띠만 보인다.
  // 패널을 언마운트하면 폼이 사라지며 찍기 모드도 취소되므로(useCancelPickOnUnmount) 숨기기만 한다.
  return (
    <>
      {pickLabel && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
          <div
            role="status"
            className="pointer-events-auto flex max-w-full items-center gap-3 rounded-full bg-sun-400 py-2 pr-2 pl-4 text-sm font-bold text-brand-900 shadow-float"
          >
            <span className="min-w-0">
              <span aria-hidden>🗺️ </span>
              {pickLabel}
            </span>
            <button
              type="button"
              onClick={stopPick}
              className="shrink-0 rounded-full bg-white/85 px-3 py-1 text-xs font-bold text-brand-800"
            >
              취소
            </button>
          </div>
        </div>
      )}
      <section
        aria-label={TITLES[tab]}
        hidden={!!pickLabel}
        className={`absolute inset-x-0 bottom-0 z-10 flex flex-col rounded-t-2xl bg-[#f8fafe] shadow-[0_-4px_24px_rgba(0,0,0,0.12)] ${
          collapsed ? '' : 'max-h-[58%]'
        }`}
      >
        <header className="flex items-center gap-2 px-4 pt-2 pb-2">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? '패널 펼치기' : '패널 접기'}
            className="flex flex-1 flex-col items-center gap-1.5"
          >
            <span className="h-1.5 w-10 rounded-full bg-slate-300" aria-hidden />
            <span className="self-start text-base font-extrabold text-brand-900">
              {TITLES[tab]}
            </span>
          </button>
          {tab === 'report' && (
            <button
              type="button"
              onClick={() => setTab('map')}
              aria-label="제보 닫기"
              className="rounded-full px-2 text-xl leading-none text-slate-400"
            >
              ×
            </button>
          )}
        </header>
        {!collapsed && (
          <div key={tab} className="sheet-fade min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {tab === 'restaurant' && <RestaurantPanel />}
            {tab === 'meetup' && <MeetupPanel />}
            {tab === 'report' && <ReportPanel />}
          </div>
        )}
      </section>
    </>
  )
}
