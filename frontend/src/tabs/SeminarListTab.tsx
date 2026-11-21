import { useMemo, useState } from 'react'

import { useSeminars } from '../api/hooks/seminars'
import type { Seminar, SeminarCategory } from '../api/types'
import { ErrorMessage, Loading } from '../components/QueryState'
import {
  CATEGORY_COLOR,
  CATEGORY_LABEL,
  dayKey,
  formatDay,
  formatStartTime,
  formatTime,
} from '../lib/format'
import { useUi } from '../store/ui'

const FILTERS: (SeminarCategory | 'all')[] = ['all', 'seminar', 'lecture', 'event', 'other']

export default function SeminarListTab() {
  const [category, setCategory] = useState<SeminarCategory | 'all'>('all')
  const [q, setQ] = useState('')
  const { data, isPending, isError, error } = useSeminars({
    category: category === 'all' ? undefined : category,
    q: q.trim() || undefined,
  })
  const select = useUi((s) => s.select)
  const setTab = useUi((s) => s.setTab)

  const byDay = useMemo(() => {
    const m = new Map<string, Seminar[]>()
    for (const s of data?.items ?? []) {
      const k = dayKey(s.start_at)
      m.set(k, [...(m.get(k) ?? []), s])
    }
    return [...m.values()]
  }, [data])

  const open = (s: Seminar) => {
    if (s.building_id) setTab('map') // 위치가 있으면 지도에서 보여준다
    select({ type: 'seminar', id: s.id })
  }

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-slate-50">
      <header className="space-y-2 bg-white px-4 pt-4 pb-3 shadow-sm">
        <h1 className="text-lg font-bold">이번 주 세미나·행사</h1>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="제목·주최 검색"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-400"
        />
        <div className="flex gap-1.5 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setCategory(f)}
              aria-pressed={category === f}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                category === f ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {f === 'all' ? '전체' : CATEGORY_LABEL[f]}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {isPending ? (
          <Loading />
        ) : isError ? (
          <ErrorMessage error={error} />
        ) : byDay.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">예정된 일정이 없습니다.</p>
        ) : (
          byDay.map((list) => (
            <section key={dayKey(list[0].start_at)} className="mt-4">
              <h2 className="mb-1.5 text-xs font-semibold text-slate-500">
                {formatDay(list[0].start_at)}
              </h2>
              <ul className="space-y-2">
                {list.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => open(s)}
                      className="flex w-full gap-3 rounded-xl bg-white p-3 text-left shadow-sm"
                    >
                      <span className="w-11 shrink-0 pt-0.5 text-sm font-semibold tabular-nums">
                        {formatStartTime(s.start_at)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${CATEGORY_COLOR[s.category]}`}
                        >
                          {CATEGORY_LABEL[s.category]}
                        </span>
                        <span className="mt-1 block truncate text-sm font-medium">{s.title}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {s.place_raw ?? '장소 미정'}
                          {s.host && ` · ${s.host}`}
                        </span>
                      </span>
                      {s.building_id && (
                        <span
                          className="self-center text-xs text-indigo-500"
                          aria-label="지도에서 보기"
                        >
                          📍
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
        {data?.updated_at && (
          <p className="mt-4 text-center text-[11px] text-slate-400">
            {formatDay(data.updated_at)} {formatTime(data.updated_at)} 수집
          </p>
        )}
      </div>
    </div>
  )
}
