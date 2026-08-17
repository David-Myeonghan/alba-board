import { useEffect, useId, useState } from 'react'
import type { CSSProperties } from 'react'
import { wageTypeLabel } from '../data/jobs'
import type { Wage } from '../data/jobs'
import { track } from '../lib/analytics'
import { formatCurrency } from '../lib/format'
import { calculateWage } from '../lib/wageCalculator'
import type { Probation, WageCalcResult, WageScenario } from '../lib/wageCalculator'
import { BottomSheet } from './ui/BottomSheet'
import { Button } from './ui/Button'
import { TextField } from './ui/TextField'

export interface WageCalculatorProps {
  jobId: string
  wage: Wage
  /** 공고의 주 근무시간 — 있으면 소정근로시간에 프리필 */
  weeklyHours?: number
}

type YesNo = 'YES' | 'NO'
type YesNoUnknown = YesNo | 'UNKNOWN'
type ProbationChoice = 'NONE' | 'YES' | 'UNKNOWN'

const mutedTextStyle: CSSProperties = {
  margin: 0,
  fontSize: '13px',
  color: 'var(--color-text-muted)',
}

const fieldsetStyle: CSSProperties = {
  border: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
}

interface RadioGroupProps<T extends string> {
  legend: string
  name: string
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
}

function RadioGroup<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
}: RadioGroupProps<T>) {
  return (
    <fieldset style={fieldsetStyle}>
      <legend style={{ padding: 0, fontSize: '13px', color: 'var(--color-text-muted)' }}>
        {legend}
      </legend>
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        {options.map((option) => (
          <label
            key={option.value}
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: '14px' }}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function ScenarioResult({ scenario }: { scenario: WageScenario }) {
  return (
    <section
      aria-label={
        scenario.assumptions.length > 0
          ? `계산 결과 — ${scenario.assumptions.join(', ')}`
          : '계산 결과'
      }
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
        <p style={{ ...mutedTextStyle, fontWeight: 600 }}>
          {scenario.assumptions.join(' · ')}
        </p>
      )}
      <p style={{ margin: 0, display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
        <span style={{ fontSize: '14px' }}>실효 시급</span>
        <strong style={{ fontSize: '18px' }}>
          {formatCurrency(Math.round(scenario.effectiveHourlyWage))}
        </strong>
      </p>
      <ul style={{ margin: 0, paddingLeft: 'var(--space-5)', fontSize: '14px' }}>
        <li>{`주휴 제외 기본시급: ${formatCurrency(Math.round(scenario.breakdown.baseHourly))}`}</li>
        <li>{`주휴수당 환산분: ${formatCurrency(Math.round(scenario.breakdown.weeklyRestHourly))}`}</li>
        <li>{`가산수당 예상분: ${formatCurrency(Math.round(scenario.breakdown.premiumHourly))}`}</li>
      </ul>
      {scenario.warnings.map((warning) => (
        <p
          key={warning.code}
          role="alert"
          style={{ margin: 0, fontSize: '13px', color: 'var(--color-primary)', fontWeight: 600 }}
        >
          {warning.message}
        </p>
      ))}
      {scenario.appliedRules.length > 0 && (
        <div>
          <p style={{ ...mutedTextStyle, fontWeight: 600 }}>적용된 규칙</p>
          <ul style={{ margin: 0, paddingLeft: 'var(--space-5)', fontSize: '13px' }}>
            {scenario.appliedRules.map((note) => (
              <li key={note.rule}>{`${note.rule} — ${note.reason}`}</li>
            ))}
          </ul>
        </div>
      )}
      {scenario.skippedRules.length > 0 && (
        <div>
          <p style={{ ...mutedTextStyle, fontWeight: 600 }}>적용되지 않은 규칙</p>
          <ul style={{ margin: 0, paddingLeft: 'var(--space-5)', fontSize: '13px' }}>
            {scenario.skippedRules.map((note) => (
              <li key={note.rule}>{`${note.rule} — ${note.reason}`}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

export function WageCalculator({ jobId, wage, weeklyHours }: WageCalculatorProps) {
  const groupId = useId()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(String(wage.amount))
  const [includesRest, setIncludesRest] = useState<YesNo>('NO')
  const [hours, setHours] = useState(weeklyHours !== undefined ? String(weeklyHours) : '')
  const [fiveOrMore, setFiveOrMore] = useState<YesNoUnknown>('UNKNOWN')
  const [probationChoice, setProbationChoice] = useState<ProbationChoice>('UNKNOWN')
  const [contractMonths, setContractMonths] = useState('12')
  const [withinThreeMonths, setWithinThreeMonths] = useState<YesNo>('YES')
  const [simpleLabor, setSimpleLabor] = useState<YesNo>('YES')
  const [overtime, setOvertime] = useState('0')
  const [night, setNight] = useState('0')
  const [holiday, setHoliday] = useState('0')
  const [result, setResult] = useState<WageCalcResult | null>(null)

  // 건별 등 시급·월급 외 표기는 범위 밖 — 진입점을 노출하지 않는다
  const isSupported = wage.type === 'HOURLY' || wage.type === 'MONTHLY'

  useEffect(() => {
    if (isSupported) {
      track('wage_calculator_entry_viewed', { jobId })
    }
  }, [isSupported, jobId])

  if (!isSupported) return null

  const handleOpen = () => {
    setOpen(true)
    track('wage_calculator_opened', { jobId })
  }

  const handleCalculate = () => {
    const usedUnknown = fiveOrMore === 'UNKNOWN' || probationChoice === 'UNKNOWN'
    const probation: Probation | null | 'UNKNOWN' =
      probationChoice === 'UNKNOWN'
        ? 'UNKNOWN'
        : probationChoice === 'NONE'
          ? null
          : {
              isWithinFirstThreeMonths: withinThreeMonths === 'YES',
              contractMonths: Number(contractMonths),
              isSimpleLabor: simpleLabor === 'YES',
            }

    const calcResult = calculateWage({
      wage: { type: wage.type as 'HOURLY' | 'MONTHLY', amount: Number(amount) },
      wageIncludesWeeklyRest: includesRest === 'YES',
      weeklyContractHours: Number(hours),
      workplaceHasFiveOrMore: fiveOrMore === 'UNKNOWN' ? 'UNKNOWN' : fiveOrMore === 'YES',
      probation,
      expectedOvertimeHours: Number(overtime),
      expectedNightHours: Number(night),
      expectedHolidayHours: Number(holiday),
    })
    setResult(calcResult)

    if (calcResult.ok) {
      const first = calcResult.scenarios[0]
      track('wage_calculator_calculated', {
        jobId,
        statedHourly: Math.round(calcResult.statedHourly),
        effectiveHourly: Math.round(first.effectiveHourlyWage),
        wageGap: Math.round(first.effectiveHourlyWage - calcResult.statedHourly),
        hasWarnings: calcResult.scenarios.some((s) => s.warnings.length > 0),
        usedUnknown,
      })
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={handleOpen}>
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
          <p style={mutedTextStyle}>
            표기 임금과, 주휴·가산수당과 수습 하한까지 반영한 세전 실효 시급의 차이를
            보여줍니다. (세전, 개근 가정)
          </p>
          <TextField
            label={`${wageTypeLabel[wage.type]} (원)`}
            type="number"
            inputMode="numeric"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          {wage.type === 'HOURLY' && (
            <RadioGroup
              legend="공고의 주휴수당 포함 표기 여부"
              name={`${groupId}-includes-rest`}
              options={[
                { value: 'NO', label: '미포함' },
                { value: 'YES', label: '포함' },
              ]}
              value={includesRest}
              onChange={setIncludesRest}
            />
          )}
          <TextField
            label="주 소정근로시간"
            type="number"
            inputMode="decimal"
            value={hours}
            onChange={(event) => setHours(event.target.value)}
          />
          <RadioGroup
            legend="상시 5인 이상 사업장인가요?"
            name={`${groupId}-five-or-more`}
            options={[
              { value: 'YES', label: '5인 이상' },
              { value: 'NO', label: '5인 미만' },
              { value: 'UNKNOWN', label: '모름' },
            ]}
            value={fiveOrMore}
            onChange={setFiveOrMore}
          />
          <RadioGroup
            legend="수습 기간인가요?"
            name={`${groupId}-probation`}
            options={[
              { value: 'NONE', label: '수습 아님' },
              { value: 'YES', label: '수습 중' },
              { value: 'UNKNOWN', label: '모름' },
            ]}
            value={probationChoice}
            onChange={setProbationChoice}
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
              <RadioGroup
                legend="수습 시작 3개월 이내인가요?"
                name={`${groupId}-within-three`}
                options={[
                  { value: 'YES', label: '3개월 이내' },
                  { value: 'NO', label: '3개월 경과' },
                ]}
                value={withinThreeMonths}
                onChange={setWithinThreeMonths}
              />
              <RadioGroup
                legend="단순노무직(배달·서빙·청소 등)인가요?"
                name={`${groupId}-simple-labor`}
                options={[
                  { value: 'YES', label: '단순노무직' },
                  { value: 'NO', label: '아님' },
                ]}
                value={simpleLabor}
                onChange={setSimpleLabor}
              />
            </>
          )}
          <TextField
            label="주 연장근로 예상 시간"
            type="number"
            inputMode="decimal"
            value={overtime}
            onChange={(event) => setOvertime(event.target.value)}
          />
          <TextField
            label="주 야간근로(22~06시) 예상 시간"
            type="number"
            inputMode="decimal"
            value={night}
            onChange={(event) => setNight(event.target.value)}
          />
          <TextField
            label="주 휴일근로 예상 시간"
            type="number"
            inputMode="decimal"
            value={holiday}
            onChange={(event) => setHoliday(event.target.value)}
          />
          <Button onClick={handleCalculate}>계산하기</Button>

          <div aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {result !== null && !result.ok && (
              <ul
                role="alert"
                style={{
                  margin: 0,
                  paddingLeft: 'var(--space-5)',
                  fontSize: '13px',
                  color: 'var(--color-primary)',
                }}
              >
                {result.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            )}
            {result !== null && result.ok && (
              <>
                <p style={mutedTextStyle}>
                  {`표기 기준 시급 환산 ${formatCurrency(Math.round(result.statedHourly))} · 모든 금액은 세전, 개근 가정입니다.`}
                </p>
                {result.scenarios.map((scenario, index) => (
                  <ScenarioResult key={index} scenario={scenario} />
                ))}
              </>
            )}
            {result !== null && (
              <p style={mutedTextStyle}>
                계산 결과는 참고용이며 실제 지급액은 근로계약에 따릅니다.
              </p>
            )}
          </div>
        </div>
      </BottomSheet>
    </>
  )
}
