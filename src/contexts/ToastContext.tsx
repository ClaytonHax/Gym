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

interface Toast {
  id: number
  message: string
  tone: ToastTone
}

const ToastContext = createContext<((message: string, tone?: ToastTone) => void) | null>(null)

const TONES: Record<ToastTone, { classes: string; icon: 'check' | 'x' | 'note' }> = {
  success: { classes: 'border-go-500/40 bg-go-500/15 text-go-400', icon: 'check' },
  error: { classes: 'border-rose-500/40 bg-rose-500/15 text-rose-400', icon: 'x' },
  info: { classes: 'border-brand-500/40 bg-brand-500/15 text-brand-400', icon: 'note' },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((message: string, tone: ToastTone = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, message, tone }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3200)
  }, [])

  const value = useMemo(() => push, [push])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Announced politely so it never interrupts an in-progress action. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-0 z-60 flex flex-col items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)]"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-rise flex w-full max-w-sm items-center gap-2.5 rounded-xl border
              px-3.5 py-3 text-sm font-medium backdrop-blur-md ${TONES[t.tone].classes}`}
          >
            <Icon name={TONES[t.tone].icon} size={16} />
            <span className="text-[var(--color-fg)]">{t.message}</span>
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
