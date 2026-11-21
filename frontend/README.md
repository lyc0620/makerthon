# 현풍 지도 — 프론트엔드 (DB 파트: 맛집 · 제보 · 밥친구 · 지금 밥 먹을 사람)

React + Vite + TypeScript, MapLibre(react-map-gl), TanStack Query, Zustand, Tailwind CSS v4 를 써요.
API 규격은 `../docs/api-spec-db.md` 를 그대로 따라요 (필드는 snake_case 그대로).

## 실행하기

```bash
cd frontend
npm install          # package-lock.json 기준으로 설치해요
npm run dev          # http://localhost:5173 (내 컴퓨터에서만 열려요)
npm run build        # 타입 검사(tsc -b) + 배포용 빌드
```

- 백엔드를 `127.0.0.1:8000` 에서 먼저 켜 두세요. `/api` 요청과 WebSocket(`/api/v1/ws`)은 Vite가 백엔드로 넘겨줘요.
- 백엔드가 꺼져 있어도 화면은 떠요. 목록 자리에 "서버에 연결하지 못했어요"가 보여요.
- 로그인은 위쪽 닉네임 칸(개발용 `POST /api/v1/auth/dev-login`)으로 해요. 서버가 `APP_ENV=dev` 일 때만 돼요.
- 배경 지도를 바꾸려면 `.env.example` 을 `.env` 로 복사해서 `VITE_MAP_STYLE_URL` 을 채워요. 비워 두면 키가 필요 없는 OpenFreeMap 스타일을 써요.

## 어떤 파일이 누구 건가요?

### DB 파트 (내 담당 — 통합 때 그대로 가져가요)

| 파일 | 하는 일 |
|---|---|
| `src/api/types.db.ts` | 규격 타입 (`Restaurant`, `Review`, `Report`, `Meetup`, `Presence`, `QuickMeetupRequest`, `MeetupSuggestion`, `InviteReceived`, `ListResponse<T>`, `ApiErrorBody`, `SelectedDbItem` …) |
| `src/api/clientDb.ts` | fetch 래퍼. `/api/v1` + Bearer 토큰, 에러를 `ApiError(code, message, details)`로 던져요. 통합 `client.ts`로 바꿔도 돼요 |
| `src/api/hooks/db/*` | TanStack Query 훅. 맛집 staleTime 10분, 제보 60초, 밥친구·실시간 위치 30초, 채팅 10초 갱신. `useRealtime()`은 WebSocket 이벤트로 캐시를 바꾸고 접속자 수를 알려 줘요 (로그인하면 `?token=`으로 다시 연결) |
| `src/api/hooks/db/presence.ts` | 6.10 실시간 위치: `usePresenceList`(로그인 때만), `useMyPresence`, `useSharePresence`(GPS → 안 되면 지도에서 찍기), `useStartPresence`/`useUpdatePresence`/`useStopPresence`, `usePresenceHeartbeat`(60초마다 PUT, until에 자동 끄기, 탭 닫으면 끄기), `useInvite` |
| `src/store/db.ts` | 로그인 토큰(localStorage), 지도 위치 찍기(`usePickStore`), 토스트, 패널 이동·핫스팟 표시·지도 이동 요청(`useDbNavStore`), 내 위치 공유 상태(`usePresenceStore`, 메모리에만), 받은 같이 먹자 제안(`useInviteStore`), **개발용** 선택 스토어 |
| `src/layers/RestaurantLayer.tsx` · `ReportLayer.tsx` · `MeetupLayer.tsx` · `PresenceLayer.tsx` | 지도 레이어. `{ visible, onSelect?, selectedId? }` (+ 제보는 `showHotspots`). 사람 레이어는 닉네임 첫 글자 동그라미 + 퍼지는 테두리, 내 점은 노란 테두리 "나" |
| `src/sheets/RestaurantSheet.tsx` · `ReportSheet.tsx` · `MeetupSheet.tsx` · `PresenceSheet.tsx` | 바텀시트 상세 화면. `{ id, onSelect? }` (사람 시트의 id는 `usr_3` 같은 사용자 id). 사람 시트에서 "🍚 같이 먹자" → 시간 칩 → 장소 칩 한 번에 제안 |
| `src/panels/RestaurantPanel.tsx` (+ `RecommendForm.tsx`) · `ReportPanel.tsx` · `MeetupPanel.tsx` | 목록·필터·만들기 폼 |
| `src/panels/PresenceHero.tsx` · `QuickMeetup.tsx` | 밥친구 패널 위쪽: "🙋 지금 밥 먹을래요" 켜기/끄기 + 근처 사람, "⚡ 번개 약속"(칩 두 번), "✨ 추천 약속"(한 번에 참여). 원래 폼은 "✏️ 직접 만들기" |
| `src/components/db/ui.tsx` · `Toaster.tsx` | DB 화면에서 쓰는 작은 UI 조각(버튼, 칩, 별점…)과 토스트 |
| `src/components/db/Avatar.tsx` · `QuickPick.tsx` · `InviteToast.tsx` | 사람 동그라미, 언제/어디서 칩, 받은 "같이 먹자" 카드(참여하기 / 괜찮아요, 여러 개면 쌓여요) |
| `src/lib/notify.ts` | 밥약속 알림(`meetup.notice`: 참여·마감·나감·취소·채팅·10분 전) 문구와 브라우저 알림. 토스트에 "보기" 버튼이 붙어 시트를 열어요. 다른 탭을 볼 때 권한이 `granted`면 브라우저 알림도 떠요. 권한은 밥약속 시트의 "🔔 알림 켜기" 버튼을 눌렀을 때만 물어요(닫으면 `hp-notify-ask-v1`에 기억) |
| `src/lib/dbFormat.ts` | 시간(서울)·거리 표시, 캠퍼스 좌표, 밥약속 묶기, 번개 약속 시간 미리보기 |

### ⚠️ 임시 개발용 (통합 때 버려요)

| 파일 | 대신할 것 |
|---|---|
| `src/dev/DevApp.tsx` | lyc0620님의 앱 껍데기 (TabBar, LayerToggle) |
| `src/dev/DevMap.tsx` | dohyun님의 `src/map/MapView.tsx` |
| `src/dev/DevBottomSheet.tsx` | lyc0620님의 `src/components/BottomSheet` |
| `src/main.tsx` 의 `<DevApp />` | 통합 App |

## 통합할 때 끼우는 방법

### 1. 지도 (dohyun님 `MapView`)

```tsx
import { RestaurantLayer } from "../layers/RestaurantLayer";
import { ReportLayer } from "../layers/ReportLayer";
import { MeetupLayer } from "../layers/MeetupLayer";
import { PresenceLayer } from "../layers/PresenceLayer";
import { useDbNavStore, usePickStore } from "../store/db";

// <Map> 안에
<RestaurantLayer visible={layers.restaurant} onSelect={select} selectedId={sel?.type === "restaurant" ? sel.id : null} />
<MeetupLayer     visible={layers.meetup}     onSelect={select} />
<ReportLayer     visible={layers.report}     onSelect={select} showHotspots={useDbNavStore((s) => s.showHotspots)} />
<PresenceLayer   visible={layers.presence}   onSelect={select} selectedId={sel?.type === "presence" ? sel.id : null} />

// <Map onClick> 에서 "지도에서 위치 찍기"를 넘겨 주세요 (맛집 추천·경찰 제보·밥약속 위치에 써요)
onClick={(e) => {
  if (usePickStore.getState().handleClick(e.lngLat)) return; // 찍기 모드였으면 여기서 끝
  // ... 원래 클릭 처리
}}

// (선택) 목록에서 고른 곳으로 지도 옮기기
const focus = useDbNavStore((s) => s.focus);
useEffect(() => { if (focus) mapRef.current?.flyTo({ center: [focus.lng, focus.lat], zoom: 16 }); }, [focus]);
```

찍기 모드일 때 안내 문구는 `usePickStore((s) => s.label)` 로 꺼내서 지도 위에 띄우면 돼요 (`DevMap.tsx` 참고).
3D 레이어와 같이 써도 마커는 DOM 요소라 그대로 보여요.

### 2. 바텀시트 (lyc0620님 `BottomSheet`)

```tsx
switch (selected?.type) {
  case "restaurant": return <RestaurantSheet id={selected.id} onSelect={select} />;
  case "report":     return <ReportSheet id={selected.id} />;
  case "meetup":     return <MeetupSheet id={selected.id} onSelect={select} />;
  case "presence":   return <PresenceSheet id={selected.id} onSelect={select} />;
}
```

- `src/store/ui.ts` 의 `SelectedItem` 에 `{ type: "meetup"; id: string }` 와 `{ type: "presence"; id: string }`(사용자 id) 를 추가해 주세요.
- 패널은 탭 화면에 `<RestaurantPanel onSelect={select} />` 처럼 넣어요.
- 가게 상세의 "여기서 같이 먹을 사람 구하기"는 기본으로 `useDbNavStore.openCreate()` 를 불러요 (탭 값을 `meetup` 으로 바꾸고 초안을 채움).
  통합 탭 상태를 쓰려면 `onCreateMeetup` 프롭으로 바꿔 끼우거나 `useDbNavStore((s) => s.tab)` 을 구독해 주세요.
- 앱 어딘가에 `<DbToaster />` 와 `<InviteToast onSelect={select} />` 하나씩, 최상단에서 `useRealtime()` 과 `usePresenceHeartbeat()` 를 한 번씩만 불러 주세요.
- LayerToggle 에 "🙋 사람" 토글을 하나 더 넣어 주세요 (`PresenceLayer` 의 `visible`).

### 3. 지금 밥 먹을 사람 — 개인정보 (꼭 지켜요)

- 기본은 꺼짐이에요. 사용자가 스위치를 직접 켜야만 위치를 보내요. 켜는 카드에 "대략적인 위치만 · 꺼지면 바로 사라져요" 안내가 있어요.
- 위치는 브라우저 GPS(`watchPosition`)를 먼저 쓰고, 거절·실패·서비스 지역 밖(422)이면 지도에서 찍게 해요(`usePickStore`).
- 내 정확한 위치는 `usePresenceStore` 메모리에만 있어요 (localStorage 저장 안 함). 다른 사람 화면에는 서버가 흐린 좌표(약 50m)만 보내요.
- 60초마다 heartbeat, 고른 시간(30/60/120분)이 되면 자동으로 끄고, 탭을 닫거나 로그아웃하면 바로 끄기 요청(keepalive)을 보내요.
- 목록은 로그인했을 때만 불러요. 로그아웃하면 캐시도 지워요.

## 참고

- 시간은 모두 서울 기준으로 보여 줘요. 밥약속 시간 입력(`datetime-local`)은 서울 시간으로 보고 `+09:00` 을 붙여 보내요.
- 캠퍼스 중심 좌표(`src/lib/dbFormat.ts` 의 `CAMPUS`)는 OSM 기준 정문과 강의동의 중간점(35.7033, 128.4557)이에요. 팀에서 확정되면 바꿔 주세요.
- `@vitejs/plugin-react` 없이 esbuild 자동 JSX로 빌드해요. 개발 중 Fast Refresh가 필요하면 통합 때 플러그인을 넣어 주세요.

## 통합 때 주의

- MapView 바깥 div에 `isolate`(CSS `isolation: isolate`)를 꼭 넣어 주세요. 안 넣으면 제보 핀(z-index)이 바텀시트 위로 올라와요.
