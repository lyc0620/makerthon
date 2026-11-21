import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { chunkSizeWarningLimit: 1200 }, // maplibre-gl 자체가 ~1.1MB
  // maplibre-gl v6 는 자기 옆의 worker 파일을 상대 경로로 불러온다. 사전 번들하면 경로가 깨진다
  optimizeDeps: { exclude: ['maplibre-gl'] },
  server: {
    proxy: {
      // 개발 중: /api → FastAPI (uv run uvicorn app.main:app --port 8000)
      // ws: 실시간 알림 웹소켓(/api/v1/ws)도 같이 넘긴다 (DB 파트)
      '/api': { target: 'http://localhost:8000', ws: true },
    },
  },
})
