import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { JobDetail } from './JobDetail'

afterEach(cleanup)

function renderDetail(jobId: string) {
  render(
    <MemoryRouter initialEntries={[`/jobs/${jobId}`]}>
      <Routes>
        <Route path="/jobs/:id" element={<JobDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('JobDetail 시급계산기 진입점', () => {
  it('시급 공고 상세에 임금 정보와 함께 시급계산기 진입점이 보인다', () => {
    renderDetail('job-1')
    expect(screen.getByText('시급')).toBeDefined()
    expect(screen.getByRole('button', { name: '시급계산기' })).toBeDefined()
  })

  it('월급 공고 상세에도 진입점이 보인다', () => {
    renderDetail('job-4')
    expect(screen.getByRole('button', { name: '시급계산기' })).toBeDefined()
  })

  it('건별 공고 상세에는 진입점이 보이지 않는다', () => {
    renderDetail('job-6')
    expect(screen.getByText('건별')).toBeDefined()
    expect(screen.queryByRole('button', { name: '시급계산기' })).toBeNull()
  })
})
