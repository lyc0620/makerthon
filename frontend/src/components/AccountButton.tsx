// 지도 위 오른쪽 위 계정 버튼.
//  - 로그아웃 상태: "로그인" → 닉네임 입력 칸(🎲 추천 닉네임) — 지금은 시연용 개발 로그인(APP_ENV=dev)
//  - 로그인 상태: 아바타 → 작은 메뉴(로그아웃)
// 맛집 후기·제보·밥친구 같은 쓰기 기능에만 로그인이 필요하다 (읽기는 누구나).
// TODO(통합): 학교 이메일 인증(6.7장)이 붙으면 닉네임 칸 대신 이메일·코드 입력으로 바꾼다.
import { type FormEvent, useEffect, useRef, useState } from 'react'

import { errorMessage } from '../api/clientDb'
import { useDevLogin, useLogout } from '../api/hooks/db'
import { randomNickname } from '../lib/nicknames'
import { toast, useAuthStore } from '../store/db'
import { PersonAvatar } from './db/Avatar'
import { Button, cx, inputClass } from './db/ui'

function usePopover() {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return { open, setOpen, boxRef }
}

export default function AccountButton() {
  const token = useAuthStore((s) => s.token)
  const nickname = useAuthStore((s) => s.nickname) ?? '나'
  const logout = useLogout()
  const { open, setOpen, boxRef } = usePopover()
  // 로그인·로그아웃이 되면 열려 있던 창을 닫는다 (로그인 직후 계정 메뉴가 남아 있지 않게)
  const [lastToken, setLastToken] = useState(token)
  if (lastToken !== token) {
    setLastToken(token)
    setOpen(false)
  }

  return (
    <div ref={boxRef} className="pointer-events-auto relative shrink-0">
      {token ? (
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`${nickname} 님 메뉴`}
          onClick={() => setOpen((v) => !v)}
          className="press flex size-9 items-center justify-center rounded-full bg-white shadow-md"
        >
          <PersonAvatar
            nickname={nickname}
            size="sm"
            ring="ring-sun-400"
            className="size-8! text-xs!"
          />
        </button>
      ) : (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="press rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-md"
        >
          로그인
        </button>
      )}

      {open && (
        <div className="sheet-fade absolute top-full right-0 z-50 mt-2 w-72 rounded-2xl bg-white p-2 shadow-float ring-1 ring-slate-200">
          {token ? (
            <div role="menu" aria-label="내 계정">
              <p className="truncate px-2 pt-1 pb-2 text-xs font-medium text-slate-600">
                <b className="text-brand-800">{nickname}</b> 님으로 보는 중
              </p>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  logout()
                }}
                className="flex h-10 w-full items-center rounded-xl px-3 text-left text-sm font-semibold text-slate-700 hover:bg-brand-50"
              >
                로그아웃
              </button>
            </div>
          ) : (
            <LoginBox onDone={() => setOpen(false)} />
          )}
        </div>
      )}
    </div>
  )
}

function LoginBox({ onDone }: { onDone: () => void }) {
  const login = useDevLogin()
  const [name, setName] = useState(() => randomNickname())
  const valid = name.trim().length >= 2

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    login.mutate(name, {
      onSuccess: onDone,
      onError: (err) => toast(errorMessage(err), 'error'),
    })
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <p className="px-1 text-xs font-medium text-slate-600">
        닉네임으로 시작해요. 맛집 후기·제보·밥친구에 이 이름이 보여요.
      </p>
      <div className="flex items-center gap-1.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          minLength={2}
          maxLength={16}
          placeholder="닉네임 (2~16자)"
          aria-label="닉네임"
          className={cx(inputClass, 'h-9 min-w-0 py-1.5')}
        />
        <button
          type="button"
          onClick={() => setName((prev) => randomNickname(prev))}
          aria-label="아무 닉네임 추천받기"
          className="press flex size-9 shrink-0 items-center justify-center rounded-xl bg-sun-100 text-lg ring-1 ring-sun-300 ring-inset"
        >
          <span aria-hidden>🎲</span>
        </button>
        <Button type="submit" size="sm" className="h-9" loading={login.isPending} disabled={!valid}>
          시작
        </Button>
      </div>
    </form>
  )
}
