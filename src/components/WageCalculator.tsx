import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { BottomSheet } from './ui/BottomSheet'
import { Button } from './ui/Button'
import { TextField } from './ui/TextField'
import { wageTypeLabel } from '../data/jobs'
import type { Job } from '../data/jobs'
import { track } from '../lib/analytics'
import { formatCurrency } from '../lib/format'
import { calculateWage } from '../lib/wageCalculator'
import type {
  ProbationConditions,
  RuleNote,
  WageScenario,
} from '../lib/wageCalculator'

export interface WageCalculatorProps {
  job: Job
}

type ProbationChoice = 'UNKNOWN' | 'NONE' | 'YES'

const mutedTextStyle: CSSProperties = {
  fontSize: '13px',
  color: 'var(--color-text-muted)',
}

const breakdownRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '14px',
  margin: 0,
}

/** 예/아니오/모름 같은 선택지를 기존 Button 프리미티브 토글로 렌더한다. */
function ChoiceGroup<Value extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: Value; label: string }[]
  value: Value
  onChange: (next: Value) => void
}) {
  return (
    <div
      role="group"
      aria-label={label}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}
    >
      <span style={mutedTextStyle}>{label}</span>
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        {options.map((option) => (
          <Button
            key={option.value}
            variant={option.value === value ? 'primary' : 'secondary'}
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  )
}

function RuleNoteList({ title, notes }: { title: string; notes: RuleNote[] }) {
  if (notes.length === 0) return null
  return (
    <div>
      <h4 style={{ margin: 0, fontSize: '13px' }}>{title}</h4>
      <ul style={{ margin: 0, paddingLeft: 'var(--space-4)', fontSize: '13px' }}>
        {notes.map((note) => (
          <li key={note.id}>
            <strong>{note.label}</strong> — {note.reason}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ScenarioResult({ scenario }: { scenario: WageScenario }) {
  const { result } = scenario
  return (
    <section
      aria-label="계산 결과"
      style={{
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-3)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
      }}
    >
      {scenario.assumptions.length > 0 && (
        <p style={{ ...mutedTextStyle, margin: 0, fontWeight: 600 }}>
          {scenario.assumptions.join(' · ')}
        </p>
      )}
      <p style={{ margin: 0, display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
        <span style={{ color: 'var(--color-primary)', fontSize: '14px', fontWeight: 600 }}>
          실효 시급
        </span>
        <strong style={{ fontSize: '20px' }}>
          {formatCurrency(Math.round(result.effectiveHourlyWage))}
        </strong>
        <span style={mutedTextStyle}>(세전, 개근 가정)</span>
      </p>
      <p style={breakdownRowStyle}>
        <span>기본시급 (주휴 제외)</span>
        <span>{formatCurrency(Math.round(result.breakdown.baseHourly))}</span>
      </p>
      <p style={breakdownRowStyle}>
        <span>주휴수당 환산분 (시간당)</span>
        <span>{formatCurrency(Math.round(result.breakdown.weeklyRestPerHour))}</span>
      </p>
      <p style={breakdownRowStyle}>
        <span>가산수당 예상분 (시간당)</span>
        <span>{formatCurrency(Math.round(result.breakdown.premiumPerHour))}</span>
      </p>
      {result.warnings.map((warning) => (
        <p
          key={warning.id}
          role="alert"
          style={{ margin: 0, fontSize: '13px', color: 'var(--color-danger, #c0392b)', fontWeight: 600 }}
        >
          ⚠ {warning.message}
        </p>
      ))}
      <RuleNoteList title="적용된 규칙" notes={result.appliedRules} />
      <RuleNoteList title="적용되지 않은 규칙" notes={result.skippedRules} />
    </section>
  )
}

export function WageCalculator({ job }: WageCalculatorProps) {
  const isSupported = job.wage.type === 'HOURLY' || job.wage.type === 'MONTHLY'
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(String(job.wage.amount))
  const [weeklyHours, setWeeklyHours] = useState(
    job.weeklyHours !== undefined ? String(job.weeklyHours) : '',
  )
  const [includesRest, setIncludesRest] = useState<'NO' | 'YES'>('NO')
  const [fiveOrMore, setFiveOrMore] = useState<'UNKNOWN' | 'YES' | 'NO'>('UNKNOWN')
  const [probationChoice, setProbationChoice] = useState<ProbationChoice>('UNKNOWN')
  const [contractMonths, setContractMonths] = useState('12')
  const [withinThreeMonths, setWithinThreeMonths] = useState<'YES' | 'NO'>('YES')
  const [simpleLabor, setSimpleLabor] = useState<'YES' | 'NO'>('YES')
  const [overtimeHours, setOvertimeHours] = useState('')
  const [nightHours, setNightHours] = useState('')
  const [holidayHours, setHolidayHours] = useState('')
  const [scenarios, setScenarios] = useState<WageScenario[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isSupported) {
      track('wage_calculator_entry_shown', { jobId: job.id })
    }
  }, [isSupported, job.id])

  // 건별(PER_TASK) 등 시급·월급 외 표기 공고는 범위 밖 — 진입점을 노출하지 않는다
  if (!isSupported) return null

  const wageLabel = wageTypeLabel[job.wage.type]

  const handleCalculate = () => {
    const parsedHours = Number(weeklyHours)
    const probation: ProbationConditions | null | 'UNKNOWN' =
      probationChoice === 'UNKNOWN'
        ? 'UNKNOWN'
        : probationChoice === 'NONE'
          ? null
          : {
              isWithinFirstThreeMonths: withinThreeMonths === 'YES',
              contractMonths: Number(contractMonths) || 0,
              isSimpleLabor: simpleLabor === 'YES',
            }
    try {
      const nextScenarios = calculateWage({
        wage: { type: job.wage.type as 'HOURLY' | 'MONTHLY', amount: Number(amount) },
        wageIncludesWeeklyRest: includesRest === 'YES',
        weeklyContractHours: parsedHours,
        workplaceHasFiveOrMore: fiveOrMore === 'UNKNOWN' ? 'UNKNOWN' : fiveOrMore === 'YES',
        probation,
        expectedOvertimeHours: Number(overtimeHours) || 0,
        expectedNightHours: Number(nightHours) || 0,
        expectedHolidayHours: Number(holidayHours) || 0,
      })
      setScenarios(nextScenarios)
      setError(null)
      track('wage_calculator_calculated', {
        jobId: job.id,
        wageType: job.wage.type,
        scenarioCount: nextScenarios.length,
      })
    } catch (calculationError) {
      if (calculationError instanceof RangeError) {
        setScenarios(null)
        setError(calculationError.message)
        return
      }
      throw calculationError
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        시급계산기
      </Button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="시급계산기">
        <p style={{ ...mutedTextStyle, margin: 0 }}>
          공고의 임금을 프리필했습니다. 근무 조건을 입력하면 주휴수당·가산수당·수습
          하한까지 반영한 세전 실효 시급을 분해해 보여줍니다.
        </p>
        <TextField
          label={`${wageLabel} (원)`}
          type="number"
          inputMode="numeric"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        <TextField
          label="주 소정근로시간"
          type="number"
          inputMode="decimal"
          value={weeklyHours}
          onChange={(event) => setWeeklyHours(event.target.value)}
        />
        {job.wage.type === 'HOURLY' && (
          <ChoiceGroup
            label='공고의 "주휴수당 포함" 표기 여부'
            value={includesRest}
            onChange={setIncludesRest}
            options={[
              { value: 'NO', label: '미포함' },
              { value: 'YES', label: '포함' },
            ]}
          />
        )}
        <ChoiceGroup
          label="상시 5인 이상 사업장인가요?"
          value={fiveOrMore}
          onChange={setFiveOrMore}
          options={[
            { value: 'UNKNOWN', label: '모름' },
            { value: 'YES', label: '5인 이상' },
            { value: 'NO', label: '5인 미만' },
          ]}
        />
        <ChoiceGroup
          label="수습 기간인가요?"
          value={probationChoice}
          onChange={setProbationChoice}
          options={[
            { value: 'UNKNOWN', label: '모름' },
            { value: 'NONE', label: '수습 아님' },
            { value: 'YES', label: '수습 중' },
          ]}
        />
        {probationChoice === 'YES' && (
          <>
            <TextField
              label="근로계약 기간 (개월)"
              type="number"
              inputMode="numeric"
              value={contractMonths}
              onChange={(event) => setContractMonths(event.target.value)}
            />
            <ChoiceGroup
              label="수습 시작 3개월 이내인가요?"
              value={withinThreeMonths}
              onChange={setWithinThreeMonths}
              options={[
                { value: 'YES', label: '예' },
                { value: 'NO', label: '아니요' },
              ]}
            />
            <ChoiceGroup
              label="단순노무직(배달·서빙·청소 등)인가요?"
              value={simpleLabor}
              onChange={setSimpleLabor}
              options={[
                { value: 'YES', label: '예' },
                { value: 'NO', label: '아니요' },
              ]}
            />
          </>
        )}
        <TextField
          label="예상 연장근로 (시간/주)"
          type="number"
          inputMode="decimal"
          placeholder="0"
          value={overtimeHours}
          onChange={(event) => setOvertimeHours(event.target.value)}
        />
        <TextField
          label="예상 야간근로 (시간/주)"
          type="number"
          inputMode="decimal"
          placeholder="0 — 22시~06시, 연장·휴일과 겹칠 수 있음"
          value={nightHours}
          onChange={(event) => setNightHours(event.target.value)}
        />
        <TextField
          label="예상 휴일근로 (시간/주)"
          type="number"
          inputMode="decimal"
          placeholder="0"
          value={holidayHours}
          onChange={(event) => setHolidayHours(event.target.value)}
        />
        <Button onClick={handleCalculate}>계산하기</Button>
        {error !== null && (
          <p role="alert" style={{ margin: 0, fontSize: '13px', color: 'var(--color-danger, #c0392b)' }}>
            {error}
          </p>
        )}
        <div aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {scenarios?.map((scenario) => (
            <ScenarioResult key={scenario.assumptions.join('|')} scenario={scenario} />
          ))}
        </div>
        <p style={{ ...mutedTextStyle, margin: 0 }}>
          계산 결과는 참고용이며 실제 지급액은 근로계약에 따릅니다.
        </p>
      </BottomSheet>
    </>
  )
}
