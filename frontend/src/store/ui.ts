import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type SelectedItem =
  | { type: 'bus_stop'; id: string }
  | { type: 'seminar'; id: string }
  | { type: 'restaurant'; id: string }
  | { type: 'report'; id: string }
  | null

export type LayerKey = 'bus' | 'seminar' | 'restaurant' | 'route' | 'report'
export type Tab = 'map' | 'seminars' | 'bus'

type UiState = {
  layers: Record<LayerKey, boolean>
  toggleLayer: (key: LayerKey) => void

  selected: SelectedItem
  select: (item: SelectedItem) => void

  tab: Tab
  setTab: (tab: Tab) => void

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
        report: false,
      },
      toggleLayer: (key) => set((s) => ({ layers: { ...s.layers, [key]: !s.layers[key] } })),

      selected: null,
      select: (item) => set({ selected: item }),

      tab: 'map',
      setTab: (tab) => set({ tab }),

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
    },
  ),
)
