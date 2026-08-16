import { describe, expect, it } from 'vitest'
import { filterJobsByWageType, jobs } from './jobs'

describe('jobs 목 데이터', () => {
  it('공고 6건 — 시급 3, 월급 2, 건별 1', () => {
    expect(jobs).toHaveLength(6)
    expect(filterJobsByWageType(jobs, 'HOURLY')).toHaveLength(3)
    expect(filterJobsByWageType(jobs, 'MONTHLY')).toHaveLength(2)
    expect(filterJobsByWageType(jobs, 'PER_TASK')).toHaveLength(1)
  })

  it('시급 공고 중 주 근무시간이 없는 공고가 존재한다', () => {
    const hourly = filterJobsByWageType(jobs, 'HOURLY')
    expect(hourly.some((job) => job.weeklyHours === undefined)).toBe(true)
  })
})

describe('filterJobsByWageType', () => {
  it('지정한 임금 유형의 공고만 반환한다', () => {
    const monthly = filterJobsByWageType(jobs, 'MONTHLY')
    expect(monthly.every((job) => job.wage.type === 'MONTHLY')).toBe(true)
  })

  it('원본 배열을 변경하지 않는다', () => {
    const lengthBefore = jobs.length
    filterJobsByWageType(jobs, 'PER_TASK')
    expect(jobs).toHaveLength(lengthBefore)
  })
})
