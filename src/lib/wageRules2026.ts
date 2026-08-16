/**
 * 2026년 적용 최저임금 수치 (최저임금위원회 고시 기준).
 * 연도가 바뀌면 이 모듈만 교체한다 — 계산 로직에 수치를 하드코딩하지 않는다.
 */
export const WAGE_RULES_2026 = {
  /** 최저시급 (원) */
  minimumHourlyWage: 10320,
  /** 월 환산액 — 주 40시간, 주휴 포함 209시간 기준 (원) */
  minimumMonthlyWage: 2156880,
  /** 수습 감액 하한 비율 (최저임금법 5조 2항, 시행령 3조) */
  probationMinimumRate: 0.9,
  /** 수습 3조건 충족 시 하한 시급 = 최저시급 × 90% (원) */
  probationMinimumHourlyWage: 9288,
  /** 법정 주 소정근로시간 상한 (근로기준법 50조) */
  maxWeeklyContractHours: 40,
  /** 주휴수당 발생 최소 주 소정근로시간 (근로기준법 시행령 30조) */
  weeklyRestMinHours: 15,
} as const
