import { useBusArrivals, useBusStops } from '../api/hooks/bus'
import ArrivalList from '../components/ArrivalList'
import { ErrorMessage, Loading } from '../components/QueryState'
import { formatTime } from '../lib/format'
import { useUi } from '../store/ui'

export default function BusStopSheet({ id }: { id: string }) {
  const stop = useBusStops().data?.items.find((s) => s.id === id)
  const arrivals = useBusArrivals([id])
  const favorite = useUi((s) => s.favoriteStops.includes(id))
  const toggleFavorite = useUi((s) => s.toggleFavoriteStop)

  return (
    <div>
      <header className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">{stop?.name ?? '정류장'}</h2>
          <p className="text-xs text-slate-500">{stop?.routes.join(' · ')}</p>
        </div>
        <button
          type="button"
          onClick={() => toggleFavorite(id)}
          aria-pressed={favorite}
          className={`shrink-0 rounded-full border px-3 py-1 text-sm ${
            favorite
              ? 'border-amber-400 bg-amber-50 text-amber-700'
              : 'border-slate-200 text-slate-500'
          }`}
        >
          {favorite ? '★ 즐겨찾기' : '☆ 즐겨찾기'}
        </button>
      </header>

      {arrivals.isPending ? (
        <Loading />
      ) : arrivals.isError ? (
        <ErrorMessage error={arrivals.error} />
      ) : (
        <>
          {arrivals.data.is_stale && (
            <p className="mb-2 rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
              실시간 정보가 지연되고 있어요. 표시된 시간이 정확하지 않을 수 있습니다.
            </p>
          )}
          <ArrivalList arrivals={arrivals.data.items[0]?.arrivals ?? []} />
          {arrivals.data.updated_at && (
            <p className="mt-2 text-right text-[11px] text-slate-400">
              {formatTime(arrivals.data.updated_at)} 기준 · 30초마다 갱신
            </p>
          )}
        </>
      )}
    </div>
  )
}
