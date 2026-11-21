// 밥친구 훅 (6.8). 목록은 30초마다 다시 불러와요.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, toQuery } from "../../clientDb";
import type {
  CreateMeetupRequest,
  ListResponse,
  Meetup,
  MeetupMessage,
  MeetupQuery,
  MeetupSuggestion,
  QuickMeetupRequest,
} from "../../types.db";
import { dbKeys } from "./keys";

const DEFAULT_QUERY: MeetupQuery = { within_hours: 72, include_full: true };

export function useMeetups(q: MeetupQuery = DEFAULT_QUERY) {
  return useQuery({
    queryKey: dbKeys.meetupList(q),
    queryFn: ({ signal }) => apiFetch<ListResponse<Meetup>>(`/meetups${toQuery(q)}`, { signal }),
    refetchInterval: 30_000,
  });
}

export function useMeetup(id: string | null | undefined) {
  return useQuery({
    queryKey: dbKeys.meetup(id ?? ""),
    queryFn: ({ signal }) => apiFetch<Meetup>(`/meetups/${id}`, { signal }),
    enabled: !!id,
    refetchInterval: 30_000,
  });
}

/** 방 정보가 바뀌면 상세 캐시를 바로 바꾸고, 목록과 가게 상세(다가오는 밥약속)는 다시 불러요. */
export function useMeetupWriter() {
  const qc = useQueryClient();
  return (m: Meetup) => {
    qc.setQueryData(dbKeys.meetup(m.id), m);
    qc.invalidateQueries({ queryKey: dbKeys.meetupLists });
    qc.invalidateQueries({ queryKey: dbKeys.meetupSuggestionLists });
    if (m.restaurant_id) qc.invalidateQueries({ queryKey: dbKeys.restaurant(m.restaurant_id) });
  };
}

export function useCreateMeetup() {
  const write = useMeetupWriter();
  return useMutation({
    mutationFn: (body: CreateMeetupRequest) => apiFetch<Meetup>("/meetups", { method: "POST", body }),
    onSuccess: write,
  });
}

/** ⚡ 번개 약속 (6.11) — 시간 칩 하나와 장소 하나만 골라서 바로 만들어요. 제목은 서버가 지어 줘요. */
export function useQuickMeetup() {
  const write = useMeetupWriter();
  return useMutation({
    mutationFn: (body: QuickMeetupRequest) =>
      apiFetch<Meetup>("/meetups/quick", { method: "POST", body: { max_people: 4, ...body } }),
    onSuccess: write,
  });
}

/**
 * 지금 참여하기 좋은 약속 추천 (최대 5개, 2시간 안·가까운 순).
 * lat,lng가 없으면 부르지 않아요. 밥친구 목록처럼 30초마다 다시 불러요.
 */
export function useMeetupSuggestions(lat: number | null | undefined, lng: number | null | undefined) {
  const ready = typeof lat === "number" && typeof lng === "number";
  return useQuery({
    queryKey: dbKeys.meetupSuggestions(lat ?? 0, lng ?? 0),
    queryFn: ({ signal }) =>
      apiFetch<ListResponse<MeetupSuggestion>>(
        // 약 100m 단위로 줄여서 보내요. 주소는 접속 기록에 남을 수 있어서 정확한 좌표를 싣지 않아요.
        `/meetups/suggestions${toQuery({ lat: lat?.toFixed(3), lng: lng?.toFixed(3) })}`,
        { signal },
      ),
    enabled: ready,
    refetchInterval: 30_000,
  });
}

export function useJoinMeetup() {
  const write = useMeetupWriter();
  return useMutation({
    mutationFn: (id: string) => apiFetch<Meetup>(`/meetups/${id}/join`, { method: "POST" }),
    onSuccess: write,
  });
}

export function useLeaveMeetup() {
  const write = useMeetupWriter();
  return useMutation({
    mutationFn: (id: string) => apiFetch<Meetup>(`/meetups/${id}/leave`, { method: "POST" }),
    onSuccess: write,
  });
}

/**
 * 채팅 메시지 (참여자만 볼 수 있어요. 비참여자는 403).
 * enabled=false면 부르지 않아요. WebSocket이 꺼져 있어도 보이도록 10초마다 다시 불러요.
 */
export function useMeetupMessages(id: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: dbKeys.meetupMessages(id ?? ""),
    queryFn: ({ signal }) =>
      apiFetch<ListResponse<MeetupMessage>>(`/meetups/${id}/messages`, { signal }),
    enabled: !!id && enabled,
    refetchInterval: 10_000,
  });
}

export function useSendMessage(meetupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      apiFetch<MeetupMessage>(`/meetups/${meetupId}/messages`, {
        method: "POST",
        body: { content },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: dbKeys.meetupMessages(meetupId) }),
  });
}
