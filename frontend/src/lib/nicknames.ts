// 개발용 로그인에서 쓰는 아무 닉네임 추천이에요. (음식·캠퍼스 느낌 꾸밈말 + 캠퍼스 친구)
// 로그인 규칙과 같게 2~16자만 만들어요.

const ADJECTIVES = [
  "배고픈",
  "국밥러버",
  "떡볶이좋아",
  "야식파",
  "아아한잔",
  "치킨각",
  "마라중독",
  "라면장인",
  "시험기간",
  "밤샘하는",
  "새벽감성",
  "점심탐험가",
  "든든한",
  "졸린",
  "학식마스터",
] as const;

const NOUNS = [
  "너구리",
  "수달",
  "다람쥐",
  "고양이",
  "펭귄",
  "생존자",
  "새내기",
  "졸업반",
  "연구생",
  "코딩러",
  "자전거러",
  "산책러",
  "부엉이",
  "햄스터",
] as const;

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

/** 예: "배고픈 너구리", "국밥러버 수달", "시험기간 생존자" */
export function randomNickname(previous?: string): string {
  for (let i = 0; i < 8; i++) {
    const name = `${pick(ADJECTIVES)} ${pick(NOUNS)}`;
    const len = Array.from(name).length;
    if (len >= 2 && len <= 16 && name !== previous) return name;
  }
  return "배고픈 너구리";
}
