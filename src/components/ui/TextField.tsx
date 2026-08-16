import { useId } from 'react'
import type { InputHTMLAttributes } from 'react'

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
}

export function TextField({ label, id, style, ...rest }: TextFieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      <label
        htmlFor={inputId}
        style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}
      >
        {label}
      </label>
      <input
        id={inputId}
        style={{
          padding: 'var(--space-2) var(--space-3)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          fontSize: '14px',
          ...style,
        }}
        {...rest}
      />
    </div>
  )
}
