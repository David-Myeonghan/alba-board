import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { WageCalculator } from './WageCalculator'
import { getTrackedEvents } from '../lib/analytics'

afterEach(cleanup)

/** 이 시점 이후에 기록된 이벤트만 돌려준다 (이벤트 버퍼는 테스트 간 공유됨) */
function eventsSince(startIndex: number) {
  return getTrackedEvents().slice(startIndex)
}

const hourlyProps = {
  jobId: 'job-1',
  wage: { type: 'HOURLY' as const, amount: 10320 },
  weeklyHours: 24,
}

function openCalculator() {
  fireEvent.click(screen.getByRole('button', { name: '시급계산기' }))
}

describe('WageCalculator 진입점', () => {
  it('건별(PER_TASK) 공고에는 진입점을 노출하지 않고 노출 이벤트도 남기지 않는다', () => {
    const start = getTrackedEvents().length
    render(
      <WageCalculator jobId="job-6" wage={{ type: 'PER_TASK', amount: 60000 }} />,
    )
    expect(screen.queryByRole('button', { name: '시급계산기' })).toBeNull()
    expect(eventsSince(start)).toHaveLength(0)
  })

  it('시급 공고에는 진입점이 보이고 노출 이벤트를 남긴다', () => {
    const start = getTrackedEvents().length
    render(<WageCalculator {...hourlyProps} />)
    expect(screen.getByRole('button', { name: '시급계산기' })).toBeDefined()
    const viewed = eventsSince(start).filter(
      (e) => e.name === 'wage_calculator_entry_viewed',
    )
    expect(viewed).toHaveLength(1)
    expect(viewed[0].props).toEqual({ jobId: 'job-1' })
  })
})

describe('WageCalculator 열기와 프리필', () => {
  it('진입점을 누르면 계산기가 열리고 공고의 임금·근무시간이 프리필된다', () => {
    const start = getTrackedEvents().length
    render(<WageCalculator {...hourlyProps} />)
    openCalculator()

    expect(screen.getByRole('dialog', { name: '시급계산기' })).toBeDefined()
    expect(screen.getByLabelText('시급 (원)')).toHaveProperty('value', '10320')
    expect(screen.getByLabelText('주 소정근로시간')).toHaveProperty('value', '24')
    expect(
      eventsSince(start).filter((e) => e.name === 'wage_calculator_opened'),
    ).toHaveLength(1)
  })

  it('월급 공고는 월급 라벨로 프리필된다', () => {
    render(
      <WageCalculator
        jobId="job-4"
        wage={{ type: 'MONTHLY', amount: 2100000 }}
        weeklyHours={40}
      />,
    )
    openCalculator()
    expect(screen.getByLabelText('월급 (원)')).toHaveProperty('value', '2100000')
  })
})

describe('WageCalculator 계산 결과', () => {
  it('계산하면 실효 시급 분해·적용/미적용 사유·법적 고지·세전 라벨을 보여준다', () => {
    render(<WageCalculator {...hourlyProps} />)
    openCalculator()
    fireEvent.click(screen.getByRole('button', { name: '계산하기' }))

    // 주 24시간, 미포함 표기 10,320원 → 실효 12,384원 (모름 시나리오들에서 반복 표시)
    expect(screen.getAllByText('12,384원').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/주휴 제외 기본시급/).length).toBeGreaterThan(0)
    // '모름' 기본 선택 → 가정 라벨이 붙은 시나리오가 나란히 나온다
    expect(screen.getAllByText(/5인 이상 사업장 가정/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/5인 미만 사업장 가정/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/세전, 개근 가정/).length).toBeGreaterThan(0)
    expect(
      screen.getByText('계산 결과는 참고용이며 실제 지급액은 근로계약에 따릅니다.'),
    ).toBeDefined()
  })

  it('계산 실행 이벤트에 표기·실효 격차, 경고 유무, 모름 선택 여부를 싣는다', () => {
    const start = getTrackedEvents().length
    render(<WageCalculator {...hourlyProps} />)
    openCalculator()
    fireEvent.click(screen.getByRole('button', { name: '계산하기' }))

    const calculated = eventsSince(start).filter(
      (e) => e.name === 'wage_calculator_calculated',
    )
    expect(calculated).toHaveLength(1)
    expect(calculated[0].props).toMatchObject({
      jobId: 'job-1',
      statedHourly: 10320,
      effectiveHourly: 12384,
      wageGap: 2064,
      hasWarnings: false,
      usedUnknown: true,
    })
  })

  it('유효하지 않은 입력은 계산을 거부하고 사유를 표면화하며 이벤트를 남기지 않는다', () => {
    const start = getTrackedEvents().length
    render(<WageCalculator {...hourlyProps} />)
    openCalculator()
    fireEvent.change(screen.getByLabelText('주 소정근로시간'), {
      target: { value: '45' },
    })
    fireEvent.click(screen.getByRole('button', { name: '계산하기' }))

    expect(screen.getByText(/40 이하/)).toBeDefined()
    expect(
      eventsSince(start).filter((e) => e.name === 'wage_calculator_calculated'),
    ).toHaveLength(0)
  })
})
