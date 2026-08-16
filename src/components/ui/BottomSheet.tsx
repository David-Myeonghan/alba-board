import type { CSSProperties, ReactNode } from 'react'

export interface BottomSheetProps {
  /** true일 때만 시트가 렌더된다 */
  open: boolean
  /** 오버레이 클릭 시 호출 */
  onClose: () => void
  title?: string
  children: ReactNode
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'var(--color-overlay)',
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
}

const sheetStyle: CSSProperties = {
  width: '100%',
  maxWidth: '480px',
  background: 'var(--color-bg)',
  borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
  padding: 'var(--space-5)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  if (!open) return null

  return (
    <div role="presentation" style={overlayStyle} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={sheetStyle}
        onClick={(event) => event.stopPropagation()}
      >
        {title !== undefined && (
          <h2 style={{ margin: 0, fontSize: '18px' }}>{title}</h2>
        )}
        {children}
      </div>
    </div>
  )
}
