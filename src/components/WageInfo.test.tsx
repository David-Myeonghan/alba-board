import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { WageInfo } from './WageInfo'

afterEach(cleanup)

describe('WageInfo', () => {
  it('임금을 굵게(strong), 단위 라벨과 함께 표기한다', () => {
    render(
      <WageInfo
        wage={{ type: 'HOURLY', amount: 10320 }}
        weeklyHours={24}
        workDays="금·토·일"
      />,
    )
    const amount = screen.getByText('10,320원')
    expect(amount.tagName).toBe('STRONG')
    expect(screen.getByText('시급')).toBeDefined()
  })

  it('근무 시간과 요일을 함께 보여준다', () => {
    render(
      <WageInfo
        wage={{ type: 'MONTHLY', amount: 2100000 }}
        weeklyHours={40}
        workDays="월~금"
      />,
    )
    expect(screen.getByText('월급')).toBeDefined()
    expect(screen.getByText('2,100,000원')).toBeDefined()
    expect(screen.getByText('주 40시간')).toBeDefined()
    expect(screen.getByText('월~금')).toBeDefined()
  })

  it('주 근무시간이 없는 공고는 근무 시간 줄을 그리지 않는다', () => {
    render(<WageInfo wage={{ type: 'HOURLY', amount: 11000 }} workDays="토·일" />)
    expect(screen.queryByText('근무 시간')).toBeNull()
    expect(screen.getByText('근무 요일')).toBeDefined()
  })
})
