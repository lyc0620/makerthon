// 제보 훅 (6.6). 60초마다 다시 불러오고, WebSocket 이벤트가 오면 바로 무효화돼요.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, toQuery } from "../../clientDb";
import type {
  BBox,
  CreateReportRequest,
  CreateReportResponse,
  Hotspot,
  ListResponse,
  Report,
  ReportType,
  VoteValue,
} from "../../types.db";
import { dbKeys } from "./keys";

/** bbox = [minLng, minLat, maxLng, maxLat]. 생략하면 전체 활성 제보예요. */
export function useReports(bbox?: BBox, type?: ReportType) {
  return useQuery({
    queryKey: dbKeys.reportList(bbox, type),
    queryFn: ({ signal }) =>
      apiFetch<ListResponse<Report>>(
        `/reports${toQuery({ bbox: bbox?.map((n) => n.toFixed(5)).join(","), type })}`,
        { signal },
      ),
    refetchInterval: 60_000,
  });
}

export function useReport(id: string | null | undefined) {
  return useQuery({
    queryKey: dbKeys.report(id ?? ""),
    queryFn: ({ signal }) => apiFetch<Report>(`/reports/${id}`, { signal }),
    enabled: !!id,
    refetchInterval: 60_000,
  });
}

export function useCreateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateReportRequest) =>
      apiFetch<CreateReportResponse>("/reports", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: dbKeys.reports }),
  });
}

export function useVoteReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, vote }: { id: string; vote: VoteValue }) =>
      apiFetch<Report>(`/reports/${id}/votes`, { method: "POST", body: { vote } }),
    onSuccess: (report) => {
      qc.setQueryData(dbKeys.report(report.id), report);
      qc.invalidateQueries({ queryKey: dbKeys.reportLists });
    },
  });
}

export function useHotspots(type: ReportType = "police", days = 30, enabled = true) {
  return useQuery({
    queryKey: dbKeys.hotspots(type, days),
    queryFn: ({ signal }) =>
      apiFetch<ListResponse<Hotspot>>(`/reports/hotspots${toQuery({ type, days })}`, { signal }),
    staleTime: 10 * 60 * 1000,
    enabled,
  });
}
