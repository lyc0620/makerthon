import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type SelectedItem =
  | { type: 'bus_stop'; id: string }
  | { type: 'seminar'; id: string }
  | { type: 'restaurant'; id: string }
  | { type: 'report'; id: string }
  | { type: 'meetup'; id: string } // DB 파트: 밥약속
  | { type: 'presence'; id: string } // DB 파트: 지금 밥 먹을 사람
  | null

export type LayerKey = 'bus' | 'seminar' | 'restaurant' | 'route' | 'report' | 'meetup'
// 'report' 는 하단 탭이 아니라 지도 위 "제보" 버튼으로 연다 (하단 탭에서는 '지도'로 표시)
export type Tab = 'map' | 'restaurant' | 'meetup' | 'seminars' | 'bus' | 'report' | 'route'
// 'route'(길찾기) 패널 안의 화면: 길찾기 · 러닝 코스 · 강의실 검색
export type NavMode = 'route' | 'run' | 'room'

type UiState = {
  layers: Record<LayerKey, boolean>
  toggleLayer: (key: LayerKey) => void

  selected: SelectedItem
  select: (item: SelectedItem) => void

  tab: Tab
  setTab: (tab: Tab) => void
  navMode: NavMode
  setNavMode: (m: NavMode) => void

  // 버스 즐겨찾기: localStorage 에만 저장 (로그인 불필요)
  favoriteStops: string[]
  toggleFavoriteStop: (id: string) => void
}

// localStorage 가 막힌 환경(사생활 보호 모드 등)에서도 앱이 죽지 않게
const safeStorage = createJSONStorage(() => {
  try {
    const k = '__probe__'
    localStorage.setItem(k, k)
    localStorage.removeItem(k)
    return localStorage
  } catch {
    const mem = new Map<string, string>()
    return {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => void mem.set(k, v),
      removeItem: (k) => void mem.delete(k),
    }
  }
})

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      layers: {
        bus: true,
        seminar: true,
        restaurant: true,
        route: true,
        report: true,
        meetup: true, // 밥약속 + 지금 밥 먹을 사람
      },
      toggleLayer: (key) => set((s) => ({ layers: { ...s.layers, [key]: !s.layers[key] } })),

      selected: null,
      select: (item) => set({ selected: item }),

      tab: 'map',
      setTab: (tab) => set({ tab }),
      navMode: 'route',
      setNavMode: (navMode) => set({ navMode }),

      favoriteStops: [],
      toggleFavoriteStop: (id) =>
        set((s) => ({
          favoriteStops: s.favoriteStops.includes(id)
            ? s.favoriteStops.filter((x) => x !== id)
            : [...s.favoriteStops, id].slice(-10),
        })),
    }),
    {
      name: 'hyeonpung-map-ui',
      storage: safeStorage,
      partialize: (s) => ({ favoriteStops: s.favoriteStops, layers: s.layers }),
      // 예전에 저장된 값에 새 레이어 키가 없어도 기본값(켜짐)을 쓰게 합친다
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<UiState>
        return { ...current, ...p, layers: { ...current.layers, ...(p.layers ?? {}) } }
      },
    },
  ),
)
