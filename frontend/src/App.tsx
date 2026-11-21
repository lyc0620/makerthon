import { usePresenceHeartbeat, useRealtime } from './api/hooks/db'
import AccountButton from './components/AccountButton'
import BottomSheet from './components/BottomSheet'
import DbPanel from './components/DbPanel'
import { InviteToast } from './components/db/InviteToast'
import { DbToaster } from './components/db/Toaster'
import LayerToggle from './components/LayerToggle'
import TabBar from './components/TabBar'
import BusLayer from './layers/BusLayer'
import CampusBuildingsLayer from './layers/CampusBuildingsLayer'
import { MeetupLayer } from './layers/MeetupLayer'
import { RoomLayer } from './layers/RoomLayer'
import { RouteLayer } from './layers/RouteLayer'
import { RunningLayer } from './layers/RunningLayer'
import { PresenceLayer } from './layers/PresenceLayer'
import { ReportLayer } from './layers/ReportLayer'
import { RestaurantLayer } from './layers/RestaurantLayer'
import SeminarLayer from './layers/SeminarLayer'
import MapView from './map/MapView'
import { useDbNavStore } from './store/db'
import { useUi } from './store/ui'
import BusFavoritesTab from './tabs/BusFavoritesTab'
import SeminarListTab from './tabs/SeminarListTab'

// 지도가 보이는 탭 (세미나·버스 탭은 지도를 덮는 목록 화면)
const MAP_TABS = new Set(['map', 'restaurant', 'meetup', 'report', 'route'])

export default function App() {
  const layers = useUi((s) => s.layers)
  const tab = useUi((s) => s.tab)
  const setTab = useUi((s) => s.setTab)
  const select = useUi((s) => s.select)
  const showHotspots = useDbNavStore((s) => s.showHotspots)
  const navMode = useUi((s) => s.navMode)
  const navOpen = tab === 'route'

  // DB 파트: 실시간 알림 웹소켓(로그인하면 토큰을 붙여 다시 연결) + "지금 밥 먹을래요" 위치 신호
  useRealtime()
  usePresenceHeartbeat()

  return (
    <div className="flex h-dvh flex-col">
      {/* isolate: 지도 마커의 z-index 가 바텀시트·패널 위로 올라오지 않게 */}
      <main className="relative isolate flex-1 overflow-hidden">
        {/* 지도는 탭을 바꿔도 언마운트하지 않는다 (위치·줌 유지) */}
        <MapView>
          <CampusBuildingsLayer visible />
          <BusLayer visible={layers.bus} />
          <SeminarLayer visible={layers.seminar} />
          {/* DB 파트 레이어 (맛집·제보·밥약속·지금 밥 먹을 사람) */}
          <RestaurantLayer visible={layers.restaurant} onSelect={select} />
          <MeetupLayer visible={layers.meetup} onSelect={select} />
          <ReportLayer visible={layers.report} onSelect={select} showHotspots={showHotspots} />
          <PresenceLayer visible={layers.meetup} onSelect={select} />
          {/* 길찾기·러닝·강의실 (김도현): 길찾기 패널의 해당 화면이 열려 있을 때만 (지도 클릭을 쓰므로) */}
          <RouteLayer visible={navOpen && navMode === 'route'} />
          <RunningLayer visible={navOpen && navMode === 'run'} />
          <RoomLayer visible={navOpen && navMode === 'room'} />
        </MapView>

        {MAP_TABS.has(tab) && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center gap-2 pr-3">
            <LayerToggle />
            <AccountButton />
          </div>
        )}
        {/* 경찰 제보·길찾기는 지도에서 하는 기능이라 하단 탭 대신 지도 위 버튼으로 연다 */}
        {tab === 'map' && (
          <div className="absolute bottom-6 left-4 z-10 flex gap-2">
            {(
              [
                ['report', '🚨', '제보'],
                ['route', '🧭', '길찾기'],
              ] as const
            ).map(([key, icon, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  select(null)
                  setTab(key)
                }}
                className="press flex items-center gap-1.5 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-slate-800 shadow-float"
              >
                <span aria-hidden>{icon}</span> {label}
              </button>
            ))}
          </div>
        )}
        {tab === 'seminars' && <SeminarListTab />}
        {tab === 'bus' && <BusFavoritesTab />}

        <DbPanel />
        <BottomSheet />
      </main>
      <TabBar />

      {/* 알림 토스트·"같이 먹자" 제안 카드 (화면 맨 위) */}
      <DbToaster />
      <InviteToast onSelect={select} />
    </div>
  )
}
