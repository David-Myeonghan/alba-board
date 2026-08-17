import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { wageTypeLabel } from '../data/jobs'
import type { Job } from '../data/jobs'
import { track } from '../lib/analytics'
import { formatCurrency } from '../lib/format'
import { calculateWage } from '../lib/wageCalculator'
import type {
  WageCalculationResult,
  WageCalculatorInput,
  WageScenario,
} from '../lib/wageCalculator'
import { BottomSheet } from './ui/BottomSheet'
import { Button } from './ui/Button'
import { TextField } from './ui/TextField'

export interface WageCalculatorProps {
  job: Job
}

const mutedTextStyle: CSSProperties = {
  fontSize: '13px',
  color: 'var(--color-text-muted)',
}

interface ChoiceGroupProps {
  label: string
  options: Array<{ value: string; label: string }>
  value: string
  onChange: (value: string) => void
  helpText?: string
}

/** Button 프리미티브를 조합한 단일 선택 그룹 (aria-pressed로 선택 상태 표기) */
function ChoiceGroup({ label, options, value, onChange, helpText }: ChoiceGroupProps) {
  return (
    <div
      role="group"
      aria-label={label}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}
    >
      <span style={mutedTextStyle}>{label}</span>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        {options.map((option) => (
          <Button
            key={option.value}
            variant={value === option.value ? 'primary' : 'secondary'}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      {helpText !== undefined && <span style={mutedTextStyle}>{helpText}</span>}
    </div>
  )
}

function RuleList({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h4 style={{ margin: 0, fontSize: '13px' }}>{title}</h4>
      <ul style={{ margin: 'var(--space-1) 0 0', paddingLeft: 'var(--space-4)' }}>
        {children}
      </ul>
    </div>
  )
}

function ScenarioResult({ scenario }: { scenario: WageScenario }) {
  return (
    <article
      aria-label={
        scenario.assumptions.length > 0
          ? `계산 결과 (${scenario.assumptions.map((a) => a.label).join(', ')})`
          : '계산 결과'
      }
      style={{
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
      }}
    >
      {scenario.assumptions.length > 0 && (
        <p style={{ ...mutedTextStyle, margin: 0, fontWeight: 600 }}>
          {scenario.assumptions.map((assumption) => assumption.label).join(' · ')}
        </p>
      )}
      <p style={{ margin: 0, display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
        <span style={{ color: 'var(--color-primary)', fontSize: '14px', fontWeight: 600 }}>
          실효 시급
        </span>
        <strong style={{ fontSize: '20px' }}>
          {formatCurrency(scenario.effectiveHourlyWage)}
        </strong>
      </p>
      <dl
        style={{
          margin: 0,
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          columnGap: 'var(--space-3)',
          rowGap: 'var(--space-1)',
          fontSize: '14px',
        }}
      >
        <dt style={mutedTextStyle}>기본시급</dt>
        <dd style={{ margin: 0 }}>{formatCurrency(scenario.breakdown.basicHourly)}</dd>
        <dt style={mutedTextStyle}>주휴수당 환산분</dt>
        <dd style={{ margin: 0 }}>
          {`+ ${formatCurrency(scenario.breakdown.weeklyRestPerHour)}`}
        </dd>
        <dt style={mutedTextStyle}>가산수당 예상분</dt>
        <dd style={{ margin: 0 }}>
          {`+ ${formatCurrency(scenario.breakdown.premiumPerHour)}`}
        </dd>
      </dl>
      {scenario.warnings.map((warning) => (
        <p key={warning} style={{ margin: 0, fontSize: '13px', fontWeight: 700 }}>
          {`⚠ ${warning}`}
        </p>
      ))}
      {scenario.appliedRules.length > 0 && (
        <RuleList title="적용된 규칙">
          {scenario.appliedRules.map((rule) => (
            <li key={rule.id} style={{ fontSize: '13px' }}>
              <strong>{rule.label}</strong>
              {` — ${rule.reason}`}
            </li>
          ))}
        </RuleList>
      )}
      {scenario.skippedRules.length > 0 && (
        <RuleList title="적용되지 않은 규칙">
          {scenario.skippedRules.map((rule) => (
            <li key={rule.id} style={{ ...mutedTextStyle }}>
              <strong>{rule.label}</strong>
              {` — ${rule.reason}`}
            </li>
          ))}
        </RuleList>
      )}
    </article>
  )
}

export function WageCalculator({ job }: WageCalculatorProps) {
  const eligible = job.wage.type === 'HOURLY' || job.wage.type === 'MONTHLY'
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(String(job.wage.amount))
  const [includesWeeklyRest, setIncludesWeeklyRest] = useState<'YES' | 'NO'>('NO')
  const [weeklyHours, setWeeklyHours] = useState(
    job.weeklyHours !== undefined ? String(job.weeklyHours) : '',
  )
  const [fiveOrMore, setFiveOrMore] = useState<'UNKNOWN' | 'YES' | 'NO'>('UNKNOWN')
  const [probationChoice, setProbationChoice] = useState<'UNKNOWN' | 'NONE' | 'YES'>(
    'UNKNOWN',
  )
  const [contractMonths, setContractMonths] = useState('')
  const [withinThreeMonths, setWithinThreeMonths] = useState<'YES' | 'NO'>('YES')
  const [simpleLabor, setSimpleLabor] = useState<'YES' | 'NO'>('YES')
  const [overtimeHours, setOvertimeHours] = useState('')
  const [nightHours, setNightHours] = useState('')
  const [holidayHours, setHolidayHours] = useState('')
  const [result, setResult] = useState<WageCalculationResult | null>(null)

  useEffect(() => {
    if (eligible) {
      track('wage_calculator_entry_viewed', { jobId: job.id, wageType: job.wage.type })
    }
  }, [eligible, job.id, job.wage.type])

  if (!eligible) return null
  const wageType = job.wage.type as 'HOURLY' | 'MONTHLY'

  const openCalculator = () => {
    setOpen(true)
    track('wage_calculator_opened', { jobId: job.id })
  }

  const parseOptionalHours = (value: string) =>
    value.trim() === '' ? undefined : Number(value)

  const runCalculation = () => {
    const input: WageCalculatorInput = {
      wage: { type: wageType, amount: amount.trim() === '' ? Number.NaN : Number(amount) },
      wageIncludesWeeklyRest: wageType === 'HOURLY' && includesWeeklyRest === 'YES',
      weeklyContractHours: weeklyHours.trim() === '' ? Number.NaN : Number(weeklyHours),
      workplaceHasFiveOrMore: fiveOrMore === 'UNKNOWN' ? 'UNKNOWN' : fiveOrMore === 'YES',
      probation:
        probationChoice === 'UNKNOWN'
          ? 'UNKNOWN'
          : probationChoice === 'NONE'
            ? null
            : {
                isWithinFirstThreeMonths: withinThreeMonths === 'YES',
                contractMonths: contractMonths.trim() === '' ? 0 : Number(contractMonths),
                isSimpleLabor: simpleLabor === 'YES',
              },
      expectedOvertimeHours: parseOptionalHours(overtimeHours),
      expectedNightHours: parseOptionalHours(nightHours),
      expectedHolidayHours: parseOptionalHours(holidayHours),
    }
    const next = calculateWage(input)
    setResult(next)
    if (next.ok) {
      const first = next.scenarios[0]
      const listedHourlyEquivalent =
        wageType === 'HOURLY' ? Number(amount) : first.breakdown.basicHourly
      track('wage_calculator_calculated', {
        jobId: job.id,
        wageType,
        listedAmount: Number(amount),
        effectiveHourlyWage: Math.round(first.effectiveHourlyWage),
        wageGapPerHour: Math.round(first.effectiveHourlyWage - listedHourlyEquivalent),
        hasWarnings: next.scenarios.some((scenario) => scenario.warnings.length > 0),
        usedUnknownFiveOrMore: fiveOrMore === 'UNKNOWN',
        usedUnknownProbation: probationChoice === 'UNKNOWN',
      })
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={openCalculator}>
        시급계산기
      </Button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="시급계산기">
        <div
          style={{
            maxHeight: '70vh',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}
        >
          <p style={{ ...mutedTextStyle, margin: 0 }}>
            공고의 임금을 프리필했습니다. 주휴·가산수당과 수습 하한까지 반영한 세전
            실효 시급을 분해해 보여줍니다.
          </p>
          <TextField
            label={`${wageTypeLabel[wageType]} (원)`}
            type="number"
            inputMode="numeric"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          {wageType === 'HOURLY' && (
            <ChoiceGroup
              label="표기 시급의 주휴수당 포함 여부"
              helpText="공고 본문에 '주휴수당 포함'이라고 적혀 있는지 확인해 주세요."
              options={[
                { value: 'NO', label: '미포함' },
                { value: 'YES', label: '포함' },
              ]}
              value={includesWeeklyRest}
              onChange={(value) => setIncludesWeeklyRest(value as 'YES' | 'NO')}
            />
          )}
          <TextField
            label="주 소정근로시간"
            type="number"
            inputMode="decimal"
            placeholder="예: 20 (0 초과 40 이하)"
            value={weeklyHours}
            onChange={(event) => setWeeklyHours(event.target.value)}
          />
          <ChoiceGroup
            label="상시 5인 이상 사업장인가요?"
            helpText="모름을 선택하면 두 경우를 나란히 계산합니다."
            options={[
              { value: 'UNKNOWN', label: '모름' },
              { value: 'YES', label: '5인 이상' },
              { value: 'NO', label: '5인 미만' },
            ]}
            value={fiveOrMore}
            onChange={(value) => setFiveOrMore(value as 'UNKNOWN' | 'YES' | 'NO')}
          />
          <ChoiceGroup
            label="수습 기간인가요?"
            helpText="수습 감액은 계약 1년 이상 + 시작 3개월 이내 + 단순노무직 아님을 모두 충족할 때만 가능합니다."
            options={[
              { value: 'UNKNOWN', label: '모름' },
              { value: 'NONE', label: '수습 아님' },
              { value: 'YES', label: '수습 중' },
            ]}
            value={probationChoice}
            onChange={(value) => setProbationChoice(value as 'UNKNOWN' | 'NONE' | 'YES')}
          />
          {probationChoice === 'YES' && (
            <>
              <TextField
                label="근로계약 기간 (개월)"
                type="number"
                inputMode="numeric"
                placeholder="예: 12"
                value={contractMonths}
                onChange={(event) => setContractMonths(event.target.value)}
              />
              <ChoiceGroup
                label="수습 시작 3개월 이내인가요?"
                options={[
                  { value: 'YES', label: '3개월 이내' },
                  { value: 'NO', label: '3개월 경과' },
                ]}
                value={withinThreeMonths}
                onChange={(value) => setWithinThreeMonths(value as 'YES' | 'NO')}
              />
              <ChoiceGroup
                label="단순노무직인가요? (배달·서빙·청소 등)"
                helpText="단순노무직은 수습이어도 최저임금 하한을 낮출 수 없습니다."
                options={[
                  { value: 'YES', label: '단순노무직' },
                  { value: 'NO', label: '아님' },
                ]}
                value={simpleLabor}
                onChange={(value) => setSimpleLabor(value as 'YES' | 'NO')}
              />
            </>
          )}
          <TextField
            label="예상 연장시간 (주)"
            type="number"
            inputMode="decimal"
            placeholder="선택 입력"
            value={overtimeHours}
            onChange={(event) => setOvertimeHours(event.target.value)}
          />
          <TextField
            label="예상 야간시간 (주, 22~06시)"
            type="number"
            inputMode="decimal"
            placeholder="선택 입력 — 연장·휴일과 겹치는 시간도 포함"
            value={nightHours}
            onChange={(event) => setNightHours(event.target.value)}
          />
          <TextField
            label="예상 휴일시간 (주)"
            type="number"
            inputMode="decimal"
            placeholder="선택 입력"
            value={holidayHours}
            onChange={(event) => setHolidayHours(event.target.value)}
          />
          <Button onClick={runCalculation}>계산하기</Button>
          {result !== null && !result.ok && (
            <div role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              {result.errors.map((message) => (
                <p key={message} style={{ margin: 0, fontSize: '13px', fontWeight: 700 }}>
                  {`⚠ ${message}`}
                </p>
              ))}
            </div>
          )}
          {result !== null && result.ok && (
            <section
              role="status"
              aria-label="시급 계산 결과"
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
            >
              <p style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>
                세전 · 개근 가정 기준
              </p>
              {result.monthlyContractHours !== undefined && (
                <p style={{ ...mutedTextStyle, margin: 0 }}>
                  {`월급은 월 소정근로시간 ${result.monthlyContractHours}시간(주휴시간 포함)으로 환산했습니다. 시급 공고와 단순 비교 시 주휴 포함 여부를 확인하세요.`}
                </p>
              )}
              {result.scenarios.map((scenario, index) => (
                <ScenarioResult key={index} scenario={scenario} />
              ))}
              <p style={{ ...mutedTextStyle, margin: 0 }}>
                계산 결과는 참고용이며 실제 지급액은 근로계약에 따릅니다.
              </p>
            </section>
          )}
          <Button variant="secondary" onClick={() => setOpen(false)}>
            닫기
          </Button>
        </div>
      </BottomSheet>
    </>
  )
}
