import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { WageCalculator } from './WageCalculator'
import { getTrackedEvents } from '../lib/analytics'
import type { Job } from '../data/jobs'

afterEach(cleanup)

const hourlyJob: Job = {
  id: 'job-hourly',
  title: '테스트 시급 공고',
  employer: '테스트상점',
  wage: { type: 'HOURLY', amount: 10320 },
  weeklyHours: 24,
  workDays: '금·토·일',
  description: '테스트',
}

const perTaskJob: Job = {
  id: 'job-per-task',
  title: '테스트 건별 공고',
  employer: '테스트상점',
  wage: { type: 'PER_TASK', amount: 60000 },
  description: '테스트',
}

function openCalculator(job: Job) {
  render(<WageCalculator job={job} />)
  fireEvent.click(screen.getByRole('button', { name: '시급계산기' }))
}

describe('WageCalculator', () => {
  it('건별(PER_TASK) 공고에는 진입점을 노출하지 않는다', () => {
    render(<WageCalculator job={perTaskJob} />)
    expect(screen.queryByRole('button', { name: '시급계산기' })).toBeNull()
  })

  it('진입점을 누르면 공고의 임금과 주 근무시간이 프리필된 폼이 열린다', () => {
    openCalculator(hourlyJob)
    expect(screen.getByRole('dialog')).toBeDefined()
    expect(screen.getByLabelText('시급 (원)')).toHaveProperty('value', '10320')
    expect(screen.getByLabelText('주 소정근로시간')).toHaveProperty('value', '24')
  })

  it('계산하면 실효 시급 분해와 세전·개근 라벨, 법적 고지를 보여준다', () => {
    openCalculator(hourlyJob)
    fireEvent.click(screen.getByRole('button', { name: '계산하기' }))
    // 24시간 ≥ 15시간, 주휴 미포함 기본값 → 실효 시급 10,320 × 1.2 = 12,384원
    expect(screen.getAllByText('12,384원').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/세전, 개근 가정/).length).toBeGreaterThan(0)
    expect(
      screen.getByText('계산 결과는 참고용이며 실제 지급액은 근로계약에 따릅니다.'),
    ).toBeDefined()
  })

  it("5인 여부 기본값 '모름'이면 두 시나리오를 나란히 보여준다", () => {
    openCalculator(hourlyJob)
    fireEvent.change(screen.getByLabelText('예상 야간근로 (시간/주)'), {
      target: { value: '4' },
    })
    fireEvent.click(screen.getByRole('button', { name: '계산하기' }))
    expect(screen.getAllByText(/5인 이상.*가정/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/5인 미만.*가정/).length).toBeGreaterThan(0)
  })

  it('진입점 노출과 계산 실행 시점에 이벤트를 남긴다', () => {
    const before = getTrackedEvents().length
    openCalculator(hourlyJob)
    fireEvent.click(screen.getByRole('button', { name: '계산하기' }))
    const names = getTrackedEvents()
      .slice(before)
      .map((event) => event.name)
    expect(names).toContain('wage_calculator_entry_shown')
    expect(names).toContain('wage_calculator_calculated')
  })

  it('건별 공고는 진입점 노출 이벤트도 남기지 않는다', () => {
    const before = getTrackedEvents().length
    render(<WageCalculator job={perTaskJob} />)
    const names = getTrackedEvents()
      .slice(before)
      .map((event) => event.name)
    expect(names).not.toContain('wage_calculator_entry_shown')
  })
})
