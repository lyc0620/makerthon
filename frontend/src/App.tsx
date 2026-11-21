import BottomSheet from './components/BottomSheet'
import LayerToggle from './components/LayerToggle'
import TabBar from './components/TabBar'
import CampusBuildingsLayer from './layers/CampusBuildingsLayer'
import BusLayer from './layers/BusLayer'
import SeminarLayer from './layers/SeminarLayer'
import MapView from './map/MapView'
import { useUi } from './store/ui'
import BusFavoritesTab from './tabs/BusFavoritesTab'
import SeminarListTab from './tabs/SeminarListTab'

export default function App() {
  const layers = useUi((s) => s.layers)
  const tab = useUi((s) => s.tab)

  return (
    <div className="flex h-dvh flex-col">
      <main className="relative flex-1 overflow-hidden">
        {/* 지도는 탭을 바꿔도 언마운트하지 않는다 (위치·줌 유지) */}
        <MapView>
          {/* 캠퍼스 건물 박스 (항상). 3D 토글은 기울기·지형만 바꾼다 */}
          <CampusBuildingsLayer visible />
          <BusLayer visible={layers.bus} />
          <SeminarLayer visible={layers.seminar} />
          {/* 팀원 레이어: <RestaurantLayer visible={layers.restaurant} /> ... */}
        </MapView>

        {tab === 'map' && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10">
            <LayerToggle />
          </div>
        )}
        {tab === 'seminars' && <SeminarListTab />}
        {tab === 'bus' && <BusFavoritesTab />}

        <BottomSheet />
      </main>
      <TabBar />
    </div>
  )
}
