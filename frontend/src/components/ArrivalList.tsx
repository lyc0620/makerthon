import type { BusArrival } from '../api/types'
import { formatEta, formatTime } from '../lib/format'

export default function ArrivalList({ arrivals }: { arrivals: BusArrival[] }) {
  if (arrivals.length === 0) {
    return <p className="py-2 text-sm text-slate-400">도착 예정 버스가 없습니다.</p>
  }
  return (
    <ul className="divide-y divide-slate-100">
      {arrivals.map((a, i) => (
        <li key={`${a.route}-${a.direction}-${i}`} className="flex items-center gap-3 py-2">
          <span
            className={`min-w-14 rounded-md px-2 py-0.5 text-center text-xs font-bold ${
              a.route_type === 'shuttle'
                ? 'bg-violet-100 text-violet-700'
                : 'bg-sky-100 text-sky-700'
            }`}
          >
            {a.route}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-slate-700">{a.direction ?? '-'}</p>
            <p className="text-xs text-slate-400">
              {a.source === 'timetable'
                ? `시간표 · ${a.departure_time ? formatTime(a.departure_time) : ''} 출발`
                : a.stops_left !== null
                  ? `${a.stops_left}정류장 전`
                  : '실시간'}
            </p>
          </div>
          <span
            className={`text-base font-bold tabular-nums ${a.eta_min <= 3 ? 'text-rose-600' : 'text-slate-900'}`}
          >
            {formatEta(a.eta_min)}
          </span>
        </li>
      ))}
    </ul>
  )
}
