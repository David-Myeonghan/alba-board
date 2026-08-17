/**
 * 2026년 적용 임금 상수 (최저임금 고시 기준).
 * 연도가 바뀌면 이 모듈만 교체한다 — 계산 로직에 수치를 하드코딩하지 않는다.
 */
export const WAGE_YEAR = 2026

/** 최저시급 (원) */
export const MINIMUM_HOURLY_WAGE = 10_320

/** 최저임금 월 환산액 (주 40시간, 주휴 포함 209시간 기준, 원) */
export const MINIMUM_MONTHLY_WAGE = 2_156_880

/** 수습 감액 시 최저임금 하한 비율 (최저임금법 5조 2항, 시행령 3조) */
export const PROBATION_MINIMUM_RATE = 0.9

/** 수습 감액 시 하한 시급 (원) */
export const PROBATION_MINIMUM_HOURLY_WAGE = 9_288
