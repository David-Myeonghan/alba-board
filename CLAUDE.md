# 동네 알바 보드 (alba-board)

동네 알바 구인 공고를 목록·상세로 보여주는 데모 웹앱 (목 데이터 기반, 서버 없음).

## 명령

- `pnpm dev` — 개발 서버 실행
- `pnpm test` — Vitest 단위 테스트
- `pnpm typecheck` — tsc --noEmit 타입 검사
- `pnpm lint` — ESLint 검사

## 컨벤션

- UI는 `src/components/ui`의 프리미티브(Button, BottomSheet, TextField)만 조합해 만들고, 새 프리미티브를 발명하지 않는다.
- 금액 표기는 반드시 `src/lib/format.ts`의 `formatCurrency`를 사용한다.
- 테스트는 대상 파일 옆에 colocate 한다 (`*.test.ts` / `*.test.tsx`).
- 커밋은 conventional commits + 한글 설명 (예: `feat: 공고 상세 페이지 추가`).
- 사용자 행동 이벤트는 `src/lib/analytics.ts`의 `track()`만 사용한다.
