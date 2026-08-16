import { describe, expect, it } from 'vitest'
import {
  calculateWage,
  hourlyToMonthly,
  monthlyStandardHours,
} from './wageCalculator'
import type { WageCalculatorInput } from './wageCalculator'

/** 확정 입력(모름 없음) 기본값. 케이스마다 필요한 부분만 덮어쓴다. */
function input(overrides: Partial<WageCalculatorInput>): WageCalculatorInput {
  return {
    wage: { type: 'HOURLY', amount: 10320 },
    wageIncludesWeeklyRest: false,
    weeklyContractHours: 40,
    workplaceHasFiveOrMore: true,
    probation: null,
    ...overrides,
  }
}

/** 확정 입력은 시나리오가 1개여야 한다. 그 결과를 꺼내는 헬퍼. */
function single(overrides: Partial<WageCalculatorInput>) {
  const scenarios = calculateWage(input(overrides))
  expect(scenarios).toHaveLength(1)
  return scenarios[0].result
}

describe('주휴수당 발생 경계 (주 15시간)', () => {
  it.each([
    // [주 소정근로시간, 기대 실효 시급 배율, 주휴 발생 여부]
    [14.9, 1.0, false],
    [15.0, 1.2, true],
  ])(
    '주 %f시간, 시급 10,000원 미포함 표기 → 실효 시급 %f배',
    (hours, ratio, restApplies) => {
      const result = single({
        wage: { type: 'HOURLY', amount: 10000 },
        weeklyContractHours: hours,
      })
      expect(result.effectiveHourlyWage).toBeCloseTo(10000 * ratio, 6)
      expect(result.baseHourlyWage).toBe(10000)
      if (restApplies) {
        expect(result.breakdown.weeklyRestPerHour).toBeCloseTo(2000, 6)
        const applied = result.appliedRules.find((r) => r.id === 'WEEKLY_REST')
        expect(applied).toBeDefined()
        expect(applied?.reason).toContain('1.2배')
      } else {
        expect(result.breakdown.weeklyRestPerHour).toBe(0)
        expect(
          result.skippedRules.some((r) => r.id === 'WEEKLY_REST'),
        ).toBe(true)
      }
    },
  )
})

describe('가산수당 — 사업장 규모 분기', () => {
  const extras = {
    wage: { type: 'HOURLY', amount: 10000 } as const,
    expectedOvertimeHours: 2,
    expectedNightHours: 2,
  }

  it.each([
    // [5인 이상 여부, 가산 적용 여부]
    [true, true],
    [false, false],
  ])(
    '동일한 야간·연장 입력에서 5인 이상=%s → 가산 적용=%s',
    (fiveOrMore, applied) => {
      const result = single({ ...extras, workplaceHasFiveOrMore: fiveOrMore })
      if (applied) {
        expect(result.breakdown.premiumPerHour).toBeGreaterThan(0)
        expect(
          result.appliedRules.some((r) => r.id === 'OVERTIME_NIGHT_HOLIDAY'),
        ).toBe(true)
      } else {
        expect(result.breakdown.premiumPerHour).toBe(0)
        const skipped = result.skippedRules.find(
          (r) => r.id === 'OVERTIME_NIGHT_HOLIDAY',
        )
        expect(skipped).toBeDefined()
        expect(skipped?.reason).toContain('5인 미만')
      }
    },
  )

  it('연장 2시간 + 야간 2시간(겹침)은 중복 가산된다', () => {
    const result = single({ ...extras, workplaceHasFiveOrMore: true })
    // 주 40+2=42시간 근무, 가산분 = 0.5×10,000×2(연장) + 0.5×10,000×2(야간) = 20,000원/주
    expect(result.breakdown.premiumPerHour).toBeCloseTo(20000 / 42, 6)
  })

  it('휴일 8시간 초과분은 100% 가산된다', () => {
    const result = single({
      wage: { type: 'HOURLY', amount: 10000 },
      expectedHolidayHours: 10,
    })
    // 가산분 = 0.5×10,000×8 + 1.0×10,000×2 = 60,000원/주, 근무 40+10=50시간
    expect(result.breakdown.premiumPerHour).toBeCloseTo(60000 / 50, 6)
  })
})

describe('수습 하한 — 3조건 모두 충족해야 90% 인하', () => {
  const belowMinimum = {
    wage: { type: 'HOURLY', amount: 9500 } as const,
  }

  it.each([
    // [미충족 조건, probation 입력]
    [
      '계약기간 1년 미만',
      { isWithinFirstThreeMonths: true, contractMonths: 6, isSimpleLabor: false },
    ],
    [
      '수습 3개월 경과',
      { isWithinFirstThreeMonths: false, contractMonths: 12, isSimpleLabor: false },
    ],
    [
      '단순노무직',
      { isWithinFirstThreeMonths: true, contractMonths: 12, isSimpleLabor: true },
    ],
  ])('%s이면 하한 인하 불가 → 9,500원은 최저임금 미달 경고', (_, probation) => {
    const result = single({ ...belowMinimum, probation })
    expect(result.warnings.some((w) => w.id === 'BELOW_MINIMUM_WAGE')).toBe(true)
    expect(result.skippedRules.some((r) => r.id === 'PROBATION_FLOOR')).toBe(true)
  })

  it('3조건 모두 충족하면 하한이 9,288원으로 내려가 9,500원은 경고 없음', () => {
    const result = single({
      ...belowMinimum,
      probation: {
        isWithinFirstThreeMonths: true,
        contractMonths: 12,
        isSimpleLabor: false,
      },
    })
    expect(result.warnings).toHaveLength(0)
    expect(result.appliedRules.some((r) => r.id === 'PROBATION_FLOOR')).toBe(true)
  })
})

describe('월급↔시급 환산 — 개인별 월 소정근로시간 분모', () => {
  it('주 40시간은 208.57을 올림한 209시간', () => {
    expect(monthlyStandardHours(40)).toBe(209)
  })

  it('주 20시간은 209가 아니라 개인별 105시간(= (20+4)×365/7/12 올림)', () => {
    expect(monthlyStandardHours(20)).toBe(105)
  })

  it('주 15시간 미만은 주휴시간 0으로 계산한다', () => {
    // 14×365/7/12 = 60.83 → 61
    expect(monthlyStandardHours(14)).toBe(61)
  })

  it('월급 2,156,880원(주 40시간) → 시급 10,320원 → 월급 왕복이 손실 없다', () => {
    const result = single({
      wage: { type: 'MONTHLY', amount: 2156880 },
      weeklyContractHours: 40,
    })
    expect(result.baseHourlyWage).toBe(10320)
    expect(result.monthlyStandardHours).toBe(209)
    expect(hourlyToMonthly(result.baseHourlyWage, 40)).toBe(2156880)
  })

  it('주 20시간 월급 1,050,000원 → 분모 105시간, 기본시급 10,000원', () => {
    const result = single({
      wage: { type: 'MONTHLY', amount: 1050000 },
      weeklyContractHours: 20,
    })
    expect(result.monthlyStandardHours).toBe(105)
    expect(result.baseHourlyWage).toBe(10000)
    // 월급 분모가 이미 주휴를 흡수하므로 이중 차감 없이, 실효 시급은 기본×1.2
    expect(result.effectiveHourlyWage).toBeCloseTo(12000, 6)
    const conversion = result.appliedRules.find(
      (r) => r.id === 'MONTHLY_CONVERSION',
    )
    expect(conversion).toBeDefined()
    expect(conversion?.reason).toContain('주휴')
  })
})

describe('"주휴수당 포함" 표기의 역산', () => {
  it('포함 표기 12,384원(주 40시간)의 기본시급은 10,320원으로 역산된다', () => {
    const result = single({
      wage: { type: 'HOURLY', amount: 12384 },
      wageIncludesWeeklyRest: true,
    })
    expect(result.baseHourlyWage).toBe(10320)
    expect(result.effectiveHourlyWage).toBeCloseTo(12384, 6)
  })

  it('포함 표기와 미포함 표기가 같은 기본시급이면 실효 시급이 일치한다(이중 가산 없음)', () => {
    const included = single({
      wage: { type: 'HOURLY', amount: 12384 },
      wageIncludesWeeklyRest: true,
    })
    const excluded = single({
      wage: { type: 'HOURLY', amount: 10320 },
      wageIncludesWeeklyRest: false,
    })
    expect(included.effectiveHourlyWage).toBeCloseTo(
      excluded.effectiveHourlyWage,
      6,
    )
  })

  it('주 12시간 + 포함 표기는 역산하지 않고 표기 시급이 그대로 기본시급', () => {
    const result = single({
      wage: { type: 'HOURLY', amount: 10500 },
      wageIncludesWeeklyRest: true,
      weeklyContractHours: 12,
    })
    expect(result.baseHourlyWage).toBe(10500)
    expect(result.effectiveHourlyWage).toBe(10500)
    expect(
      result.skippedRules.some((r) => r.id === 'WEEKLY_REST_REVERSAL'),
    ).toBe(true)
  })
})

describe('최저임금 미달 경고 — 주휴 제외 기본시급 기준', () => {
  it('포함 표기 12,000원(주 40시간)은 기본시급 10,000원이 하한 미달이라 경고한다', () => {
    const result = single({
      wage: { type: 'HOURLY', amount: 12000 },
      wageIncludesWeeklyRest: true,
    })
    expect(result.baseHourlyWage).toBe(10000)
    expect(result.warnings.some((w) => w.id === 'BELOW_MINIMUM_WAGE')).toBe(true)
  })

  it('미포함 표기 10,320원은 경고가 없다', () => {
    const result = single({})
    expect(result.warnings).toHaveLength(0)
  })
})

describe("'모름' 입력의 시나리오 분기", () => {
  it('5인 여부 모름 + 야간 입력 → 적용/미적용 두 시나리오를 나란히 반환한다', () => {
    const scenarios = calculateWage(
      input({
        wage: { type: 'HOURLY', amount: 10320 },
        workplaceHasFiveOrMore: 'UNKNOWN',
        expectedNightHours: 4,
      }),
    )
    expect(scenarios).toHaveLength(2)
    const [five, four] = scenarios
    expect(five.result.breakdown.premiumPerHour).toBeGreaterThan(0)
    expect(four.result.breakdown.premiumPerHour).toBe(0)
    expect(five.assumptions.length).toBeGreaterThan(0)
    expect(four.assumptions.length).toBeGreaterThan(0)
  })

  it('수습 여부 모름 → 하한 인하 가능/불가 두 시나리오를 반환한다', () => {
    const scenarios = calculateWage(
      input({
        wage: { type: 'HOURLY', amount: 9500 },
        probation: 'UNKNOWN',
      }),
    )
    expect(scenarios).toHaveLength(2)
    const warningCounts = scenarios.map((s) => s.result.warnings.length)
    expect(warningCounts).toContain(0) // 수습 하한 적용 가정
    expect(warningCounts.some((count) => count > 0)).toBe(true) // 수습 아님 가정
  })
})

describe('입력 검증', () => {
  it.each([[0], [-1], [40.5], [80]])(
    '주 소정근로시간 %f은 법정 범위(0 초과 40 이하) 밖이라 거부한다',
    (hours) => {
      expect(() => single({ weeklyContractHours: hours })).toThrow(RangeError)
    },
  )
})
