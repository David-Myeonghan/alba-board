import { WAGE_POLICY_2026 as POLICY } from './wagePolicy2026'

/**
 * 실효 시급 계산기 (UI 무관 순수 함수).
 * 목적: 표기 임금과, 주휴·가산·수습 하한까지 반영한 세전 실효 시급의
 * 차이를 분해해 보여준다. 세금·4대보험은 계산하지 않는다 (세전, 개근 가정).
 */

export type CalculatorWageType = 'HOURLY' | 'MONTHLY'

export interface Probation {
  /** 수습 시작일 기준 3개월 이내인지 */
  isWithinFirstThreeMonths: boolean
  /** 근로계약 기간 (개월) */
  contractMonths: number
  /** 단순노무직 여부 (배달·서빙·청소 등) */
  isSimpleLabor: boolean
}

export interface WageCalcInput {
  wage: { type: CalculatorWageType; amount: number }
  /** 공고의 "주휴수당 포함" 표기 여부 */
  wageIncludesWeeklyRest: boolean
  /** 주 소정근로시간 — 0 초과 40 이하만 유효 */
  weeklyContractHours: number
  workplaceHasFiveOrMore: boolean | 'UNKNOWN'
  /** null = 수습 아님, 'UNKNOWN' = 모름 */
  probation: Probation | null | 'UNKNOWN'
  expectedOvertimeHours?: number
  /** 야간(22~06시)은 소정·연장·휴일과 겹치는 부분집합 — 겹치는 시간은 양쪽 모두 가산 */
  expectedNightHours?: number
  expectedHolidayHours?: number
}

export interface RuleNote {
  rule: string
  reason: string
}

export interface WageWarning {
  code: 'BELOW_MINIMUM_WAGE'
  message: string
}

export interface WageScenario {
  /** '모름' 차원의 가정 라벨 — 모두 확정 입력이면 빈 배열 */
  assumptions: string[]
  /** 총 세전 주급 / 총 근로시간 (소정 + 연장 + 휴일) */
  effectiveHourlyWage: number
  breakdown: {
    /** 주휴 제외 기본시급 (최저임금 판정 기준) */
    baseHourly: number
    /** 주휴수당을 근로시간당으로 환산한 몫 */
    weeklyRestHourly: number
    /** 가산수당 예상분을 근로시간당으로 환산한 몫 */
    premiumHourly: number
  }
  appliedRules: RuleNote[]
  skippedRules: RuleNote[]
  warnings: WageWarning[]
}

export type WageCalcResult =
  | { ok: true; scenarios: WageScenario[]; statedHourly: number }
  | { ok: false; errors: string[] }

/**
 * 개인별 월 소정근로시간: (주 소정근로 + 주휴시간) × 365 / 7 / 12, 올림 관행.
 * 주 40시간이면 208.57 → 209. 209는 특수해일 뿐 파트타임에 고정으로 쓰지 않는다.
 */
export function getMonthlyStandardHours(weeklyContractHours: number): number {
  const restHours = getWeeklyRestHours(weeklyContractHours)
  return Math.ceil(((weeklyContractHours + restHours) * 365) / 7 / 12)
}

/** 시급 → 월급 환산 (분모에 주휴가 이미 포함돼 있어 주휴를 흡수한다) */
export function convertHourlyToMonthly(
  hourly: number,
  weeklyContractHours: number,
): number {
  return hourly * getMonthlyStandardHours(weeklyContractHours)
}

/** 주휴시간: 주 15시간 미만은 0, 이상이면 (주 소정근로 / 40) × 8 */
function getWeeklyRestHours(weeklyContractHours: number): number {
  if (weeklyContractHours < POLICY.weeklyRestMinHours) return 0
  return (weeklyContractHours / POLICY.fullTimeWeeklyHours) * POLICY.fullTimeRestHours
}

function validate(input: WageCalcInput): string[] {
  const errors: string[] = []
  const { weeklyContractHours: hours } = input
  const overtime = input.expectedOvertimeHours ?? 0
  const night = input.expectedNightHours ?? 0
  const holiday = input.expectedHolidayHours ?? 0

  if (!(hours > 0 && hours <= POLICY.legalMaxWeeklyHours)) {
    errors.push(
      `주 소정근로시간은 0 초과 ${POLICY.legalMaxWeeklyHours} 이하여야 합니다 (법정 상한).`,
    )
  }
  if (!(input.wage.amount > 0)) {
    errors.push('임금은 0보다 큰 금액이어야 합니다.')
  }
  if (overtime < 0 || night < 0 || holiday < 0) {
    errors.push('연장·야간·휴일 예상 시간은 음수일 수 없습니다.')
  }
  if (night > hours + overtime + holiday) {
    errors.push('야간 시간은 소정·연장·휴일 근로시간의 부분집합이라 총 근로시간을 넘을 수 없습니다.')
  }
  return errors
}

interface ResolvedContext {
  assumptions: string[]
  hasFiveOrMore: boolean
  probation: Probation | null
}

/** '모름' 입력을 시나리오 조합으로 확장한다 (차원당 2개, 최대 4개) */
function expandScenarios(input: WageCalcInput): ResolvedContext[] {
  const fiveOptions: Array<{ value: boolean; assumption?: string }> =
    input.workplaceHasFiveOrMore === 'UNKNOWN'
      ? [
          { value: true, assumption: '상시 5인 이상 사업장 가정' },
          { value: false, assumption: '상시 5인 미만 사업장 가정' },
        ]
      : [{ value: input.workplaceHasFiveOrMore }]

  const probationOptions: Array<{ value: Probation | null; assumption?: string }> =
    input.probation === 'UNKNOWN'
      ? [
          { value: null, assumption: '수습 아님 가정' },
          {
            value: {
              isWithinFirstThreeMonths: true,
              contractMonths: POLICY.probationMinContractMonths,
              isSimpleLabor: false,
            },
            assumption: '수습(감액 3조건 충족) 가정',
          },
        ]
      : [{ value: input.probation }]

  return fiveOptions.flatMap((five) =>
    probationOptions.map((probation) => ({
      assumptions: [five.assumption, probation.assumption].filter(
        (label): label is string => label !== undefined,
      ),
      hasFiveOrMore: five.value,
      probation: probation.value,
    })),
  )
}

/** 주휴 제외 기본시급을 구한다. 최저임금 판정과 가산수당의 기준 단가. */
function deriveBaseHourly(
  input: WageCalcInput,
  restHours: number,
  applied: RuleNote[],
  skipped: RuleNote[],
): number {
  const { wage, weeklyContractHours: hours } = input

  if (wage.type === 'MONTHLY') {
    const monthlyHours = getMonthlyStandardHours(hours)
    applied.push({
      rule: '월급 시급 환산',
      reason:
        `월 소정근로시간 ${monthlyHours}시간(주 ${hours}시간 + 주휴 ${restHours}시간 기준, 올림)으로 나눴습니다. ` +
        '이 분모에 주휴시간이 이미 포함돼 있어 시급 공고의 표기 시급과 단순 비교하면 안 됩니다.',
    })
    return wage.amount / monthlyHours
  }

  if (input.wageIncludesWeeklyRest) {
    if (restHours > 0) {
      applied.push({
        rule: '주휴 포함 시급 역산',
        reason:
          '표기 시급에 주휴수당이 이미 포함돼 있어 중복 가산하지 않고, 주휴 제외 기본시급을 역산했습니다.',
      })
      // 주휴 포함 표기 = 기본시급 × (소정 + 주휴) / 소정. 15h 이상에서는 항상 1.2배.
      return wage.amount * (hours / (hours + restHours))
    }
    skipped.push({
      rule: '주휴 포함 시급 역산',
      reason:
        '주 15시간 미만이라 주휴수당 자체가 발생하지 않아, 역산 없이 표기 시급을 그대로 기본시급으로 봅니다.',
    })
    return wage.amount
  }

  return wage.amount
}

/** 주당 가산수당 금액 (5인 이상 사업장만 의무) */
function deriveWeeklyPremiumPay(
  input: WageCalcInput,
  context: ResolvedContext,
  baseHourly: number,
  applied: RuleNote[],
  skipped: RuleNote[],
): number {
  const overtime = input.expectedOvertimeHours ?? 0
  const night = input.expectedNightHours ?? 0
  const holiday = input.expectedHolidayHours ?? 0
  if (overtime + night + holiday === 0) return 0

  if (!context.hasFiveOrMore) {
    skipped.push({
      rule: '연장·야간·휴일 가산수당',
      reason:
        '상시 5인 미만 사업장은 근로기준법 56조 가산수당 지급 의무가 없어 가산분을 계산에 넣지 않았습니다.',
    })
    return 0
  }

  const holidayBase = Math.min(holiday, POLICY.holidayPremiumBaseHours)
  const holidayOver = Math.max(holiday - POLICY.holidayPremiumBaseHours, 0)
  const premiumHours =
    overtime * POLICY.overtimePremiumRate +
    night * POLICY.nightPremiumRate +
    holidayBase * POLICY.holidayPremiumRate +
    holidayOver * POLICY.holidayOverBasePremiumRate

  applied.push({
    rule: '연장·야간·휴일 가산수당',
    reason:
      '연장·야간(22~06시)·휴일 각 50% 가산(휴일 8시간 초과분 100%), 연장과 야간이 겹치면 양쪽 모두 가산했습니다.',
  })
  return premiumHours * baseHourly
}

/** 수습 감액 3조건을 판정해 최저임금 하한을 결정한다 */
function deriveMinimumWageFloor(
  probation: Probation | null,
  applied: RuleNote[],
  skipped: RuleNote[],
): number {
  if (probation === null) return POLICY.minimumHourlyWage

  const failures: string[] = []
  if (probation.contractMonths < POLICY.probationMinContractMonths) {
    failures.push('계약기간이 1년 미만')
  }
  if (!probation.isWithinFirstThreeMonths) {
    failures.push('수습 시작 3개월 경과')
  }
  if (probation.isSimpleLabor) {
    failures.push('단순노무직(배달·서빙·청소 등)은 감액 자체가 불가')
  }

  if (failures.length > 0) {
    skipped.push({
      rule: '수습 최저임금 감액',
      reason: `${failures.join(', ')}이므로 최저임금 하한은 ${POLICY.minimumHourlyWage.toLocaleString('ko-KR')}원 그대로입니다. 받기로 한 시급이 줄어드는 것이 아니라, 하한 인하가 불가하다는 뜻입니다.`,
    })
    return POLICY.minimumHourlyWage
  }

  applied.push({
    rule: '수습 최저임금 감액',
    reason: `계약 1년 이상 + 수습 3개월 이내 + 단순노무직 아님을 모두 충족해 최저임금 하한이 90%(${POLICY.probationMinimumHourlyWage.toLocaleString('ko-KR')}원)로 내려갑니다. 약정 시급을 깎을 수 있다는 뜻은 아닙니다.`,
  })
  return POLICY.probationMinimumHourlyWage
}

function computeScenario(input: WageCalcInput, context: ResolvedContext): WageScenario {
  const applied: RuleNote[] = []
  const skipped: RuleNote[] = []
  const warnings: WageWarning[] = []

  const hours = input.weeklyContractHours
  const restHours = getWeeklyRestHours(hours)
  const overtime = input.expectedOvertimeHours ?? 0
  const holiday = input.expectedHolidayHours ?? 0
  /** 주당 총 근로시간 — 야간은 다른 시간대와 겹치는 부분집합이라 더하지 않는다 */
  const totalWorkedHours = hours + overtime + holiday

  const baseHourly = deriveBaseHourly(input, restHours, applied, skipped)

  if (restHours > 0) {
    applied.push({
      rule: '주휴수당',
      reason:
        `주 소정근로 15시간 이상 + 개근 전제로 주휴 ${restHours}시간이 발생합니다. ` +
        '주휴 미포함 표기라면 실효 시급은 표기 시급의 1.2배가 됩니다.',
    })
  } else {
    skipped.push({
      rule: '주휴수당',
      reason: '주 소정근로 15시간 미만이라 주휴수당이 발생하지 않습니다 (사업장 규모 무관).',
    })
  }

  const weeklyRestPay = restHours * baseHourly
  const weeklyPremiumPay = deriveWeeklyPremiumPay(input, context, baseHourly, applied, skipped)

  const weeklyRestHourly = weeklyRestPay / totalWorkedHours
  const premiumHourly = weeklyPremiumPay / totalWorkedHours
  const effectiveHourlyWage = baseHourly + weeklyRestHourly + premiumHourly

  const floor = deriveMinimumWageFloor(context.probation, applied, skipped)
  if (baseHourly + 1e-9 < floor) {
    warnings.push({
      code: 'BELOW_MINIMUM_WAGE',
      message: `주휴 제외 기본시급 ${Math.round(baseHourly).toLocaleString('ko-KR')}원이 최저임금 하한 ${floor.toLocaleString('ko-KR')}원에 미달합니다.`,
    })
  }

  return {
    assumptions: context.assumptions,
    effectiveHourlyWage,
    breakdown: { baseHourly, weeklyRestHourly, premiumHourly },
    appliedRules: applied,
    skippedRules: skipped,
    warnings,
  }
}

export function calculateWage(input: WageCalcInput): WageCalcResult {
  const errors = validate(input)
  if (errors.length > 0) return { ok: false, errors }

  const scenarios = expandScenarios(input).map((context) => computeScenario(input, context))
  const statedHourly =
    input.wage.type === 'HOURLY'
      ? input.wage.amount
      : input.wage.amount / getMonthlyStandardHours(input.weeklyContractHours)

  return { ok: true, scenarios, statedHourly }
}
