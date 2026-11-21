import { useBusArrivals, useBusStops } from '../api/hooks/bus'
import ArrivalList from '../components/ArrivalList'
import { ErrorMessage, Loading } from '../components/QueryState'
import { formatTime } from '../lib/format'
import { useUi } from '../store/ui'

export default function BusFavoritesTab() {
  const favorites = useUi((s) => s.favoriteStops)
  const toggleFavorite = useUi((s) => s.toggleFavoriteStop)
  const stops = useBusStops()
  const arrivals = useBusArrivals(favorites)

  const stopName = (id: string) => stops.data?.items.find((s) => s.id === id)?.name ?? id
  const others = stops.data?.items.filter((s) => !favorites.includes(s.id)) ?? []

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-slate-50">
      <header className="bg-white px-4 pt-4 pb-3 shadow-sm">
        <h1 className="text-lg font-bold">버스 즐겨찾기</h1>
        {arrivals.data?.updated_at && (
          <p className="text-xs text-slate-400">
            {formatTime(arrivals.data.updated_at)} 기준 · 30초마다 갱신
          </p>
        )}
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {arrivals.data?.is_stale && (
          <p className="rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
            실시간 정보가 지연되고 있어요.
          </p>
        )}

        {favorites.length === 0 && (
          <p className="py-4 text-center text-sm text-slate-400">
            아래에서 정류장을 추가하거나, 지도에서 정류장을 눌러 ☆를 눌러 주세요.
          </p>
        )}

        {favorites.length > 0 &&
          (arrivals.isPending ? (
            <Loading />
          ) : arrivals.isError ? (
            <ErrorMessage error={arrivals.error} />
          ) : (
            arrivals.data.items.map((item) => (
              <section key={item.stop_id} className="rounded-xl bg-white p-3 shadow-sm">
                <header className="mb-1 flex items-center justify-between">
                  <h2 className="font-semibold">{stopName(item.stop_id)}</h2>
                  <button
                    type="button"
                    onClick={() => toggleFavorite(item.stop_id)}
                    className="text-sm text-amber-500"
                    aria-label="즐겨찾기 해제"
                  >
                    ★
                  </button>
                </header>
                <ArrivalList arrivals={item.arrivals} />
              </section>
            ))
          ))}

        {others.length > 0 && (
          <section>
            <h2 className="mb-1.5 text-xs font-semibold text-slate-500">정류장 추가</h2>
            <ul className="flex flex-wrap gap-2">
              {others.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => toggleFavorite(s.id)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-600"
                  >
                    ☆ {s.name}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
