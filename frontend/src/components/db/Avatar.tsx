// 사람 동그라미(아바타) — 닉네임 첫 글자 + 닉네임으로 정해지는 색이에요.
// 사진 없이도 사람마다 색이 달라서 지도에서 알아보기 쉬워요. (파란색·노란색 계열만 써요)
import { cx } from "./ui";

// Tailwind가 클래스 이름을 찾을 수 있게 문자열을 그대로 적어 둬요.
// 진한 파랑 3개(흰 글씨) + 노랑 2개(진한 남색 글씨)만 써서 팔레트와 맞춰요.
const TONES = [
  "bg-brand-500 text-white",
  "bg-brand-600 text-white",
  "bg-brand-700 text-white",
  "bg-sun-300 text-brand-900",
  "bg-sun-400 text-brand-900",
] as const;

/** 같은 닉네임이면 항상 같은 색이 나와요. */
export function avatarTone(nickname: string) {
  let h = 0;
  for (const ch of nickname) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return TONES[h % TONES.length];
}

/** 닉네임 첫 글자 ("배고픈 너구리" → "배") */
export function initialOf(nickname: string) {
  // "[예시] 배고픈 너구리"·"(테스트) 수달" 같은 앞머리 태그와 이모지는 건너뛰고, 글자·숫자 중 첫 번째를 써요.
  const name = nickname.replace(/^(?:\s*[[(【][^\])】]*[\])】])+\s*/, "");
  return Array.from(name).find((ch) => /[\p{L}\p{N}]/u.test(ch)) ?? "?";
}

const SIZES = {
  sm: "size-8 text-sm",
  md: "size-10 text-base",
  lg: "size-14 text-2xl",
} as const;

export function PersonAvatar({
  nickname,
  size = "md",
  ring,
  className,
  title,
}: {
  nickname: string;
  size?: keyof typeof SIZES;
  /** 테두리 색 (예: 나 = "ring-sun-400") */
  ring?: string;
  className?: string;
  /** 마우스를 올리면 보이는 이름 (예: 전체 닉네임) */
  title?: string;
}) {
  return (
    <span
      aria-hidden
      title={title}
      className={cx(
        "flex shrink-0 items-center justify-center rounded-full font-extrabold ring-2",
        SIZES[size],
        avatarTone(nickname),
        ring ?? "ring-white",
        className,
      )}
    >
      {initialOf(nickname)}
    </span>
  );
}
