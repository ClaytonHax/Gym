import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Icon } from '../components/Icon'

type ToastTone = 'success' | 'error' | 'info'

/** e.g. { label: 'Undo', onClick: restore } — keeps the toast up longer and makes it tappable. */
export interface ToastAction {
  label: string
  onClick: () => void
}

interface Toast {
  id: number
  message: string
  tone: ToastTone
  action?: ToastAction
}

type ToastFn = (message: string, tone?: ToastTone, opts?: { action?: ToastAction }) => void

const ToastContext = createContext<ToastFn | null>(null)

const TONES: Record<ToastTone, { classes: string; icon: 'check' | 'x' | 'note' }> = {
  success: { classes: 'border-go-500/40 bg-go-500/15 text-go-400', icon: 'check' },
  error: { classes: 'border-rose-500/40 bg-rose-500/15 text-rose-400', icon: 'x' },
  info: { classes: 'border-brand-500/40 bg-brand-500/15 text-brand-400', icon: 'note' },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), [])

  const push = useCallback<ToastFn>(
    (message, tone = 'success', opts) => {
      const id = Date.now() + Math.random()
      setToasts((prev) => [...prev, { id, message, tone, action: opts?.action }])
      // Actionable toasts (Undo) stay long enough to read and reach.
      window.setTimeout(() => dismiss(id), opts?.action ? 6000 : 3200)
    },
    [dismiss]
  )

  const value = useMemo(() => push, [push])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Announced politely so it never interrupts an in-progress action. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-60 flex flex-col items-center gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+6.5rem)]"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-rise flex w-full max-w-sm items-center gap-2.5 rounded-xl border
              px-3.5 py-3 text-sm font-medium backdrop-blur-md ${TONES[t.tone].classes}`}
          >
            <Icon name={TONES[t.tone].icon} size={16} />
            <span className="min-w-0 flex-1 text-[var(--color-fg)]">{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action?.onClick()
                  dismiss(t.id)
                }}
                className="pointer-events-auto -my-2 -mr-1.5 min-h-11 min-w-11 shrink-0 cursor-pointer rounded-lg px-3
                  text-sm font-bold uppercase tracking-wider transition-colors duration-200 hover:bg-white/10"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
