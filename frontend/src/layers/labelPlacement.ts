// 지도 이름표 자리 정하기 (겹침 피하기)
//
// 생각은 단순해요.
// 1) 이름표마다 화면 좌표를 구해요. (map.project)
// 2) 중요한 것부터 줄을 세워요. 고른 곳 > 밥약속 있는 곳 > 추천 상위 3곳 > 점수 > 후기 수.
// 3) 한 개씩 "핀 위(bottom) → 핀 왼쪽(right) → 핀 오른쪽(left) → 핀 아래(top)" 순서로 놓아 보고,
//    이미 놓인 상자(먼저 놓인 이름표, 제보 핀·사람 점 같은 고정 장애물)와 안 겹치는 첫 자리를 써요.
// 4) 네 자리 모두 겹치면 이름표를 접고 작은 점(이모지)만 보여 줘요.
//    단, force(지금 고른 곳)는 겹쳐도 핀 위에 그대로 보여 줘요.
//
// anchor 이름은 maplibre Marker의 anchor와 같아요. ("bottom" = 이름표 아래 끝이 핀 위치, 즉 이름표가 핀 위로 떠요)
// 계산은 순수 함수라서 지도 없이도 테스트할 수 있어요.

export type LabelAnchor = "bottom" | "right" | "left" | "top";

/** 놓아 볼 순서 */
export const ANCHOR_ORDER: LabelAnchor[] = ["bottom", "right", "left", "top"];

/** 이름표와 핀 사이 꼬리(화살표) 길이 */
export const ARROW = 6;

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface LabelItem {
  id: string;
  lng: number;
  lat: number;
  /** 큰 값이 먼저. 앞 칸부터 비교해요. 예: [고름, 밥약속, 상위3, 점수, 후기수] */
  rank: number[];
  /** 겹쳐도 꼭 보여야 하는 이름표 (지금 고른 곳) */
  force?: boolean;
}

/** 화면에 고정된 장애물. 위치 + 그 위치를 기준으로 한 상자 크기·이동(px) */
export interface Obstacle {
  lng: number;
  lat: number;
  w: number;
  h: number;
  /** 위치에서 상자 가운데까지 화면 이동(px) */
  dx?: number;
  dy?: number;
}

/** anchor: 정해진 자리, null: 이름표를 접고 점만 */
export type Placement = { anchor: LabelAnchor | null; box: Box | null };

/** 핀 위치(p)와 이름표 크기(size)로 anchor별 상자를 구해요. 꼬리 길이만큼 핀에서 떨어뜨려요. */
export function boxFor(p: Point, size: Size, anchor: LabelAnchor): Box {
  const { w, h } = size;
  switch (anchor) {
    case "bottom":
      return { x1: p.x - w / 2, y1: p.y - h - ARROW, x2: p.x + w / 2, y2: p.y };
    case "top":
      return { x1: p.x - w / 2, y1: p.y, x2: p.x + w / 2, y2: p.y + h + ARROW };
    case "right":
      return { x1: p.x - w - ARROW, y1: p.y - h / 2, x2: p.x, y2: p.y + h / 2 };
    case "left":
      return { x1: p.x, y1: p.y - h / 2, x2: p.x + w + ARROW, y2: p.y + h / 2 };
  }
}

/** 장애물 상자 */
export function obstacleBox(p: Point, o: Obstacle): Box {
  const cx = p.x + (o.dx ?? 0);
  const cy = p.y + (o.dy ?? 0);
  return { x1: cx - o.w / 2, y1: cy - o.h / 2, x2: cx + o.w / 2, y2: cy + o.h / 2 };
}

/** 두 상자가 겹치는지 (가장자리 pad px만큼 여유를 줘요) */
export function overlaps(a: Box, b: Box, pad = 2) {
  return a.x1 < b.x2 + pad && a.x2 + pad > b.x1 && a.y1 < b.y2 + pad && a.y2 + pad > b.y1;
}

function compareRank(a: number[], b: number[]) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = (b[i] ?? 0) - (a[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * 이름표 자리를 정해요.
 * @param items 이름표 후보
 * @param project 경도·위도 → 화면 px
 * @param sizeOf 이름표 크기(꼬리 제외)
 * @param obstacles 피해야 할 고정 상자 (제보 핀·사람 점 44px, 다른 레이어 이름표 등)
 * @param dotSize 접힌 점 크기. 다른 이름표가 이 점을 덮지 않게 장애물로 넣어요. (0이면 안 넣어요)
 */
export function placeLabels(
  items: LabelItem[],
  project: (lng: number, lat: number) => Point,
  sizeOf: (item: LabelItem) => Size,
  obstacles: Obstacle[] = [],
  dotSize = 0,
): Map<string, Placement> {
  const placed: Box[] = obstacles.map((o) => obstacleBox(project(o.lng, o.lat), o));
  const points = new Map(items.map((it) => [it.id, project(it.lng, it.lat)]));
  // 다른 가게 점은 남의 이름표가 가리지 않게, 각 점 자리를 따로 기억해 둬요.
  const dots = dotSize
    ? items.map((it) => ({ id: it.id, box: obstacleBox(points.get(it.id)!, { lng: 0, lat: 0, w: dotSize, h: dotSize }) }))
    : [];

  const result = new Map<string, Placement>();
  const sorted = [...items].sort((a, b) => compareRank(a.rank, b.rank));

  for (const it of sorted) {
    const p = points.get(it.id)!;
    const size = sizeOf(it);
    let chosen: Placement = { anchor: null, box: null };
    for (const anchor of ANCHOR_ORDER) {
      const box = boxFor(p, size, anchor);
      const hit =
        placed.some((b) => overlaps(box, b)) || dots.some((d) => d.id !== it.id && overlaps(box, d.box, 0));
      if (!hit) {
        chosen = { anchor, box };
        break;
      }
    }
    if (!chosen.anchor && it.force) chosen = { anchor: "bottom", box: boxFor(p, size, "bottom") };
    if (chosen.box) placed.push(chosen.box);
    result.set(it.id, chosen);
  }
  return result;
}

/** anchor 쪽으로 꼬리를 그리기 위한 flex 방향 (이름표 → 꼬리 순서로 넣었을 때) */
export const ANCHOR_FLEX: Record<LabelAnchor, string> = {
  bottom: "flex-col", // 이름표 아래 꼬리
  top: "flex-col-reverse", // 이름표 위 꼬리
  right: "flex-row", // 이름표 오른쪽 꼬리
  left: "flex-row-reverse", // 이름표 왼쪽 꼬리
};

/** 꼬리(마름모)를 이름표 쪽으로 살짝 겹치게 하는 여백 */
export const ARROW_MARGIN: Record<LabelAnchor, string> = {
  bottom: "-mt-1",
  top: "-mb-1",
  right: "-ml-1",
  left: "-mr-1",
};
