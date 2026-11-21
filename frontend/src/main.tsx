// 앱 시작점이에요.
// 지금은 DB 파트 혼자 확인용 DevApp(임시)을 그려요.
// 통합 때는 lyc0620님의 App으로 바꾸고, QueryClientProvider는 그대로 써요.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { handleUnauthorized } from "./api/hooks/db";
import { DevApp } from "./dev/DevApp";
import "./index.css";

// 토큰이 만료돼 401이 오면 자동으로 로그아웃하고 캐시를 정리해요.
const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: (err) => handleUnauthorized(queryClient, err) }),
  mutationCache: new MutationCache({ onError: (err) => handleUnauthorized(queryClient, err) }),
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <DevApp />
    </QueryClientProvider>
  </StrictMode>,
);
