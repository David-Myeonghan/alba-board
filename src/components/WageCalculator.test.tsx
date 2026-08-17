import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { WageCalculator } from './WageCalculator'
import { getTrackedEvents } from '../lib/analytics'
import { jobs } from '../data/jobs'
import type { AnalyticsEvent } from '../lib/analytics'

afterEach(cleanup)

// 시급 10,320원 · 주 24시간 공고 (job-1)
const hourlyJob = jobs[0]
// 건별 공고 (job-6)
const perTaskJob = jobs[5]

let eventCountAtStart = 0
beforeEach(() => {
  eventCountAtStart = getTrackedEvents().length
})

function newEvents(): readonly AnalyticsEvent[] {
  return getTrackedEvents().slice(eventCountAtStart)
}

function openCalculator() {
  fireEvent.click(screen.getByRole('button', { name: '시급계산기' }))
}

function chooseKnownConditions() {
  fireEvent.click(screen.getByRole('button', { name: '5인 이상' }))
  fireEvent.click(screen.getByRole('button', { name: '수습 아님' }))
}

function runCalculation() {
  fireEvent.click(screen.getByRole('button', { name: '계산하기' }))
}

describe('WageCalculator 진입점', () => {
  it('시급 공고에 진입점을 노출하고 노출 이벤트를 남긴다', () => {
    render(<WageCalculator job={hourlyJob} />)
    expect(screen.getByRole('button', { name: '시급계산기' })).toBeDefined()
    const exposure = newEvents().filter(
      (event) => event.name === 'wage_calculator_entry_viewed',
    )
    expect(exposure).toHaveLength(1)
    expect(exposure[0].props).toMatchObject({ jobId: hourlyJob.id, wageType: 'HOURLY' })
  })

  it('건별(PER_TASK) 공고에는 진입점을 노출하지 않고 이벤트도 남기지 않는다', () => {
    render(<WageCalculator job={perTaskJob} />)
    expect(screen.queryByRole('button', { name: '시급계산기' })).toBeNull()
    expect(
      newEvents().filter((event) => event.name === 'wage_calculator_entry_viewed'),
    ).toHaveLength(0)
  })

  it('진입점 클릭 시 계산기가 열리고 열기 이벤트를 남긴다', () => {
    render(<WageCalculator job={hourlyJob} />)
    openCalculator()
    expect(screen.getByRole('dialog', { name: '시급계산기' })).toBeDefined()
    const opened = newEvents().filter(
      (event) => event.name === 'wage_calculator_opened',
    )
    expect(opened).toHaveLength(1)
    expect(opened[0].props).toMatchObject({ jobId: hourlyJob.id })
  })
})

describe('WageCalculator 프리필', () => {
  it('공고의 임금과 주 근무시간을 프리필한다', () => {
    render(<WageCalculator job={hourlyJob} />)
    openCalculator()
    expect(screen.getByLabelText('시급 (원)')).toHaveProperty('value', '10320')
    expect(screen.getByLabelText('주 소정근로시간')).toHaveProperty('value', '24')
  })

  it("5인 여부와 수습 여부는 '모름'이 기본 선택이다", () => {
    render(<WageCalculator job={hourlyJob} />)
    openCalculator()
    const unknownButtons = screen.getAllByRole('button', { name: '모름', pressed: true })
    expect(unknownButtons).toHaveLength(2)
  })
})

describe('WageCalculator 계산 실행', () => {
  it('실효 시급과 분해(기본/주휴/가산)를 렌더하고 계산 이벤트를 남긴다', () => {
    render(<WageCalculator job={hourlyJob} />)
    openCalculator()
    chooseKnownConditions()
    runCalculation()

    // 시급 10,320 × 24h(≥15h, 미포함 표기) → 실효 12,384원
    expect(screen.getAllByText('12,384원').length).toBeGreaterThan(0)
    expect(screen.getAllByText('기본시급').length).toBeGreaterThan(0)
    expect(screen.getAllByText('주휴수당 환산분').length).toBeGreaterThan(0)

    const calculated = newEvents().filter(
      (event) => event.name === 'wage_calculator_calculated',
    )
    expect(calculated).toHaveLength(1)
    expect(calculated[0].props).toMatchObject({
      jobId: hourlyJob.id,
      wageType: 'HOURLY',
      wageGapPerHour: 2064,
      hasWarnings: false,
      usedUnknownFiveOrMore: false,
      usedUnknownProbation: false,
    })
  })

  it("'모름' 기본 상태로 계산하면 시나리오를 나란히 보여주고 이벤트에 모름 선택을 싣는다", () => {
    render(<WageCalculator job={hourlyJob} />)
    openCalculator()
    runCalculation()
    // 5인 여부 모름 × 수습 모름 → 4개 시나리오
    expect(screen.getAllByText('실효 시급')).toHaveLength(4)
    const calculated = newEvents().filter(
      (event) => event.name === 'wage_calculator_calculated',
    )
    expect(calculated[0].props).toMatchObject({
      usedUnknownFiveOrMore: true,
      usedUnknownProbation: true,
    })
  })

  it('최저시급 미달 입력이면 경고를 표시하고 이벤트에 경고 여부를 싣는다', () => {
    render(<WageCalculator job={hourlyJob} />)
    openCalculator()
    chooseKnownConditions()
    fireEvent.change(screen.getByLabelText('시급 (원)'), { target: { value: '9000' } })
    runCalculation()
    expect(screen.getAllByText(/최저임금 미달/).length).toBeGreaterThan(0)
    const calculated = newEvents().filter(
      (event) => event.name === 'wage_calculator_calculated',
    )
    expect(calculated[0].props).toMatchObject({ hasWarnings: true })
  })

  it('유효 범위 위반 입력은 에러를 표면화하고 계산 이벤트를 남기지 않는다', () => {
    render(<WageCalculator job={hourlyJob} />)
    openCalculator()
    fireEvent.change(screen.getByLabelText('주 소정근로시간'), {
      target: { value: '50' },
    })
    runCalculation()
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('주 소정근로시간')
    expect(
      newEvents().filter((event) => event.name === 'wage_calculator_calculated'),
    ).toHaveLength(0)
  })

  it('결과에 세전·개근 가정 라벨과 법적 고지를 함께 보여준다', () => {
    render(<WageCalculator job={hourlyJob} />)
    openCalculator()
    chooseKnownConditions()
    runCalculation()
    expect(screen.getByText(/세전.*개근 가정/)).toBeDefined()
    expect(
      screen.getByText('계산 결과는 참고용이며 실제 지급액은 근로계약에 따릅니다.'),
    ).toBeDefined()
  })
})
