import { describe, expect, it } from 'vitest'
import { formatCurrency } from './format'

describe('formatCurrency', () => {
  it('천 단위에 쉼표를 찍고 원 단위를 붙인다', () => {
    expect(formatCurrency(10320)).toBe('10,320원')
  })

  it('백만 단위 금액도 자릿수마다 쉼표를 찍는다', () => {
    expect(formatCurrency(2100000)).toBe('2,100,000원')
  })

  it('쉼표가 필요 없는 금액은 그대로 표기한다', () => {
    expect(formatCurrency(0)).toBe('0원')
    expect(formatCurrency(500)).toBe('500원')
  })

  it('소수점 금액은 원 단위로 반올림해 표기한다', () => {
    expect(formatCurrency(10320.5)).toBe('10,321원')
  })
})
