/** 모든 레이어 공통 props. 데이터는 자기 훅(api/hooks)에서 가져오고,
 *  마커 클릭 시 store 의 select({ type, id }) 만 호출한다. */
export type LayerProps = { visible: boolean }
