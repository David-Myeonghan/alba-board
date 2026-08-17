/**
 * 시급계산기 도메인 로직 — UI와 분리된 순수 함수.
 * 2026년 수치는 wage2026.ts 상수 모듈에서 가져온다.
 *
 * 법적 근거:
 * - 최저임금·월 환산액: 2026년 적용 최저임금 고시
 * - 주휴수당: 근로기준법 55조, 시행령 30조 (주 15시간 이상 + 개근)
 * - 연장·야간·휴일 가산: 근로기준법 56조 (상시 5인 미만 제외: 11조, 시행령 별표1)
 * - 수습 감액: 최저임금법 5조 2항, 시행령 3조, 단순노무직 제외 고시
 */
import { formatCurrency } from './format'
import {
  MINIMUM_HOURLY_WAGE,
  PROBATION_MINIMUM_HOURLY_WAGE,
  WAGE_YEAR,
} from './wage2026'

export type CalculatorWageType = 'HOURLY' | 'MONTHLY'

export interface CalculatorWage {
  type: CalculatorWageType
  amount: number
}

export interface ProbationInput {
  /** 수습 시작일 기준 3개월 이내인지 */
  isWithinFirstThreeMonths: boolean
  /** 근로계약 기간 (개월) */
  contractMonths: number
  /** 단순노무직 여부 (배달·서빙·청소 등) */
  isSimpleLabor: boolean
}

export interface WageCalculatorInput {
  wage: CalculatorWage
  /** 공고의 "주휴수당 포함" 표기 여부 */
  wageIncludesWeeklyRest: boolean
  /** 주 소정근로시간 — 0 초과 40 이하만 유효 */
  weeklyContractHours: number
  workplaceHasFiveOrMore: boolean | 'UNKNOWN'
  probation: ProbationInput | null | 'UNKNOWN'
  expectedOvertimeHours?: number
  /** 야간(22~06시) — 연장·휴일과 겹칠 수 있는 부분집합 */
  expectedNightHours?: number
  expectedHolidayHours?: number
}

export interface RuleNote {
  id: string
  label: string
  reason: string
}

export interface WageBreakdown {
  /** 주휴 제외 기본시급 */
  basicHourly: number
  /** 주휴수당 환산분 (근로시간당) */
  weeklyRestPerHour: number
  /** 가산수당 예상분 (근로시간당) */
  premiumPerHour: number
}

export interface ScenarioAssumption {
  id: 'FIVE_OR_MORE' | 'PROBATION'
  label: string
}

export interface WageScenario {
  /** '모름' 입력을 분기한 가정 라벨 (모름이 없으면 빈 배열) */
  assumptions: ScenarioAssumption[]
  effectiveHourlyWage: number
  breakdown: WageBreakdown
  appliedRules: RuleNote[]
  skippedRules: RuleNote[]
  warnings: string[]
}

export type WageCalculationResult =
  | {
      ok: true
      scenarios: WageScenario[]
      /** 월급 공고일 때만 — 환산 분모(월 소정근로시간, 주휴 포함·올림) */
      monthlyContractHours?: number
    }
  | { ok: false; errors: string[] }

/** 근로기준법 50조 — 주 소정근로시간 법정 상한 */
const LEGAL_MAX_WEEKLY_HOURS = 40
/** 주휴 발생 최소 소정근로시간 (근로기준법 18조 3항) */
const WEEKLY_REST_THRESHOLD_HOURS = 15
/** 연장·야간·휴일(8시간 이내) 가산율 (근로기준법 56조) */
const PREMIUM_RATE = 0.5
/** 휴일 8시간 초과분 가산율 (근로기준법 56조 2항) */
const HOLIDAY_OVER_8H_PREMIUM_RATE = 1.0
const HOLIDAY_BASE_HOURS = 8

/** 주휴시간: (주 소정근로 / 40) × 8. 15시간 미만이면 0 */
function weeklyRestHours(weeklyContractHours: number): number {
  if (weeklyContractHours < WEEKLY_REST_THRESHOLD_HOURS) return 0
  return (weeklyContractHours / LEGAL_MAX_WEEKLY_HOURS) * 8
}

/** 월 소정근로시간(주휴 포함): (주 소정근로 + 주휴) × 365 / 7 / 12, 관행상 올림 */
export function monthlyContractHoursOf(weeklyContractHours: number): number {
  const weeklyPaidHours = weeklyContractHours + weeklyRestHours(weeklyContractHours)
  return Math.ceil((weeklyPaidHours * 365) / 7 / 12)
}

function validate(input: WageCalculatorInput): string[] {
  const errors: string[] = []
  const hours = input.weeklyContractHours
  const overtime = input.expectedOvertimeHours ?? 0
  const night = input.expectedNightHours ?? 0
  const holiday = input.expectedHolidayHours ?? 0

  if (!Number.isFinite(input.wage.amount) || input.wage.amount <= 0) {
    errors.push('임금 금액은 0보다 큰 숫자여야 합니다.')
  }
  if (!Number.isFinite(hours) || hours <= 0 || hours > LEGAL_MAX_WEEKLY_HOURS) {
    errors.push(
      `주 소정근로시간은 0 초과 ${LEGAL_MAX_WEEKLY_HOURS} 이하여야 합니다 (법정 상한).`,
    )
  }
  if (!Number.isFinite(overtime) || overtime < 0) {
    errors.push('예상 연장시간은 0 이상이어야 합니다.')
  }
  if (!Number.isFinite(night) || night < 0) {
    errors.push('예상 야간시간은 0 이상이어야 합니다.')
  }
  if (!Number.isFinite(holiday) || holiday < 0) {
    errors.push('예상 휴일시간은 0 이상이어야 합니다.')
  }
  if (
    errors.length === 0 &&
    night > hours + overtime + holiday
  ) {
    errors.push(
      '예상 야간시간은 전체 근로시간(소정근로+연장+휴일)을 넘을 수 없습니다.',
    )
  }
  return errors
}

/** 수습 감액 하한(90%) 적용 가능 여부 — 세 조건 모두 충족해야 한다 */
function probationReductionApplies(probation: ProbationInput): boolean {
  return (
    probation.isWithinFirstThreeMonths &&
    probation.contractMonths >= 12 &&
    !probation.isSimpleLabor
  )
}

/** 수습 감액이 불가한 사유 목록 (감액 가능하면 빈 배열) */
function probationSkipReasons(probation: ProbationInput): string[] {
  const reasons: string[] = []
  if (!probation.isWithinFirstThreeMonths) {
    reasons.push('수습 시작 3개월이 지나 감액할 수 없습니다.')
  }
  if (probation.contractMonths < 12) {
    reasons.push('계약기간 1년 미만은 감액할 수 없습니다 (최저임금법 5조).')
  }
  if (probation.isSimpleLabor) {
    reasons.push(
      '단순노무직(배달·서빙·청소 등)은 감액할 수 없습니다 (고용노동부 고시). 이 서비스 공고 다수가 여기에 해당합니다.',
    )
  }
  return reasons
}

interface ScenarioContext {
  fiveOrMore: boolean
  fiveOrMoreAssumed: boolean
  probationReduced: boolean
  probationAssumed: boolean
}

function buildScenario(
  input: WageCalculatorInput,
  context: ScenarioContext,
): WageScenario {
  const appliedRules: RuleNote[] = []
  const skippedRules: RuleNote[] = []
  const warnings: string[] = []
  const assumptions: ScenarioAssumption[] = []

  const hours = input.weeklyContractHours
  const overtime = input.expectedOvertimeHours ?? 0
  const night = input.expectedNightHours ?? 0
  const holiday = input.expectedHolidayHours ?? 0
  const restHours = weeklyRestHours(hours)
  const restEligible = restHours > 0

  if (context.fiveOrMoreAssumed) {
    assumptions.push({
      id: 'FIVE_OR_MORE',
      label: context.fiveOrMore ? '상시 5인 이상 가정' : '상시 5인 미만 가정',
    })
  }
  if (context.probationAssumed) {
    assumptions.push({
      id: 'PROBATION',
      label: context.probationReduced
        ? '수습 감액 조건 충족 가정'
        : '수습 감액 미적용 가정',
    })
  }

  // 1) 주휴 제외 기본시급
  let basicHourly: number
  if (input.wage.type === 'MONTHLY') {
    const monthlyHours = monthlyContractHoursOf(hours)
    basicHourly = input.wage.amount / monthlyHours
    appliedRules.push({
      id: 'MONTHLY_CONVERSION',
      label: '월급 → 시급 환산',
      reason: `월급을 월 소정근로시간 ${monthlyHours}시간(주휴시간 포함, 소수점 올림)으로 나눠 기본시급을 구했습니다. 이 분모에 주휴가 이미 포함돼 있어 별도 역산 없이 시급 공고와 비교할 수 있습니다.`,
    })
  } else if (input.wageIncludesWeeklyRest && restEligible) {
    basicHourly = input.wage.amount / 1.2
    appliedRules.push({
      id: 'WEEKLY_REST_BACKOUT',
      label: '주휴 포함 표기의 역산',
      reason: `표기 시급에 주휴수당이 포함돼 있어 기본시급을 역산했습니다 (표기 ÷ 1.2 = ${formatCurrency(basicHourly)}). 주휴를 중복 가산하지 않습니다.`,
    })
  } else {
    basicHourly = input.wage.amount
    if (input.wageIncludesWeeklyRest && !restEligible) {
      skippedRules.push({
        id: 'WEEKLY_REST_BACKOUT',
        label: '주휴 포함 표기의 역산',
        reason:
          '주휴수당 포함 표기지만 주 15시간 미만이라 주휴 자체가 발생하지 않으므로, 역산 없이 표기 시급을 그대로 기본시급으로 봅니다.',
      })
    }
  }

  // 2) 주휴수당 (사업장 규모 무관, 개근 전제)
  const weeklyRestPay = restEligible ? basicHourly * restHours : 0
  if (restEligible) {
    appliedRules.push({
      id: 'WEEKLY_REST',
      label: '주휴수당',
      reason: `주 소정근로 15시간 이상 + 개근 가정으로 주휴수당(주 ${formatCurrency(weeklyRestPay)})이 발생합니다. 주휴 미포함 표기라면 실효 시급은 표기 시급의 1.2배가 됩니다. 사업장 규모와 무관하게 적용됩니다.`,
    })
  } else {
    skippedRules.push({
      id: 'WEEKLY_REST',
      label: '주휴수당',
      reason: '주 소정근로 15시간 미만은 주휴수당이 발생하지 않습니다 (근로기준법 18조 3항).',
    })
  }

  // 3) 연장·야간·휴일 가산 (상시 5인 이상만 의무)
  const hasPremiumHours = overtime > 0 || night > 0 || holiday > 0
  let weeklyPremiumPay = 0
  if (hasPremiumHours) {
    if (context.fiveOrMore) {
      const holidayWithin8 = Math.min(holiday, HOLIDAY_BASE_HOURS)
      const holidayOver8 = Math.max(holiday - HOLIDAY_BASE_HOURS, 0)
      weeklyPremiumPay =
        basicHourly *
        (overtime * PREMIUM_RATE +
          night * PREMIUM_RATE +
          holidayWithin8 * PREMIUM_RATE +
          holidayOver8 * HOLIDAY_OVER_8H_PREMIUM_RATE)
      appliedRules.push({
        id: 'PREMIUM',
        label: '연장·야간·휴일 가산수당',
        reason: `연장·야간(22~06시)·휴일 각 50% 가산(휴일 8시간 초과분 100%), 연장과 야간이 겹치면 중복 가산합니다 (근로기준법 56조). 예상 가산분: 주 ${formatCurrency(weeklyPremiumPay)}.`,
      })
    } else {
      skippedRules.push({
        id: 'PREMIUM',
        label: '연장·야간·휴일 가산수당',
        reason:
          '상시 5인 미만 사업장은 연장·야간·휴일 가산수당 지급 의무가 없습니다 (근로기준법 11조, 시행령 별표1). 해당 시간은 기본시급으로만 계산했습니다.',
      })
    }
  }

  // 4) 수습 하한
  let minimumFloor = MINIMUM_HOURLY_WAGE
  if (input.probation === null) {
    skippedRules.push({
      id: 'PROBATION_REDUCTION',
      label: '수습 최저임금 하한(90%)',
      reason: '수습 기간이 아니므로 일반 최저시급 하한이 적용됩니다.',
    })
  } else if (context.probationReduced) {
    minimumFloor = PROBATION_MINIMUM_HOURLY_WAGE
    appliedRules.push({
      id: 'PROBATION_REDUCTION',
      label: '수습 최저임금 하한(90%)',
      reason: `계약 1년 이상 + 수습 시작 3개월 이내 + 단순노무직 아님을 모두 충족해 최저임금 하한이 ${formatCurrency(PROBATION_MINIMUM_HOURLY_WAGE)}으로 내려갑니다. 받기로 한 시급이 줄어드는 것이 아니라 법정 하한만 낮아집니다 (최저임금법 5조 2항).`,
    })
  } else {
    const reasons =
      input.probation === 'UNKNOWN'
        ? ['수습 감액 조건을 충족하지 않는다고 가정했습니다.']
        : probationSkipReasons(input.probation)
    skippedRules.push({
      id: 'PROBATION_REDUCTION',
      label: '수습 최저임금 하한(90%)',
      reason: reasons.join(' '),
    })
  }

  // 5) 최저임금 미달 판정 — 항상 주휴 제외 기본시급 기준
  if (basicHourly < minimumFloor - 1e-9) {
    warnings.push(
      `최저임금 미달 가능성: 주휴 제외 기본시급 ${formatCurrency(basicHourly)}이(가) ${WAGE_YEAR}년 하한 ${formatCurrency(minimumFloor)}보다 낮습니다.`,
    )
  }

  // 실효 시급 = (기본 + 주휴 + 가산) 주급 ÷ 실제 근로시간(소정+연장+휴일)
  const totalWorkedHours = hours + overtime + holiday
  const weeklyBasePay = basicHourly * totalWorkedHours
  const effectiveHourlyWage =
    (weeklyBasePay + weeklyRestPay + weeklyPremiumPay) / totalWorkedHours

  return {
    assumptions,
    effectiveHourlyWage,
    breakdown: {
      basicHourly,
      weeklyRestPerHour: weeklyRestPay / totalWorkedHours,
      premiumPerHour: weeklyPremiumPay / totalWorkedHours,
    },
    appliedRules,
    skippedRules,
    warnings,
  }
}

export function calculateWage(input: WageCalculatorInput): WageCalculationResult {
  const errors = validate(input)
  if (errors.length > 0) return { ok: false, errors }

  const fiveOrMoreOptions: Array<{ value: boolean; assumed: boolean }> =
    input.workplaceHasFiveOrMore === 'UNKNOWN'
      ? [
          { value: true, assumed: true },
          { value: false, assumed: true },
        ]
      : [{ value: input.workplaceHasFiveOrMore, assumed: false }]

  const probationOptions: Array<{ reduced: boolean; assumed: boolean }> =
    input.probation === 'UNKNOWN'
      ? [
          { reduced: true, assumed: true },
          { reduced: false, assumed: true },
        ]
      : [
          {
            reduced:
              input.probation !== null && probationReductionApplies(input.probation),
            assumed: false,
          },
        ]

  const scenarios: WageScenario[] = []
  for (const five of fiveOrMoreOptions) {
    for (const probation of probationOptions) {
      scenarios.push(
        buildScenario(input, {
          fiveOrMore: five.value,
          fiveOrMoreAssumed: five.assumed,
          probationReduced: probation.reduced,
          probationAssumed: probation.assumed,
        }),
      )
    }
  }

  return {
    ok: true,
    scenarios,
    monthlyContractHours:
      input.wage.type === 'MONTHLY'
        ? monthlyContractHoursOf(input.weeklyContractHours)
        : undefined,
  }
}
