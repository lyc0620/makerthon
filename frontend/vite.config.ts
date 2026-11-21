import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

// 개발 서버 설정이에요.
// - 내 컴퓨터(localhost)에서만 열려요. (--host 옵션은 쓰지 않아요)
// - /api 로 시작하는 요청은 백엔드(127.0.0.1:8000)로 넘겨요. WebSocket(/api/v1/ws)도 같이 넘어가요.
// - React 플러그인(@vitejs/plugin-react) 대신 esbuild의 자동 JSX 변환을 써요.
//   (설치 목록을 줄이려고 그랬어요. 통합 담당이 플러그인을 넣으면 Fast Refresh가 생겨요.)
export default defineConfig({
  plugins: [tailwindcss()],
  esbuild: { jsx: "automatic" },
  server: {
    host: "localhost",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: { host: "localhost", port: 4173 },
  // maplibre-gl 자체가 1MB 정도라 경고 기준만 올려 둬요.
  build: { chunkSizeWarningLimit: 1200 },
});
