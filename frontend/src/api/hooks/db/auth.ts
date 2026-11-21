// 개발용 로그인 훅이에요. 서버가 APP_ENV=dev일 때만 열려요.
// 이메일 인증(통합 담당)이 붙으면 같은 setAuth로 토큰만 넣어 주면 돼요.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { apiFetch, isApiError } from "../../clientDb";
import type { TokenResponse } from "../../types.db";
import { toast, useAuthStore, useInviteStore } from "../../../store/db";
import { dbKeys } from "./keys";
import { sendStopOnExit } from "./presence";

export function useDevLogin() {
  const qc = useQueryClient();
  const setAuth = useAuthStore((s) => s.setAuth);
  return useMutation({
    mutationFn: async (nickname: string) => {
      const name = nickname.trim();
      const res = await apiFetch<TokenResponse>("/auth/dev-login", {
        method: "POST",
        body: { nickname: name },
      });
      return { res, nickname: name };
    },
    onSuccess: ({ res, nickname }) => {
      setAuth(res.access_token, nickname);
      // liked_by_me, my_vote, joined 같은 개인 필드를 다시 받아요.
      qc.invalidateQueries({ queryKey: dbKeys.all });
    },
  });
}

/**
 * 개인 필드(is_mine, liked_by_me, my_vote, joined, is_host)가 담긴 캐시를 정리해요.
 * 채팅은 참여자만 볼 수 있으니 아예 지우고, 나머지는 새 토큰(또는 토큰 없이)으로 다시 받아요.
 */
export function resetPersonalCache(qc: QueryClient) {
  qc.removeQueries({ queryKey: ["db", "meetup-messages"] });
  // 실시간 위치는 로그인한 사람만 볼 수 있어요. 로그아웃하면 화면에 남지 않게 통째로 지워요.
  qc.removeQueries({ queryKey: dbKeys.presence });
  // 받은 "같이 먹자" 카드에는 다른 사람 닉네임·약속이 들어 있어요. 다음 사람에게 보이지 않게 지워요.
  useInviteStore.getState().clear();
  qc.invalidateQueries({ queryKey: dbKeys.all });
}

/** 로그아웃 버튼에서 써요. 토큰을 지우고 캐시도 같이 정리해요. */
export function useLogout() {
  const qc = useQueryClient();
  const logout = useAuthStore((s) => s.logout);
  return () => {
    // 위치 공유 중이면 토큰을 지우기 전에 서버에 끄기 요청부터 보내요.
    sendStopOnExit();
    logout();
    resetPersonalCache(qc);
  };
}

/**
 * 토큰이 있는데 서버가 401을 돌려주면(토큰 만료 등) 로그아웃 처리해요.
 * main.tsx의 QueryCache/MutationCache onError에 연결해 둬요.
 */
export function handleUnauthorized(qc: QueryClient, error: unknown) {
  if (!isApiError(error) || error.status !== 401) return;
  if (!useAuthStore.getState().token) return; // 원래 로그인 안 한 상태면 할 일이 없어요.
  useAuthStore.getState().logout();
  resetPersonalCache(qc);
  toast("로그인이 만료됐어요. 닉네임으로 다시 로그인해 주세요.", "info");
}
