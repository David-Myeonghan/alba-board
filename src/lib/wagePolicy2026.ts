/**
 * 2026년 임금 정책 상수.
 * 연도가 바뀌면 이 모듈만 교체한다 — 계산 로직에 수치를 하드코딩하지 않는다.
 */
export const WAGE_POLICY_2026 = {
  year: 2026,

  /** 최저시급 (최저임금 고시) */
  minimumHourlyWage: 10320,
  /** 최저임금 월 환산액 — 주 40시간, 주휴 포함 209시간 기준 */
  minimumMonthlyWage: 2156880,

  /** 수습 감액 시 최저시급 하한 (90%, 최저임금법 5조 2항) */
  probationMinimumHourlyWage: 9288,
  /** 수습 감액이 가능한 최소 계약기간 (개월) */
  probationMinContractMonths: 12,

  /** 주휴수당 발생 기준 주 소정근로시간 (근로기준법 18조 3항) */
  weeklyRestMinHours: 15,
  /** 법정 주 소정근로시간 상한 */
  legalMaxWeeklyHours: 40,
  /** 주휴시간 산정 기준: (주 소정근로 / 40) × 8 */
  fullTimeWeeklyHours: 40,
  fullTimeRestHours: 8,

  /** 연장·야간·휴일 가산율 (근로기준법 56조, 상시 5인 이상 사업장만 의무) */
  overtimePremiumRate: 0.5,
  nightPremiumRate: 0.5,
  holidayPremiumRate: 0.5,
  /** 휴일근로 중 이 시간을 초과한 분의 가산율 */
  holidayPremiumBaseHours: 8,
  holidayOverBasePremiumRate: 1.0,
} as const
