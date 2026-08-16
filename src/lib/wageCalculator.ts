import { WAGE_RULES_2026 } from './wageRules2026'

/** 계산기가 다루는 임금 유형 — 건별(PER_TASK) 공고는 범위 밖이다. */
export interface CalculatorWage {
  type: 'HOURLY' | 'MONTHLY'
  amount: number
}

export interface ProbationConditions {
  /** 수습 시작일 기준 3개월 이내인지 */
  isWithinFirstThreeMonths: boolean
  /** 근로계약 기간 (개월) */
  contractMonths: number
  /** 배달·서빙·청소 등 단순노무직인지 */
  isSimpleLabor: boolean
}

export interface WageCalculatorInput {
  wage: CalculatorWage
  /** 공고가 "주휴수당 포함" 시급으로 표기했는지 */
  wageIncludesWeeklyRest: boolean
  /** 주 소정근로시간 — 0 초과 40 이하(법정 상한)만 유효 */
  weeklyContractHours: number
  workplaceHasFiveOrMore: boolean | 'UNKNOWN'
  /** null = 수습 아님, 'UNKNOWN' = 모름 */
  probation: ProbationConditions | null | 'UNKNOWN'
  /** 예상 연장근로 (시간/주) */
  expectedOvertimeHours?: number
  /** 예상 야간근로(22~06시, 시간/주) — 연장·휴일과 겹치는 부분집합일 수 있다 */
  expectedNightHours?: number
  /** 예상 휴일근로 (시간/주) */
  expectedHolidayHours?: number
}

/** 규칙별 적용·미적용 기록 — UI가 그대로 렌더한다. */
export interface RuleNote {
  id: string
  label: string
  reason: string
}

export interface WageWarning {
  id: 'BELOW_MINIMUM_WAGE'
  message: string
}

export interface WageBreakdown {
  /** 주휴 제외 기본시급 */
  baseHourly: number
  /** 근무 1시간당 주휴수당 환산분 */
  weeklyRestPerHour: number
  /** 근무 1시간당 가산수당 예상분 */
  premiumPerHour: number
}

export interface WageScenarioResult {
  /** 근무 1시간당 세전 총수입 (개근 가정) */
  effectiveHourlyWage: number
  /** 주휴 제외 기본시급 — 최저임금 판정 기준 */
  baseHourlyWage: number
  breakdown: WageBreakdown
  /** 월급 환산 분모 (MONTHLY일 때만, 주휴시간 포함) */
  monthlyStandardHours: number | null
  appliedRules: RuleNote[]
  skippedRules: RuleNote[]
  warnings: WageWarning[]
}

export interface WageScenario {
  /** '모름' 입력을 분기한 가정 라벨. 확정 입력이면 빈 배열 */
  assumptions: string[]
  result: WageScenarioResult
}

/**
 * 개인별 월 소정근로시간 = (주 소정근로시간 + 주휴시간) × 365 / 7 / 12, 올림.
 * 주휴시간은 주 15시간 미만이면 0. 주 40시간이면 208.57 → 209.
 */
export function monthlyStandardHours(weeklyContractHours: number): number {
  assertValidWeeklyHours(weeklyContractHours)
  return Math.ceil(
    ((weeklyContractHours + weeklyRestHours(weeklyContractHours)) * 365) /
      7 /
      12,
  )
}

/** 시급 → 월급 환산 (개인별 월 소정근로시간 기준) */
export function hourlyToMonthly(
  hourlyWage: number,
  weeklyContractHours: number,
): number {
  return hourlyWage * monthlyStandardHours(weeklyContractHours)
}

/** 주휴시간 — 주 15시간 이상이면 (주 소정근로 / 40) × 8, 미만이면 0 */
function weeklyRestHours(weeklyContractHours: number): number {
  return weeklyContractHours >= WAGE_RULES_2026.weeklyRestMinHours
    ? (weeklyContractHours / 40) * 8
    : 0
}

function assertValidWeeklyHours(weeklyContractHours: number): void {
  if (
    !Number.isFinite(weeklyContractHours) ||
    weeklyContractHours <= 0 ||
    weeklyContractHours > WAGE_RULES_2026.maxWeeklyContractHours
  ) {
    throw new RangeError(
      `주 소정근로시간은 0 초과 ${WAGE_RULES_2026.maxWeeklyContractHours} 이하여야 합니다: ${weeklyContractHours}`,
    )
  }
}

/**
 * 임금 계산 진입점. '모름' 입력(사업장 규모, 수습)은 가정별 시나리오로
 * 분기해 나란히 반환한다. 확정 입력이면 시나리오는 1개다.
 */
export function calculateWage(input: WageCalculatorInput): WageScenario[] {
  assertValidWeeklyHours(input.weeklyContractHours)
  if (!Number.isFinite(input.wage.amount) || input.wage.amount <= 0) {
    throw new RangeError(`임금은 0보다 커야 합니다: ${input.wage.amount}`)
  }
  for (const hours of [
    input.expectedOvertimeHours,
    input.expectedNightHours,
    input.expectedHolidayHours,
  ]) {
    if (hours !== undefined && (!Number.isFinite(hours) || hours < 0)) {
      throw new RangeError(`예상 근로시간은 0 이상이어야 합니다: ${hours}`)
    }
  }

  const fiveOrMoreOptions =
    input.workplaceHasFiveOrMore === 'UNKNOWN'
      ? [
          { value: true, assumption: '상시 5인 이상 사업장 가정' },
          { value: false, assumption: '상시 5인 미만 사업장 가정' },
        ]
      : [{ value: input.workplaceHasFiveOrMore, assumption: null }]

  const probationOptions =
    input.probation === 'UNKNOWN'
      ? [
          {
            value: {
              isWithinFirstThreeMonths: true,
              contractMonths: 12,
              isSimpleLabor: false,
            },
            assumption: '수습 하한(90%) 적용 조건 충족 가정',
          },
          { value: null, assumption: '수습 아님 가정' },
        ]
      : [{ value: input.probation, assumption: null }]

  const scenarios: WageScenario[] = []
  for (const probation of probationOptions) {
    for (const fiveOrMore of fiveOrMoreOptions) {
      scenarios.push({
        assumptions: [fiveOrMore.assumption, probation.assumption].filter(
          (label): label is string => label !== null,
        ),
        result: calculateScenario(input, fiveOrMore.value, probation.value),
      })
    }
  }
  return scenarios
}

function calculateScenario(
  input: WageCalculatorInput,
  fiveOrMore: boolean,
  probation: ProbationConditions | null,
): WageScenarioResult {
  const appliedRules: RuleNote[] = []
  const skippedRules: RuleNote[] = []
  const warnings: WageWarning[] = []

  const contractHours = input.weeklyContractHours
  const restHours = weeklyRestHours(contractHours)
  const restApplies = restHours > 0

  // 1) 주휴 제외 기본시급 도출 — 최저임금 판정은 항상 이 값으로 한다
  let baseHourly: number
  let monthlyHoursDenominator: number | null = null
  if (input.wage.type === 'MONTHLY') {
    // 분모(월 소정근로시간)가 주휴를 이미 흡수하므로 추가 역산(이중 차감) 금지
    monthlyHoursDenominator = monthlyStandardHours(contractHours)
    baseHourly = input.wage.amount / monthlyHoursDenominator
    appliedRules.push({
      id: 'MONTHLY_CONVERSION',
      label: '월급→시급 환산',
      reason: `개인별 월 소정근로시간 ${monthlyHoursDenominator}시간(주휴시간 포함, (주 ${contractHours}시간 + 주휴 ${restHours}시간) × 365 ÷ 7 ÷ 12 올림) 기준으로 환산했습니다. 분모에 주휴가 포함돼 있어 시급 표기 공고와 단순 비교하면 오해할 수 있습니다.`,
    })
  } else if (input.wageIncludesWeeklyRest && restApplies) {
    // "주휴수당 포함" 표기 시급 → 기본시급 역산 (÷1.2 = ×5/6)
    baseHourly = (input.wage.amount * 5) / 6
    appliedRules.push({
      id: 'WEEKLY_REST_REVERSAL',
      label: '주휴 포함 표기 역산',
      reason: `표기 시급에 주휴수당이 포함돼 있어 ÷1.2로 주휴 제외 기본시급을 역산했습니다. 중복 가산하지 않습니다.`,
    })
  } else {
    baseHourly = input.wage.amount
    if (input.wageIncludesWeeklyRest && !restApplies) {
      skippedRules.push({
        id: 'WEEKLY_REST_REVERSAL',
        label: '주휴 포함 표기 역산',
        reason:
          '주 소정근로 15시간 미만이면 주휴수당 자체가 발생하지 않으므로 역산하지 않고 표기 시급을 그대로 기본시급으로 봅니다.',
      })
    }
  }

  // 2) 주휴수당 (근로기준법 55조) — 사업장 규모 무관, 개근 전제
  if (restApplies) {
    const reason =
      input.wage.type === 'MONTHLY'
        ? `주 소정근로 ${contractHours}시간 ≥ 15시간으로 개근 가정 시 주휴수당이 발생합니다. 월급 환산 분모가 주휴시간을 이미 포함하므로 별도 가산 없이 실효 시급은 기본시급의 1.2배입니다.`
        : input.wageIncludesWeeklyRest
          ? `주 소정근로 ${contractHours}시간 ≥ 15시간으로 개근 가정 시 주휴수당이 발생합니다. 표기 시급에 이미 포함돼 있습니다.`
          : `주 소정근로 ${contractHours}시간 ≥ 15시간으로 개근 가정 시 주휴수당(1일분 = 주 소정근로 ÷ 40 × 8 × 시급)이 발생해, 실효 시급이 표기 시급의 1.2배가 됩니다.`
    appliedRules.push({ id: 'WEEKLY_REST', label: '주휴수당', reason })
  } else {
    skippedRules.push({
      id: 'WEEKLY_REST',
      label: '주휴수당',
      reason: `주 소정근로 ${contractHours}시간 < 15시간이라 주휴수당이 발생하지 않습니다 (근로기준법 시행령 30조).`,
    })
  }

  // 3) 가산수당 (근로기준법 56조) — 상시 5인 이상 사업장만 의무
  const overtime = input.expectedOvertimeHours ?? 0
  const night = input.expectedNightHours ?? 0
  const holiday = input.expectedHolidayHours ?? 0
  const totalWorkedHours = contractHours + overtime + holiday
  let premiumPay = 0
  if (fiveOrMore) {
    premiumPay =
      0.5 * baseHourly * overtime +
      0.5 * baseHourly * night +
      0.5 * baseHourly * Math.min(holiday, 8) +
      1.0 * baseHourly * Math.max(holiday - 8, 0)
    if (premiumPay > 0) {
      appliedRules.push({
        id: 'OVERTIME_NIGHT_HOLIDAY',
        label: '연장·야간·휴일 가산',
        reason:
          '연장·야간(22~06시)·휴일 근로 각 50% 가산, 휴일 8시간 초과분은 100% 가산 (근로기준법 56조). 연장과 야간이 겹치면 양쪽 모두 가산합니다.',
      })
    }
  } else {
    skippedRules.push({
      id: 'OVERTIME_NIGHT_HOLIDAY',
      label: '연장·야간·휴일 가산',
      reason:
        '상시 5인 미만 사업장은 연장·야간·휴일 가산수당 지급 의무가 없습니다 (근로기준법 11조).',
    })
  }

  // 4) 수습 하한 (최저임금법 5조 2항) — 3조건 모두 충족해야 90%로 인하
  let minimumFloor: number = WAGE_RULES_2026.minimumHourlyWage
  if (probation !== null) {
    const failedConditions: string[] = []
    if (probation.contractMonths < 12) failedConditions.push('계약기간 1년 미만')
    if (!probation.isWithinFirstThreeMonths)
      failedConditions.push('수습 시작 3개월 경과')
    if (probation.isSimpleLabor)
      failedConditions.push(
        '단순노무직(배달·서빙·청소 등)은 수습이어도 감액 불가',
      )
    if (failedConditions.length === 0) {
      minimumFloor = WAGE_RULES_2026.probationMinimumHourlyWage
      appliedRules.push({
        id: 'PROBATION_FLOOR',
        label: '수습 최저임금 하한 90%',
        reason: `수습 3조건(계약 1년 이상 · 수습 3개월 이내 · 단순노무직 아님)을 모두 충족해 최저임금 하한이 ${WAGE_RULES_2026.probationMinimumHourlyWage.toLocaleString('ko-KR')}원으로 내려갑니다. 받기로 한 시급이 줄어든다는 뜻이 아니라, 하한선이 낮아진다는 뜻입니다.`,
      })
    } else {
      skippedRules.push({
        id: 'PROBATION_FLOOR',
        label: '수습 최저임금 하한 90%',
        reason: `${failedConditions.join(', ')} — 조건 미충족으로 하한 인하가 불가합니다. 최저시급 ${WAGE_RULES_2026.minimumHourlyWage.toLocaleString('ko-KR')}원이 그대로 적용됩니다.`,
      })
    }
  }

  // 5) 최저임금 미달 판정 — 항상 주휴 제외 기본시급 기준
  if (baseHourly < minimumFloor) {
    warnings.push({
      id: 'BELOW_MINIMUM_WAGE',
      message: `주휴 제외 기본시급 ${Math.round(baseHourly).toLocaleString('ko-KR')}원이 하한 ${minimumFloor.toLocaleString('ko-KR')}원에 미달합니다.`,
    })
  }

  const basePay = baseHourly * totalWorkedHours
  const restPay = baseHourly * restHours
  const effectiveHourlyWage = (basePay + restPay + premiumPay) / totalWorkedHours

  return {
    effectiveHourlyWage,
    baseHourlyWage: baseHourly,
    breakdown: {
      baseHourly,
      weeklyRestPerHour: restPay / totalWorkedHours,
      premiumPerHour: premiumPay / totalWorkedHours,
    },
    monthlyStandardHours: monthlyHoursDenominator,
    appliedRules,
    skippedRules,
    warnings,
  }
}
