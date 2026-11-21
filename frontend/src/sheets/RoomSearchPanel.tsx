// 강의실 검색 패널 (담당: 김도현). 검색 → 결과 선택 → 층별 안내도에 위치 강조 + 길찾기.
// 길찾기 선은 RouteLayer가 그리므로, "여기까지 길찾기"를 쓰려면 RouteLayer도 켜져 있어야 한다.
import { useState } from "react";
import { useCampusSearch } from "../api/hooks/useRoute";
import type { CampusSearchItem } from "../api/routeTypes";
import { useRouteStore } from "../store/route";

function label(it: CampusSearchItem) {
  const head = it.code ? `${it.building.name.split(" ")[0]} ${it.code}` : it.building.name;
  return `${head}${it.name ? ` · ${it.name}` : ""}${it.floor_label ? ` (${it.floor_label})` : ""}`;
}

export function RoomSearchPanel() {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const { data, error, isFetching } = useCampusSearch(q);
  const { selectedRoom, selectRoom, routeToRoom } = useRouteStore();

  return (
    <div className="space-y-2 p-3 text-sm">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(input);
        }}
      >
        <input
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="예: L21, E7 233, 멀티미디어, 도서관"
          className="flex-1 rounded-lg border px-3 py-2"
        />
        <button className="rounded-lg bg-blue-600 px-3 py-2 text-white">검색</button>
      </form>

      {isFetching && <p>검색 중...</p>}
      {error && <p>⚠ {(error as Error).message}</p>}
      {data && !isFetching && data.items.length === 0 && <p>결과가 없어요. 예: L21, E7 233, 멀티미디어</p>}
      {data?.items.map((it) => (
        <button
          key={it.id}
          onClick={() => selectRoom(it)}
          className={`block w-full rounded border-l-8 px-3 py-2 text-left ${
            it.type === "room" ? "border-red-600" : "border-blue-600"
          } ${selectedRoom?.id === it.id ? "bg-blue-50" : "bg-gray-50"}`}
        >
          {label(it)}
        </button>
      ))}

      {selectedRoom && <FloorPlanCard item={selectedRoom} onRoute={routeToRoom} />}
    </div>
  );
}

function FloorPlanCard({ item, onRoute }: { item: CampusSearchItem; onRoute: () => void }) {
  const { plan, x, y } = item;
  return (
    <div className="rounded-lg border p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <b>{label(item)}</b>
        <div className="flex gap-1">
          {item.scans.map((s) => (
            <a
              key={s.id}
              href={s.viewer_url}
              target="_blank"
              rel="noopener noreferrer"
              title={s.title}
              className="rounded border bg-gray-50 px-2 py-1"
            >
              3D {s.title.replace(/^\S+층\s*/, "")}
            </a>
          ))}
          <button onClick={onRoute} className="rounded border bg-gray-50 px-2 py-1">
            여기까지 길찾기
          </button>
        </div>
      </div>
      {plan && x !== null && y !== null ? (
        <>
          <div className="relative w-full">
            <img src={plan.image_url} alt={`${item.floor_label} 안내도`} className="block w-full rounded" />
            <div
              className="absolute -ml-4 -mt-4 h-8 w-8 animate-ping rounded-full border-4 border-red-600"
              style={{ left: `${(x / plan.width) * 100}%`, top: `${(y / plan.height) * 100}%` }}
            />
            <div
              className="absolute -ml-4 -mt-4 h-8 w-8 rounded-full border-4 border-red-600 bg-red-600/15"
              style={{ left: `${(x / plan.width) * 100}%`, top: `${(y / plan.height) * 100}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-gray-500">
            안내도 출처:{" "}
            <a href={plan.source_url} target="_blank" rel="noopener noreferrer" className="underline">
              DGIST School Facilities
            </a>
          </p>
        </>
      ) : (
        <p className="text-gray-500">이 층은 안내도가 없어 건물 위치만 표시합니다.</p>
      )}
    </div>
  );
}
