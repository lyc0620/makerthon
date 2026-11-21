import { useEffect } from 'react'

import BusStopSheet from '../sheets/BusStopSheet'
import SeminarSheet from '../sheets/SeminarSheet'
import { useUi } from '../store/ui'

/** 선택된 항목의 type 에 따라 sheets/ 의 상세 화면을 보여준다. */
export default function BottomSheet() {
  const selected = useUi((s) => s.selected)
  const select = useUi((s) => s.select)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && select(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [select])

  if (!selected) return null

  let content
  switch (selected.type) {
    case 'bus_stop':
      content = <BusStopSheet id={selected.id} />
      break
    case 'seminar':
      content = <SeminarSheet id={selected.id} />
      break
    default:
      content = <p className="text-sm text-slate-500">준비 중인 기능입니다.</p>
  }

  return (
    <section
      role="dialog"
      aria-modal="false"
      className="absolute inset-x-0 bottom-0 z-10 max-h-[60%] overflow-y-auto rounded-t-2xl bg-white px-4 pt-2 pb-4 shadow-[0_-4px_24px_rgba(0,0,0,0.12)]"
    >
      <div className="sticky top-0 -mx-4 flex items-center justify-center bg-white pb-2">
        <span className="h-1.5 w-10 rounded-full bg-slate-300" aria-hidden />
        <button
          type="button"
          onClick={() => select(null)}
          aria-label="닫기"
          className="absolute top-0 right-3 rounded-full px-2 text-xl leading-none text-slate-400"
        >
          ×
        </button>
      </div>
      {content}
    </section>
  )
}
