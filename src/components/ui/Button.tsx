import type { ButtonHTMLAttributes, CSSProperties } from 'react'

export type ButtonVariant = 'primary' | 'secondary'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

const variantStyles: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: 'var(--color-primary)',
    color: 'var(--color-primary-text)',
    border: '1px solid var(--color-primary)',
  },
  secondary: {
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
  },
}

export function Button({
  variant = 'primary',
  type = 'button',
  style,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      style={{
        padding: 'var(--space-2) var(--space-4)',
        borderRadius: 'var(--radius-md)',
        fontSize: '14px',
        fontWeight: 600,
        cursor: 'pointer',
        ...variantStyles[variant],
        ...style,
      }}
      {...rest}
    />
  )
}
