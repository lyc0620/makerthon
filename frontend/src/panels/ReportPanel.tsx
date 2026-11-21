// 제보 패널 — "🚨 경찰 봤어요" 버튼, 지금 활성 제보 목록, 단속 다발 구역 TOP.
import { useRef, useState } from "react";
import { errorMessage } from "../api/clientDb";
import { useCreateReport, useHotspots, useReports } from "../api/hooks/db";
import type { SelectedDbItem } from "../api/types.db";
import { EmptyState, ErrorState, ListSkeleton } from "../components/db/StateViews";
import { Button, ConfidenceBar, Notice, SectionTitle, Tag, cx, inputClass } from "../components/db/ui";
import { describeFromCampus, formatHour, timeAgo } from "../lib/dbFormat";
import type { LngLatLike } from "../store/db";
import { toast, useAuthStore, useCancelPickOnUnmount, useDbNavStore, usePickStore, useSelectionStore } from "../store/db";

type Step = "idle" | "choose" | "confirm";

export function ReportPanel({ onSelect }: { onSelect?: (item: SelectedDbItem) => void }) {
  const select = onSelect ?? useSelectionStore.getState().select;
  const token = useAuthStore((s) => s.token);
  const pick = usePickStore();
  useCancelPickOnUnmount();
  const showHotspots = useDbNavStore((s) => s.showHotspots);
  const setShowHotspots = useDbNavStore((s) => s.setShowHotspots);
  const focusOn = useDbNavStore((s) => s.focusOn);

  const [step, setStep] = useState<Step>("idle");
  const [point, setPoint] = useState<LngLatLike | null>(null);
  const [desc, setDesc] = useState("");
  const [locating, setLocating] = useState(false);
  const bigButtonRef = useRef<HTMLButtonElement>(null);

  const reports = useReports(undefined, "police");
  const hotspots = useHotspots("police", 30);
  const create = useCreateReport();

  const begin = () => {
    if (!token) return toast("먼저 닉네임으로 로그인해 주세요.", "info");
    setStep("choose");
  };

  const reset = () => {
    setStep("idle");
    setPoint(null);
    setDesc("");
    pick.stop();
  };

  const pickOnMap = () => {
    pick.start("경찰을 본 곳을 지도에서 눌러 주세요", (p) => {
      setPoint(p);
      setStep("confirm");
    });
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) return toast("이 브라우저는 위치를 알 수 없어요.", "error");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPoint(p);
        focusOn(p);
        setStep("confirm");
      },
      (err) => {
        setLocating(false);
        toast(
          err.code === err.PERMISSION_DENIED
            ? "위치 권한이 꺼져 있어요. 지도에서 찍어 주세요."
            : "위치를 찾지 못했어요. 지도에서 찍어 주세요.",
          "error",
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  };

  const submit = () => {
    if (!point) return;
    create.mutate(
      { type: "police", lat: point.lat, lng: point.lng, description: desc.trim() || null },
      {
        onSuccess: (r) => {
          toast(
            r.merged
              ? "근처에 이미 제보가 있어서 '아직 있어요'로 합쳤어요 👍"
              : "제보했어요! 30분 동안 지도에 보여요 🚨",
            "success",
          );
          reset();
          select({ type: "report", id: r.id });
        },
        onError: (e) => toast(errorMessage(e), "error"),
      },
    );
  };

  const active = reports.data?.items.filter((r) => r.is_active) ?? [];

  /** "지금은 조용해요"에서 큰 버튼으로 데려가요. */
  const goToBigButton = () => {
    if (step !== "idle") reset();
    requestAnimationFrame(() => {
      bigButtonRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      bigButtonRef.current?.focus({ preventScroll: true });
    });
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-extrabold text-slate-900">경찰 순찰 제보</h2>

      {/* 제보하기 흐름 */}
      {step === "idle" && (
        <button
          ref={bigButtonRef}
          type="button"
          onClick={begin}
          className="press flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 py-4 text-lg font-extrabold text-white shadow-lg shadow-brand-600/25 transition hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 active:scale-[0.99]"
        >
          <span className="text-2xl" aria-hidden>
            🚨
          </span>
          경찰 봤어요
        </button>
      )}

      {step === "choose" && (
        <div className="space-y-2 rounded-2xl bg-white p-3 ring-1 ring-brand-100">
          <p className="text-sm font-semibold text-slate-800">어디서 봤나요?</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="lg" onClick={pickOnMap}>
              🗺️ 지도에서 찍기
            </Button>
            <Button variant="outline" size="lg" onClick={useMyLocation} loading={locating}>
              📍 내 위치
            </Button>
          </div>
          {pick.label && <Notice tone="yellow">{pick.label}</Notice>}
          <button type="button" onClick={reset} className="w-full py-1 text-sm text-slate-500 hover:underline">
            취소
          </button>
        </div>
      )}

      {step === "confirm" && point && (
        <div className="space-y-3 rounded-2xl bg-white p-3 ring-1 ring-brand-100">
          <p className="text-sm font-semibold text-slate-800">📍 {describeFromCampus(point)}</p>
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            maxLength={100}
            placeholder="한 줄 설명 (선택) 예) 정문 앞 2명, 헬멧 단속"
            className={inputClass}
          />
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStep("choose")}>
              위치 다시
            </Button>
            <Button className="flex-1" size="lg" onClick={submit} loading={create.isPending}>
              제보 올리기
            </Button>
          </div>
        </div>
      )}

      {/* 지금 활성 제보 */}
      <section>
        <SectionTitle right={<span className="text-xs text-slate-500">60초마다 새로고침</span>}>
          지금 올라온 제보 {active.length > 0 && <span className="text-brand-600">{active.length}</span>}
        </SectionTitle>
        {reports.isLoading && <ListSkeleton rows={2} shape="report" label="제보를 불러오는 중이에요…" />}
        {reports.error && (
          <ErrorState
            message={errorMessage(reports.error)}
            onRetry={() => reports.refetch()}
            retrying={reports.isFetching}
          />
        )}
        {reports.data && active.length === 0 && (
          <EmptyState
            icon="😌"
            title="지금은 조용해요"
            hint="경찰을 보면 바로 알려 주세요"
            action={{ label: "경찰 봤어요", icon: "🚨", onClick: goToBigButton }}
          />
        )}
        <ul className="flex flex-col gap-3">
          {active.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  select({ type: "report", id: r.id });
                  focusOn(r);
                }}
                className="press flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left ring-1 ring-slate-100 transition hover:ring-brand-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-lg" aria-hidden>
                  🚨
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="min-w-0 truncate text-sm font-semibold text-slate-900">
                      {r.description ?? describeFromCampus(r)}
                    </span>
                    <span className="shrink-0">
                      <Tag tone={timeAgo(r.created_at) === "방금" ? "yellow" : "blue"}>{timeAgo(r.created_at)}</Tag>
                    </span>
                  </span>
                  <span className="block text-xs text-slate-500">맞아요 {r.confirm_count}명</span>
                  <span className="mt-1.5 flex items-center gap-2">
                    <ConfidenceBar value={r.confidence} className="h-1.5 flex-1" />
                    <span className="w-16 shrink-0 text-right text-[11px] font-semibold text-slate-600">
                      신뢰도 {Math.round(r.confidence * 100)}%
                    </span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* 단속 다발 구역 */}
      <section className="rounded-2xl bg-sun-50 p-3 ring-1 ring-inset ring-sun-200">
        <SectionTitle
          right={
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
              지도
              <button
                type="button"
                role="switch"
                aria-checked={showHotspots}
                aria-label="단속 다발 구역 지도에 표시"
                onClick={() => setShowHotspots(!showHotspots)}
                className={cx(
                  "relative h-6 w-11 rounded-full transition",
                  showHotspots ? "bg-brand-600" : "bg-slate-300",
                )}
              >
                <span
                  className={cx(
                    "absolute top-0.5 size-5 rounded-full bg-white shadow transition-all",
                    showHotspots ? "left-[22px]" : "left-0.5",
                  )}
                />
              </button>
            </label>
          }
        >
          📊 단속 다발 구역 <span className="text-xs font-semibold text-slate-500">최근 30일</span>
        </SectionTitle>
        {hotspots.isLoading && <ListSkeleton rows={2} shape="report" label="단속 구역을 불러오는 중이에요…" />}
        {hotspots.error && (
          <ErrorState
            message={errorMessage(hotspots.error)}
            onRetry={() => hotspots.refetch()}
            retrying={hotspots.isFetching}
          />
        )}
        {hotspots.data?.items.length === 0 && <p className="text-sm text-slate-500">아직 모인 기록이 없어요.</p>}
        <ol className="space-y-1.5">
          {hotspots.data?.items.slice(0, 5).map((h, i) => (
            <li key={`${h.lat},${h.lng}`}>
              <button
                type="button"
                onClick={() => {
                  setShowHotspots(true);
                  focusOn(h);
                }}
                className="press flex w-full items-center gap-3 rounded-xl bg-white px-3 py-2 text-left ring-1 ring-sun-200 transition hover:ring-brand-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sun-400 text-xs font-extrabold text-brand-900">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">{describeFromCampus(h)}</span>
                  <span className="block text-xs text-brand-700">
                    주로 {h.peak_weekday}요일 {formatHour(h.peak_hour)}에 단속해요
                  </span>
                </span>
                <span className="shrink-0 text-sm font-bold text-slate-700">{h.count}건</span>
              </button>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export default ReportPanel;
