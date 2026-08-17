import { describe, expect, it } from 'vitest'
import { calculateWage } from './wageCalculator'
import type { WageCalculatorInput, WageScenario } from './wageCalculator'

/** 기본 입력: 시급 10,320원(최저시급), 주 40시간, 주휴 미포함, 5인 이상, 수습 아님 */
function makeInput(overrides: Partial<WageCalculatorInput> = {}): WageCalculatorInput {
  return {
    wage: { type: 'HOURLY', amount: 10320 },
    wageIncludesWeeklyRest: false,
    weeklyContractHours: 40,
    workplaceHasFiveOrMore: true,
    probation: null,
    ...overrides,
  }
}

/** 시나리오가 정확히 1개인 계산을 수행하고 그 시나리오를 반환한다 */
function calculateSingle(overrides: Partial<WageCalculatorInput> = {}): WageScenario {
  const result = calculateWage(makeInput(overrides))
  if (!result.ok) throw new Error(`계산이 거부됨: ${result.errors.join(', ')}`)
  expect(result.scenarios).toHaveLength(1)
  return result.scenarios[0]
}

describe('주휴수당 발생 경계 (주 15시간)', () => {
  it.each([
    { hours: 14.9, effective: 10320, restPerHour: 0 },
    { hours: 15.0, effective: 12384, restPerHour: 2064 },
  ])(
    '주 $hours시간 → 실효 시급 $effective원 (계단식 변화)',
    ({ hours, effective, restPerHour }) => {
      const scenario = calculateSingle({ weeklyContractHours: hours })
      expect(scenario.breakdown.basicHourly).toBe(10320)
      expect(scenario.breakdown.weeklyRestPerHour).toBeCloseTo(restPerHour, 5)
      expect(scenario.effectiveHourlyWage).toBeCloseTo(effective, 5)
    },
  )

  it('15시간 미만이면 주휴 미발생 사유가 skippedRules에 남는다', () => {
    const scenario = calculateSingle({ weeklyContractHours: 14.9 })
    expect(scenario.skippedRules.some((rule) => rule.id === 'WEEKLY_REST')).toBe(true)
  })

  it('15시간 이상 + 주휴 미포함 표기면 표기 시급의 1.2배가 됨을 사유에 드러낸다', () => {
    const scenario = calculateSingle({ weeklyContractHours: 40 })
    const applied = scenario.appliedRules.find((rule) => rule.id === 'WEEKLY_REST')
    expect(applied).toBeDefined()
    expect(applied?.reason).toContain('1.2배')
  })
})

describe('사업장 규모별 가산수당 (동일한 연장 5h + 야간 5h 입력)', () => {
  const premiumHours = {
    expectedOvertimeHours: 5,
    expectedNightHours: 5,
  }

  it('5인 이상: 연장·야간 중복 가산 — 주급 = 기본 45h + 주휴 8h + 가산(5×0.5+5×0.5)', () => {
    const scenario = calculateSingle({ ...premiumHours, workplaceHasFiveOrMore: true })
    // (45×10320 + 8×10320 + 5×10320) / 45h = 598,560 / 45
    expect(scenario.breakdown.premiumPerHour).toBeCloseTo(51600 / 45, 5)
    expect(scenario.effectiveHourlyWage).toBeCloseTo(598560 / 45, 5)
  })

  it('4인(5인 미만): 가산 미적용, 사유가 skippedRules에 남는다', () => {
    const scenario = calculateSingle({ ...premiumHours, workplaceHasFiveOrMore: false })
    expect(scenario.breakdown.premiumPerHour).toBe(0)
    expect(scenario.effectiveHourlyWage).toBeCloseTo(546960 / 45, 5)
    const skipped = scenario.skippedRules.find((rule) => rule.id === 'PREMIUM')
    expect(skipped).toBeDefined()
    expect(skipped?.reason).toContain('5인 미만')
  })

  it('휴일 8시간 초과분은 100% 가산 (휴일 10h → 8h×0.5 + 2h×1.0)', () => {
    const scenario = calculateSingle({ expectedHolidayHours: 10 })
    // 가산 = (8×0.5 + 2×1.0)×10320 = 61,920 / 총 50h
    expect(scenario.breakdown.premiumPerHour).toBeCloseTo(61920 / 50, 5)
    expect(scenario.effectiveHourlyWage).toBeCloseTo(660480 / 50, 5)
  })
})

describe('수습 최저임금 하한 (세 조건 모두 충족해야 90% 하한)', () => {
  // 약정 시급 10,000원: 일반 하한(10,320)에는 미달, 수습 하한(9,288)에는 충족
  const cheapWage = { wage: { type: 'HOURLY' as const, amount: 10000 } }

  it.each([
    {
      name: '계약기간 1년 미만',
      probation: { isWithinFirstThreeMonths: true, contractMonths: 6, isSimpleLabor: false },
    },
    {
      name: '수습 시작 3개월 경과',
      probation: { isWithinFirstThreeMonths: false, contractMonths: 12, isSimpleLabor: false },
    },
    {
      name: '단순노무직',
      probation: { isWithinFirstThreeMonths: true, contractMonths: 12, isSimpleLabor: true },
    },
  ])('$name — 하한 인하 불가, 일반 최저시급 기준 미달 경고', ({ probation }) => {
    const scenario = calculateSingle({ ...cheapWage, probation })
    expect(scenario.skippedRules.some((rule) => rule.id === 'PROBATION_REDUCTION')).toBe(true)
    expect(scenario.warnings.some((warning) => warning.includes('최저임금'))).toBe(true)
  })

  it('세 조건 모두 충족 시에만 하한이 9,288원으로 내려간다 (경고 없음)', () => {
    const scenario = calculateSingle({
      ...cheapWage,
      probation: { isWithinFirstThreeMonths: true, contractMonths: 12, isSimpleLabor: false },
    })
    expect(scenario.appliedRules.some((rule) => rule.id === 'PROBATION_REDUCTION')).toBe(true)
    expect(scenario.warnings).toHaveLength(0)
  })
})

describe('월급 ↔ 시급 환산 (개인별 월 소정근로시간 분모)', () => {
  it('월급 2,156,880원(주 40시간) → 기본시급 10,320원, 209시간 기준 왕복 손실 없음', () => {
    const result = calculateWage(
      makeInput({ wage: { type: 'MONTHLY', amount: 2156880 } }),
    )
    if (!result.ok) throw new Error(result.errors.join(', '))
    expect(result.monthlyContractHours).toBe(209)
    const scenario = result.scenarios[0]
    expect(scenario.breakdown.basicHourly).toBeCloseTo(10320, 5)
    // 왕복: 기본시급 × 209 = 원래 월급
    expect(scenario.breakdown.basicHourly * (result.monthlyContractHours ?? 0)).toBeCloseTo(
      2156880,
      5,
    )
  })

  it('주 20시간 월급 공고: 분모는 209가 아니라 ceil((20+4)×365/7/12)=105', () => {
    const result = calculateWage(
      makeInput({ wage: { type: 'MONTHLY', amount: 1050000 }, weeklyContractHours: 20 }),
    )
    if (!result.ok) throw new Error(result.errors.join(', '))
    expect(result.monthlyContractHours).toBe(105)
    expect(result.scenarios[0].breakdown.basicHourly).toBeCloseTo(10000, 5)
  })

  it('월급 환산 사유에 분모가 주휴를 포함함을 설명한다 (이중 차감 금지)', () => {
    const result = calculateWage(
      makeInput({ wage: { type: 'MONTHLY', amount: 2156880 }, wageIncludesWeeklyRest: true }),
    )
    if (!result.ok) throw new Error(result.errors.join(', '))
    const applied = result.scenarios[0].appliedRules.find(
      (rule) => rule.id === 'MONTHLY_CONVERSION',
    )
    expect(applied).toBeDefined()
    expect(applied?.reason).toContain('주휴')
    // 월급은 역산(÷1.2)을 적용하지 않는다
    expect(result.scenarios[0].breakdown.basicHourly).toBeCloseTo(10320, 5)
  })
})

describe('"주휴수당 포함" 표기 시급의 역산', () => {
  it('주 40시간 포함 표기 12,384원 → 기본시급 10,320원, 실효=표기 (이중 가산 없음)', () => {
    const scenario = calculateSingle({
      wage: { type: 'HOURLY', amount: 12384 },
      wageIncludesWeeklyRest: true,
    })
    expect(scenario.breakdown.basicHourly).toBeCloseTo(10320, 5)
    expect(scenario.effectiveHourlyWage).toBeCloseTo(12384, 5)
  })

  it('주 12시간 + 포함 표기: 주휴 자체가 없으므로 역산하지 않고 표기가 그대로 기본시급', () => {
    const scenario = calculateSingle({
      wage: { type: 'HOURLY', amount: 12384 },
      wageIncludesWeeklyRest: true,
      weeklyContractHours: 12,
    })
    expect(scenario.breakdown.basicHourly).toBe(12384)
    expect(scenario.breakdown.weeklyRestPerHour).toBe(0)
    expect(scenario.effectiveHourlyWage).toBeCloseTo(12384, 5)
  })

  it('포함 표기 12,000원(주 40시간): 역산 기본시급 10,000원이 하한 미달 → 경고 (주휴 제외 기준)', () => {
    const scenario = calculateSingle({
      wage: { type: 'HOURLY', amount: 12000 },
      wageIncludesWeeklyRest: true,
    })
    expect(scenario.breakdown.basicHourly).toBeCloseTo(10000, 5)
    expect(scenario.warnings.some((warning) => warning.includes('최저임금'))).toBe(true)
  })
})

describe("'모름' 입력의 시나리오 분기", () => {
  it('5인 여부 모름 → 두 시나리오, 가산 입력이 있으면 실효 시급이 달라진다', () => {
    const result = calculateWage(
      makeInput({ workplaceHasFiveOrMore: 'UNKNOWN', expectedOvertimeHours: 5 }),
    )
    if (!result.ok) throw new Error(result.errors.join(', '))
    expect(result.scenarios).toHaveLength(2)
    const [first, second] = result.scenarios
    expect(first.assumptions.some((a) => a.id === 'FIVE_OR_MORE')).toBe(true)
    expect(second.assumptions.some((a) => a.id === 'FIVE_OR_MORE')).toBe(true)
    expect(first.effectiveHourlyWage).not.toBeCloseTo(second.effectiveHourlyWage, 5)
  })

  it('수습 여부 모름 → 두 시나리오, 하한(경고)만 달라진다', () => {
    const result = calculateWage(
      makeInput({ wage: { type: 'HOURLY', amount: 10000 }, probation: 'UNKNOWN' }),
    )
    if (!result.ok) throw new Error(result.errors.join(', '))
    expect(result.scenarios).toHaveLength(2)
    const withWarning = result.scenarios.filter((s) => s.warnings.length > 0)
    expect(withWarning).toHaveLength(1)
  })

  it('5인 여부와 수습 모두 모름 → 네 시나리오', () => {
    const result = calculateWage(
      makeInput({ workplaceHasFiveOrMore: 'UNKNOWN', probation: 'UNKNOWN' }),
    )
    if (!result.ok) throw new Error(result.errors.join(', '))
    expect(result.scenarios).toHaveLength(4)
  })
})

describe('입력 검증 — 유효 범위 위반은 거부하고 사유를 표면화', () => {
  it.each([
    { name: '주 소정근로 0시간', overrides: { weeklyContractHours: 0 } },
    { name: '주 소정근로 40시간 초과(법정 상한)', overrides: { weeklyContractHours: 40.5 } },
    { name: '주 소정근로 미입력(NaN)', overrides: { weeklyContractHours: Number.NaN } },
    { name: '임금 0원', overrides: { wage: { type: 'HOURLY' as const, amount: 0 } } },
    { name: '연장시간 음수', overrides: { expectedOvertimeHours: -1 } },
    {
      name: '야간이 전체 근로(소정+연장+휴일)를 초과',
      overrides: { expectedNightHours: 46 },
    },
  ])('$name → ok:false + 에러 메시지', ({ overrides }) => {
    const result = calculateWage(makeInput(overrides))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors.every((message) => message.length > 0)).toBe(true)
    }
  })

  it('주 40시간(경계)은 유효하다', () => {
    const result = calculateWage(makeInput({ weeklyContractHours: 40 }))
    expect(result.ok).toBe(true)
  })

  it('야간이 소정+연장 합계 이내면 유효하다 (부분집합 허용)', () => {
    const result = calculateWage(
      makeInput({ expectedOvertimeHours: 5, expectedNightHours: 45 }),
    )
    expect(result.ok).toBe(true)
  })
})
