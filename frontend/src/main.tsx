import './index.css'

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { ApiError } from './api/client'
import { handleUnauthorized } from './api/hooks/db'
import App from './App'

const queryClient: QueryClient = new QueryClient({
  // 로그인 토큰이 만료돼 401 이 오면 자동으로 로그아웃하고 캐시를 정리한다 (DB 파트)
  queryCache: new QueryCache({ onError: (err) => handleUnauthorized(queryClient, err) }),
  mutationCache: new MutationCache({ onError: (err) => handleUnauthorized(queryClient, err) }),
  defaultOptions: {
    queries: {
      // 4xx 는 다시 시도해도 같으므로 재시도하지 않는다
      retry: (count, err) =>
        !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
