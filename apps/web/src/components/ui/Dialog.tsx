import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

/* ————— Confirm dialog (Promise-based) ————— */

type ConfirmOptions = {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

type ConfirmContextValue = (opts: ConfirmOptions | string) => Promise<boolean>

const ConfirmContext = createContext<ConfirmContextValue | null>(null)

type PendingConfirm = ConfirmOptions & { resolve: (v: boolean) => void }

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null)

  const confirm = useCallback<ConfirmContextValue>((opts) => {
    const o: ConfirmOptions = typeof opts === 'string' ? { title: opts } : opts
    return new Promise<boolean>((resolve) => {
      setPending({ ...o, resolve })
    })
  }, [])

  const close = (value: boolean) => {
    if (!pending) return
    pending.resolve(value)
    setPending(null)
  }

  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false)
      if (e.key === 'Enter') close(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(20, 20, 20, 0.45)',
            backdropFilter: 'blur(2px)',
            animation: 'vt-fade-in .12s ease',
          }}
          onClick={() => close(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--vt-surface)',
              borderRadius: 14,
              boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
              maxWidth: 440, width: 'calc(100% - 48px)',
              padding: 24,
              display: 'grid', gap: 14,
              animation: 'vt-pop-in .16s cubic-bezier(.2,.9,.4,1)',
            }}
          >
            <div style={{
              fontFamily: 'var(--vt-font-display)',
              fontSize: 18, fontWeight: 600,
              color: 'var(--vt-text)',
              letterSpacing: '-0.01em',
            }}>
              {pending.title}
            </div>
            {pending.message && (
              <div style={{ fontSize: 13, color: 'var(--vt-muted)', lineHeight: 1.5 }}>
                {pending.message}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="vt-btn vt-btn-ghost" onClick={() => close(false)}>
                {pending.cancelLabel ?? 'Отмена'}
              </button>
              <button
                className="vt-btn vt-btn-primary"
                onClick={() => close(true)}
                style={pending.danger ? {
                  background: 'var(--vt-cat-coral-deep)',
                } : undefined}
                autoFocus
              >
                {pending.confirmLabel ?? 'Ок'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm() must be used inside <ConfirmProvider>')
  return ctx
}

/* ————— Toast notifications ————— */

type ToastVariant = 'info' | 'success' | 'error' | 'warning'
type Toast = { id: number; variant: ToastVariant; message: string }

type ToastContextValue = {
  show: (message: string, variant?: ToastVariant) => void
  success: (m: string) => void
  error: (m: string) => void
  warning: (m: string) => void
  info: (m: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])

  const show = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = Date.now() + Math.random()
    setItems((p) => [...p, { id, variant, message }])
    setTimeout(() => setItems((p) => p.filter((x) => x.id !== id)), 4000)
  }, [])

  const api: ToastContextValue = {
    show,
    success: (m) => show(m, 'success'),
    error: (m) => show(m, 'error'),
    warning: (m) => show(m, 'warning'),
    info: (m) => show(m, 'info'),
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        style={{
          position: 'fixed', right: 20, bottom: 20, zIndex: 1100,
          display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360,
        }}
      >
        {items.map((t) => (
          <div
            key={t.id}
            style={{
              padding: '12px 16px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 500,
              color: toastColor(t.variant).color,
              background: toastColor(t.variant).bg,
              border: `1.5px solid ${toastColor(t.variant).border}`,
              boxShadow: '0 6px 16px rgba(0,0,0,0.08)',
              animation: 'vt-pop-in .18s cubic-bezier(.2,.9,.4,1)',
              cursor: 'pointer',
            }}
            onClick={() => setItems((p) => p.filter((x) => x.id !== t.id))}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast() must be used inside <ToastProvider>')
  return ctx
}

function toastColor(v: ToastVariant): { bg: string; color: string; border: string } {
  switch (v) {
    case 'success': return { bg: 'var(--vt-accent-bg)', color: 'var(--vt-accent-text)', border: 'var(--vt-accent-border)' }
    case 'error':   return { bg: 'var(--vt-danger-bg)', color: 'var(--vt-danger-text)', border: 'var(--vt-danger-border)' }
    case 'warning': return { bg: 'var(--vt-warning-bg)', color: 'var(--vt-warning-text)', border: 'var(--vt-warning-border)' }
    default:        return { bg: 'var(--vt-surface)', color: 'var(--vt-text)', border: 'var(--vt-border)' }
  }
}
