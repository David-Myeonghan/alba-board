import type { CSSProperties } from 'react'
import { wageTypeLabel } from '../data/jobs'
import type { Wage } from '../data/jobs'
import { formatCurrency } from '../lib/format'

export interface WageInfoProps {
  wage: Wage
  weeklyHours?: number
  workDays?: string
}

const rowStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  fontSize: '14px',
  color: 'var(--color-text-muted)',
}

export function WageInfo({ wage, weeklyHours, workDays }: WageInfoProps) {
  return (
    <section
      style={{
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
      }}
    >
      <p
        style={{
          margin: 0,
          display: 'flex',
          alignItems: 'baseline',
          gap: 'var(--space-2)',
        }}
      >
        <span
          style={{
            color: 'var(--color-primary)',
            fontSize: '14px',
            fontWeight: 600,
          }}
        >
          {wageTypeLabel[wage.type]}
        </span>
        <strong style={{ fontSize: '20px' }}>
          {formatCurrency(wage.amount)}
        </strong>
      </p>
      {weeklyHours !== undefined && (
        <div style={rowStyle}>
          <span>근무 시간</span>
          <span>{`주 ${weeklyHours}시간`}</span>
        </div>
      )}
      {workDays !== undefined && (
        <div style={rowStyle}>
          <span>근무 요일</span>
          <span>{workDays}</span>
        </div>
      )}
    </section>
  )
}
