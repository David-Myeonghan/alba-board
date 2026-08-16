import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { WageInfo } from '../components/WageInfo'
import { BottomSheet } from '../components/ui/BottomSheet'
import { Button } from '../components/ui/Button'
import { jobs, wageTypeLabel } from '../data/jobs'
import { track } from '../lib/analytics'

export function JobDetail() {
  const { id } = useParams()
  const job = jobs.find((item) => item.id === id)
  const [contactSheetOpen, setContactSheetOpen] = useState(false)

  useEffect(() => {
    if (job) {
      track('job_detail_viewed', { jobId: job.id })
    }
  }, [job])

  if (!job) {
    return (
      <main style={{ maxWidth: '480px', margin: '0 auto', padding: 'var(--space-5)' }}>
        <p>공고를 찾을 수 없습니다.</p>
        <Link to="/">목록으로 돌아가기</Link>
      </main>
    )
  }

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
      <Link to="/" style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>
        ← 목록
      </Link>
      <h1 style={{ margin: 0, fontSize: '22px' }}>{job.title}</h1>
      <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>{job.employer}</p>
      <WageInfo
        wage={job.wage}
        weeklyHours={job.weeklyHours}
        workDays={job.workDays}
      />
      <section>
        <h2 style={{ fontSize: '16px', marginBottom: 'var(--space-2)' }}>상세 내용</h2>
        <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{job.description}</p>
      </section>
      <section>
        <h2 style={{ fontSize: '16px', marginBottom: 'var(--space-2)' }}>근무 조건</h2>
        <ul style={{ margin: 0, paddingLeft: 'var(--space-5)' }}>
          <li>{`임금 형태: ${wageTypeLabel[job.wage.type]}`}</li>
          {job.weeklyHours !== undefined && <li>{`주 근무시간: ${job.weeklyHours}시간`}</li>}
          {job.workDays !== undefined && <li>{`근무 요일: ${job.workDays}`}</li>}
        </ul>
      </section>
      <Button onClick={() => setContactSheetOpen(true)}>지원 문의</Button>
      <BottomSheet
        open={contactSheetOpen}
        onClose={() => setContactSheetOpen(false)}
        title="지원 문의"
      >
        <p style={{ margin: 0 }}>
          {job.employer}에 직접 방문하거나 게시판의 연락처로 문의해 주세요. 데모
          앱이라 실제 지원 기능은 없습니다.
        </p>
        <Button variant="secondary" onClick={() => setContactSheetOpen(false)}>
          닫기
        </Button>
      </BottomSheet>
    </main>
  )
}
