import { useSeminar, useSeminars } from '../api/hooks/seminars'
import { ErrorMessage, Loading } from '../components/QueryState'
import {
  CATEGORY_COLOR,
  CATEGORY_LABEL,
  formatDateTime,
  formatDay,
  formatStartTime,
  formatTime,
} from '../lib/format'
import { useUi } from '../store/ui'

export default function SeminarSheet({ id }: { id: string }) {
  const { data: s, isPending, isError, error } = useSeminar(id)
  const select = useUi((st) => st.select)
  // 같은 건물의 다른 세미나 (지도 마커가 건물 단위로 묶여 있으므로)
  const siblings = useSeminars(
    s?.building_id ? { building_id: s.building_id } : {},
  ).data?.items.filter((x) => s?.building_id && x.id !== s.id)

  if (isPending) return <Loading />
  if (isError) return <ErrorMessage error={error} />

  return (
    <article>
      <span
        className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${CATEGORY_COLOR[s.category]}`}
      >
        {CATEGORY_LABEL[s.category]}
      </span>
      <h2 className="mt-1 text-lg leading-snug font-bold">{s.title}</h2>

      <dl className="mt-3 grid grid-cols-[3.5rem_1fr] gap-y-1.5 text-sm">
        <dt className="text-slate-400">일시</dt>
        <dd>
          {formatStartTime(s.start_at) === '종일'
            ? `${formatDay(s.start_at)} (시간 미정)`
            : formatDateTime(s.start_at)}
          {s.end_at && ` ~ ${formatTime(s.end_at)}`}
        </dd>
        <dt className="text-slate-400">장소</dt>
        <dd>
          {s.place_raw ?? '-'}
          {!s.building_id && s.place_raw && (
            <span className="ml-1 text-xs text-slate-400">(지도 위치 없음)</span>
          )}
        </dd>
        <dt className="text-slate-400">주최</dt>
        <dd>{s.host ?? '-'}</dd>
      </dl>

      {s.source_url && (
        <a
          href={s.source_url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block text-sm font-medium text-indigo-600"
        >
          원문 보기 →
        </a>
      )}

      {siblings && siblings.length > 0 && (
        <section className="mt-4 border-t border-slate-100 pt-3">
          <h3 className="mb-1 text-xs font-semibold text-slate-500">같은 건물의 다른 일정</h3>
          <ul>
            {siblings.map((x) => (
              <li key={x.id}>
                <button
                  type="button"
                  onClick={() => select({ type: 'seminar', id: x.id })}
                  className="w-full truncate py-1 text-left text-sm text-slate-700"
                >
                  <span className="mr-2 text-slate-400 tabular-nums">
                    {formatDateTime(x.start_at)}
                  </span>
                  {x.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  )
}
