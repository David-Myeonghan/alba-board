import { describe, expect, it } from 'vitest'
import {
  calculateWage,
  convertHourlyToMonthly,
  getMonthlyStandardHours,
} from './wageCalculator'
import type { WageCalcInput } from './wageCalculator'

/** 확정 입력 기본값 — 케이스마다 필요한 필드만 덮어쓴다 */
function makeInput(overrides: Partial<WageCalcInput> = {}): WageCalcInput {
  return {
    wage: { type: 'HOURLY', amount: 10320 },
    wageIncludesWeeklyRest: false,
    weeklyContractHours: 40,
    workplaceHasFiveOrMore: true,
    probation: null,
    ...overrides,
  }
}

/** ok 결과에서 시나리오 하나를 꺼낸다. 확정 입력이면 시나리오는 1개여야 한다. */
function single(input: WageCalcInput) {
  const result = calculateWage(input)
  if (!result.ok) throw new Error(`계산 실패: ${result.errors.join(', ')}`)
  expect(result.scenarios).toHaveLength(1)
  return result.scenarios[0]
}

describe('주휴수당 발생 경계 (주 15시간)', () => {
  it.each([
    { hours: 14.9, expected: 10320, label: '주 14.9시간 — 주휴 미발생, 실효 = 표기' },
    { hours: 15.0, expected: 12384, label: '주 15.0시간 — 주휴 발생, 실효 = 표기 × 1.2' },
  ])('$label', ({ hours, expected }) => {
    const scenario = single(makeInput({ weeklyContractHours: hours }))
    expect(scenario.effectiveHourlyWage).toBeCloseTo(expected, 2)
  })

  it('경계에서 실효 시급이 계단식으로 뛴다 (14.9h < 15.0h)', () => {
    const below = single(makeInput({ weeklyContractHours: 14.9 }))
    const at = single(makeInput({ weeklyContractHours: 15 }))
    expect(at.effectiveHourlyWage).toBeGreaterThan(below.effectiveHourlyWage)
    expect(below.breakdown.weeklyRestHourly).toBe(0)
  })

  it('주휴 미포함 표기 + 15시간 이상이면 1.2배가 됨을 사유에 드러낸다', () => {
    const scenario = single(makeInput({ weeklyContractHours: 40 }))
    const rest = scenario.appliedRules.find((r) => r.rule.includes('주휴'))
    expect(rest).toBeDefined()
    expect(rest?.reason).toContain('1.2배')
  })
})

describe('가산수당 — 사업장 규모 분기', () => {
  const extras = {
    expectedOvertimeHours: 4,
    expectedNightHours: 4, // 연장과 완전히 겹치는 야간 → 양쪽 모두 가산
  }
  // 주 40 + 연장 4 = 총 44시간. 가산분 = (4×0.5 + 4×0.5) × 10,320 = 41,280원/주

  it('5인 이상: 연장+야간 중복 가산이 실효 시급에 반영된다', () => {
    const scenario = single(makeInput({ workplaceHasFiveOrMore: true, ...extras }))
    expect(scenario.breakdown.premiumHourly).toBeCloseTo(41280 / 44, 2)
    expect(scenario.appliedRules.some((r) => r.rule.includes('가산'))).toBe(true)
  })

  it('4인 이하: 동일 입력이어도 가산이 붙지 않고 사유가 남는다', () => {
    const scenario = single(makeInput({ workplaceHasFiveOrMore: false, ...extras }))
    expect(scenario.breakdown.premiumHourly).toBe(0)
    const skipped = scenario.skippedRules.find((r) => r.rule.includes('가산'))
    expect(skipped).toBeDefined()
    expect(skipped?.reason).toContain('5인 미만')
  })

  it('휴일 8시간 초과분은 100% 가산한다', () => {
    const scenario = single(makeInput({ expectedHolidayHours: 10 }))
    // 가산분 = (8×0.5 + 2×1.0) × 10,320 = 61,920원 / 총 50시간
    expect(scenario.breakdown.premiumHourly).toBeCloseTo(61920 / 50, 2)
  })
})

describe('수습 최저임금 감액 — 3조건 모두 충족해야만 하한 90%', () => {
  const belowMinimum = { wage: { type: 'HOURLY' as const, amount: 9500 } }

  it.each([
    {
      label: '계약 1년 미만 → 감액 불가',
      probation: { isWithinFirstThreeMonths: true, contractMonths: 6, isSimpleLabor: false },
    },
    {
      label: '수습 3개월 경과 → 감액 불가',
      probation: { isWithinFirstThreeMonths: false, contractMonths: 12, isSimpleLabor: false },
    },
    {
      label: '단순노무직 → 감액 불가',
      probation: { isWithinFirstThreeMonths: true, contractMonths: 12, isSimpleLabor: true },
    },
  ])('$label — 하한은 10,320원 유지, 9,500원은 미달 경고', ({ probation }) => {
    const scenario = single(makeInput({ ...belowMinimum, probation }))
    expect(scenario.warnings.some((w) => w.code === 'BELOW_MINIMUM_WAGE')).toBe(true)
    expect(scenario.skippedRules.some((r) => r.rule.includes('수습'))).toBe(true)
  })

  it('3조건 모두 충족 시에만 하한이 9,288원으로 내려간다 (9,500원 → 경고 없음)', () => {
    const scenario = single(
      makeInput({
        ...belowMinimum,
        probation: { isWithinFirstThreeMonths: true, contractMonths: 12, isSimpleLabor: false },
      }),
    )
    expect(scenario.warnings).toHaveLength(0)
    expect(scenario.appliedRules.some((r) => r.rule.includes('수습'))).toBe(true)
  })
})

describe('월급 ↔ 시급 환산 — 개인별 월 소정근로시간 분모', () => {
  it('주 40시간 분모는 209시간 (208.57 올림 관행)', () => {
    expect(getMonthlyStandardHours(40)).toBe(209)
  })

  it('월급 2,156,880원(주 40시간) → 시급 10,320원 → 월급 왕복이 손실 없이 일치', () => {
    const scenario = single(makeInput({ wage: { type: 'MONTHLY', amount: 2156880 } }))
    expect(scenario.breakdown.baseHourly).toBe(10320)
    expect(convertHourlyToMonthly(10320, 40)).toBe(2156880)
  })

  it('주 20시간 월급 공고: 분모는 209가 아니라 105시간(= (20+4)×365/7/12 올림)', () => {
    expect(getMonthlyStandardHours(20)).toBe(105)
    const scenario = single(
      makeInput({ wage: { type: 'MONTHLY', amount: 1050000 }, weeklyContractHours: 20 }),
    )
    expect(scenario.breakdown.baseHourly).toBeCloseTo(10000, 2)
  })

  it('주 12시간(주휴 미발생) 월급 분모에는 주휴시간이 들어가지 않는다', () => {
    // 12 × 365/7/12 = 52.14... → 53
    expect(getMonthlyStandardHours(12)).toBe(53)
  })

  it('월 환산 사유에 분모가 주휴를 이미 포함함을 설명한다 (이중 차감 금지)', () => {
    const scenario = single(makeInput({ wage: { type: 'MONTHLY', amount: 2156880 } }))
    const note = scenario.appliedRules.find((r) => r.rule.includes('환산'))
    expect(note).toBeDefined()
    expect(note?.reason).toContain('주휴')
  })
})

describe('"주휴수당 포함" 표기 시급의 역산', () => {
  it('주 40시간 + 포함 표기 12,384원 → 기본시급 10,320원 역산, 실효는 표기와 동일(이중 가산 없음)', () => {
    const scenario = single(
      makeInput({ wage: { type: 'HOURLY', amount: 12384 }, wageIncludesWeeklyRest: true }),
    )
    expect(scenario.breakdown.baseHourly).toBeCloseTo(10320, 2)
    expect(scenario.effectiveHourlyWage).toBeCloseTo(12384, 2)
  })

  it('주 12시간 + 포함 표기: 주휴가 없으므로 역산하지 않고 표기가 그대로 기본시급', () => {
    const scenario = single(
      makeInput({
        wage: { type: 'HOURLY', amount: 11000 },
        wageIncludesWeeklyRest: true,
        weeklyContractHours: 12,
      }),
    )
    expect(scenario.breakdown.baseHourly).toBe(11000)
    expect(scenario.breakdown.weeklyRestHourly).toBe(0)
    expect(scenario.effectiveHourlyWage).toBe(11000)
  })
})

describe('최저임금 미달 경고 — 항상 주휴 제외 기본시급 기준', () => {
  it('시급 9,000원(미포함) → 미달 경고', () => {
    const scenario = single(makeInput({ wage: { type: 'HOURLY', amount: 9000 } }))
    expect(scenario.warnings.some((w) => w.code === 'BELOW_MINIMUM_WAGE')).toBe(true)
  })

  it('포함 표기 12,000원(주 40시간)은 표기가 최저 위여도 역산 기본시급 10,000원이 미달', () => {
    const scenario = single(
      makeInput({ wage: { type: 'HOURLY', amount: 12000 }, wageIncludesWeeklyRest: true }),
    )
    expect(scenario.breakdown.baseHourly).toBeCloseTo(10000, 2)
    expect(scenario.warnings.some((w) => w.code === 'BELOW_MINIMUM_WAGE')).toBe(true)
  })

  it('최저시급 10,320원 정각은 경고 없음', () => {
    const scenario = single(makeInput())
    expect(scenario.warnings).toHaveLength(0)
  })
})

describe("'모름' 입력의 시나리오 확장", () => {
  it('5인 여부 모름 → 두 시나리오를 가정 라벨과 함께 나란히 반환', () => {
    const result = calculateWage(
      makeInput({ workplaceHasFiveOrMore: 'UNKNOWN', expectedNightHours: 4 }),
    )
    if (!result.ok) throw new Error('계산 실패')
    expect(result.scenarios).toHaveLength(2)
    const [five, four] = result.scenarios
    expect(five.assumptions.join()).toContain('5인 이상')
    expect(four.assumptions.join()).toContain('5인 미만')
    expect(five.effectiveHourlyWage).toBeGreaterThan(four.effectiveHourlyWage)
  })

  it('수습 여부 모름 → 수습 아님 / 수습(3조건 충족) 두 시나리오', () => {
    const result = calculateWage(
      makeInput({ wage: { type: 'HOURLY', amount: 9500 }, probation: 'UNKNOWN' }),
    )
    if (!result.ok) throw new Error('계산 실패')
    expect(result.scenarios).toHaveLength(2)
    const [notProbation, probation] = result.scenarios
    expect(notProbation.warnings.some((w) => w.code === 'BELOW_MINIMUM_WAGE')).toBe(true)
    expect(probation.warnings).toHaveLength(0)
  })

  it('둘 다 모름 → 조합 4개 시나리오', () => {
    const result = calculateWage(
      makeInput({ workplaceHasFiveOrMore: 'UNKNOWN', probation: 'UNKNOWN' }),
    )
    if (!result.ok) throw new Error('계산 실패')
    expect(result.scenarios).toHaveLength(4)
  })
})

describe('입력 유효성 — 위반은 거부하고 사유를 표면화', () => {
  it.each([
    { label: '소정근로 0시간', overrides: { weeklyContractHours: 0 } },
    { label: '소정근로 40시간 초과 (법정 상한)', overrides: { weeklyContractHours: 40.5 } },
    { label: '임금 0원 이하', overrides: { wage: { type: 'HOURLY' as const, amount: 0 } } },
    { label: '음수 연장시간', overrides: { expectedOvertimeHours: -1 } },
    {
      label: '야간이 전체 근로시간을 초과 (부분집합 위반)',
      overrides: { weeklyContractHours: 10, expectedNightHours: 12 },
    },
  ])('$label → ok: false + 에러 메시지', ({ overrides }) => {
    const result = calculateWage(makeInput(overrides))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(0)
  })
})
