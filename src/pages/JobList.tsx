import { useState } from 'react'
import { Link } from 'react-router-dom'
import { TextField } from '../components/ui/TextField'
import { jobs, wageTypeLabel } from '../data/jobs'
import { formatCurrency } from '../lib/format'

export function JobList() {
  const [keyword, setKeyword] = useState('')
  const trimmed = keyword.trim()
  const visibleJobs = jobs.filter(
    (job) => job.title.includes(trimmed) || job.employer.includes(trimmed),
  )

  return (
    <main
      style={{
        maxWidth: '480px',
        margin: '0 auto',
        padding: 'var(--space-5) var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
      }}
    >
      <h1 style={{ margin: 0, fontSize: '22px' }}>동네 알바 공고</h1>
      <TextField
        label="검색"
        placeholder="공고 제목이나 가게 이름"
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
      />
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
        }}
      >
        {visibleJobs.map((job) => (
          <li key={job.id}>
            <Link
              to={`/jobs/${job.id}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-1)',
                padding: 'var(--space-4)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                textDecoration: 'none',
              }}
            >
              <strong style={{ fontSize: '16px' }}>{job.title}</strong>
              <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                {job.employer}
              </span>
              <span style={{ fontSize: '14px', color: 'var(--color-primary)' }}>
                {`${wageTypeLabel[job.wage.type]} ${formatCurrency(job.wage.amount)}`}
              </span>
            </Link>
          </li>
        ))}
        {visibleJobs.length === 0 && (
          <li style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>
            검색 결과가 없습니다.
          </li>
        )}
      </ul>
    </main>
  )
}
