// 맛집 훅 (6.4). 맛집은 자주 안 바뀌어서 staleTime 10분이에요.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, toQuery } from "../../clientDb";
import type {
  CreateRestaurantRequest,
  LikeResponse,
  ListResponse,
  PlaceSearchItem,
  Restaurant,
  RestaurantDetail,
  RestaurantFilters,
  RestaurantMeta,
  Review,
  ReviewInput,
  ReviewSort,
} from "../../types.db";
import { useAuthStore } from "../../../store/db";
import { dbKeys } from "./keys";

const TEN_MIN = 10 * 60 * 1000;

export function useRestaurants(filters: RestaurantFilters = {}) {
  return useQuery({
    queryKey: dbKeys.restaurantList(filters),
    queryFn: ({ signal }) =>
      apiFetch<ListResponse<Restaurant>>(`/restaurants${toQuery(filters)}`, { signal }),
    staleTime: TEN_MIN,
    placeholderData: keepPreviousData,
  });
}

export function useRestaurant(id: string | null | undefined) {
  return useQuery({
    queryKey: dbKeys.restaurant(id ?? ""),
    queryFn: ({ signal }) => apiFetch<RestaurantDetail>(`/restaurants/${id}`, { signal }),
    enabled: !!id,
    staleTime: TEN_MIN,
  });
}

export function useReviews(id: string | null | undefined, sort: ReviewSort = "helpful") {
  return useQuery({
    queryKey: dbKeys.reviews(id ?? "", sort),
    queryFn: ({ signal }) =>
      apiFetch<ListResponse<Review>>(`/restaurants/${id}/reviews${toQuery({ sort })}`, { signal }),
    enabled: !!id,
    staleTime: TEN_MIN,
    placeholderData: keepPreviousData,
  });
}

export function useRestaurantMeta() {
  return useQuery({
    queryKey: dbKeys.restaurantMeta,
    queryFn: ({ signal }) => apiFetch<RestaurantMeta>("/restaurants/meta", { signal }),
    staleTime: Infinity,
  });
}

/** 카카오 장소 검색 (서버 프록시). 로그인 필요, 두 글자 이상일 때만 불러요. */
export function usePlaceSearch(q: string) {
  const token = useAuthStore((s) => s.token);
  const query = q.trim();
  return useQuery({
    queryKey: dbKeys.placeSearch(query),
    queryFn: ({ signal }) =>
      apiFetch<ListResponse<PlaceSearchItem>>(`/restaurants/place-search${toQuery({ q: query })}`, {
        signal,
      }),
    enabled: !!token && query.length >= 2,
    staleTime: 5 * 60 * 1000,
    retry: false, // UPSTREAM_ERROR면 바로 "지도에서 찍기"로 넘어가요
  });
}

export function useCreateRestaurant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateRestaurantRequest) =>
      apiFetch<RestaurantDetail>("/restaurants", { method: "POST", body }),
    onSuccess: (detail) => {
      qc.setQueryData(dbKeys.restaurant(detail.id), detail);
      qc.invalidateQueries({ queryKey: dbKeys.restaurants });
    },
  });
}

export function useCreateReview(restaurantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ReviewInput) =>
      apiFetch<Review>(`/restaurants/${restaurantId}/reviews`, { method: "POST", body }),
    // 평점·태그·목록 순위가 다 바뀌니까 맛집 관련 캐시를 통째로 다시 불러요.
    onSuccess: () => qc.invalidateQueries({ queryKey: dbKeys.restaurants }),
  });
}

export function useToggleLike(restaurantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reviewId: string) =>
      apiFetch<LikeResponse>(`/reviews/${reviewId}/like`, { method: "POST" }),
    onSuccess: (res, reviewId) => {
      // 목록을 다시 안 불러도 숫자가 바로 바뀌어요. (정렬은 다음 새로고침 때 맞춰져요)
      qc.setQueriesData<ListResponse<Review>>({ queryKey: dbKeys.reviewsOf(restaurantId) }, (old) =>
        old
          ? {
              ...old,
              items: old.items.map((r) =>
                r.id === reviewId ? { ...r, liked_by_me: res.liked, like_count: res.like_count } : r,
              ),
            }
          : old,
      );
    },
  });
}

export function useDeleteReview(_restaurantId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reviewId: string) => apiFetch<void>(`/reviews/${reviewId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: dbKeys.restaurants }),
  });
}
