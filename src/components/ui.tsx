import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react'
import { Icon, type IconName } from './Icon'

/* -------------------------------------------------------------------------- */
/* Button                                                                      */
/* -------------------------------------------------------------------------- */

type Variant = 'primary' | 'go' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 shadow-lg shadow-brand-500/20',
  go: 'bg-go-500 text-ink-950 hover:bg-go-400 active:bg-go-600 shadow-lg shadow-go-500/20',
  secondary:
    'bg-[var(--color-surface-2)] text-[var(--color-fg)] border border-[var(--color-line)] hover:border-brand-500/60 hover:text-brand-400',
  ghost: 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface-2)]',
  danger: 'bg-rose-600 text-white hover:bg-rose-500 active:bg-rose-700',
}

// min-h keeps every control at or above the 44px touch target.
const SIZES: Record<Size, string> = {
  sm: 'min-h-11 px-3 text-sm gap-1.5',
  md: 'min-h-12 px-4 text-[15px] gap-2',
  lg: 'min-h-14 px-6 text-base gap-2.5',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: IconName
  loading?: boolean
  full?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    icon,
    loading = false,
    full = false,
    disabled,
    className = '',
    children,
    ...rest
  },
  ref
) {
  return (
    <button
      ref={ref}
      // Disabling during async work stops double-submits on flaky gym wifi.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center rounded-xl font-semibold tracking-wide
        transition-colors duration-200 disabled:opacity-50
        ${VARIANTS[variant]} ${SIZES[size]} ${full ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading ? <Spinner size={16} /> : icon ? <Icon name={icon} size={18} /> : null}
      {children}
    </button>
  )
})

/** Square icon-only button — always needs a label for screen readers. */
export function IconButton({
  icon,
  label,
  variant = 'ghost',
  size = 20,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: IconName
  label: string
  variant?: Variant
  size?: number
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-xl
        transition-colors duration-200 disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      <Icon name={icon} size={size} />
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                    */
/* -------------------------------------------------------------------------- */

export function Card({
  children,
  className = '',
  as: As = 'div',
}: {
  children: ReactNode
  className?: string
  as?: 'div' | 'section' | 'li' | 'article'
}) {
  return <As className={`card p-4 ${className}`}>{children}</As>
}

export function SectionHeader({
  title,
  action,
}: {
  title: string
  action?: ReactNode
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="text-lg font-semibold text-[var(--color-fg)]">{title}</h2>
      {action}
    </div>
  )
}

/** Big numeric readout. `delta` is pre-formatted; `trend` drives colour + arrow. */
export function StatTile({
  label,
  value,
  unit,
  icon,
  delta,
  trend = 'flat',
  accent = 'brand',
}: {
  label: string
  value: string
  unit?: string
  icon?: IconName
  delta?: string
  trend?: 'up' | 'down' | 'flat'
  accent?: 'brand' | 'go' | 'sky' | 'violet'
}) {
  const accents = {
    brand: 'text-brand-400 bg-brand-500/10',
    go: 'text-go-400 bg-go-500/10',
    sky: 'text-sky-400 bg-sky-500/10',
    violet: 'text-violet-400 bg-violet-500/10',
  }
  const trendTone =
    trend === 'up' ? 'text-go-400' : trend === 'down' ? 'text-sky-400' : 'text-[var(--color-fg-muted)]'

  return (
    <div className="card flex flex-col gap-2 p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-fg-muted)]">
          {label}
        </span>
        {icon ? (
          <span className={`grid size-7 place-items-center rounded-lg ${accents[accent]}`}>
            <Icon name={icon} size={15} />
          </span>
        ) : null}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="tabular font-display text-3xl leading-none font-semibold text-[var(--color-fg)]">
          {value}
        </span>
        {unit ? (
          <span className="text-sm font-medium text-[var(--color-fg-muted)]">{unit}</span>
        ) : null}
      </div>
      {delta ? (
        <span className={`flex items-center gap-1 text-xs font-medium ${trendTone}`}>
          {trend !== 'flat' ? (
            <Icon name={trend === 'up' ? 'arrow-up' : 'arrow-down'} size={12} />
          ) : null}
          {delta}
        </span>
      ) : null}
    </div>
  )
}

export function Badge({
  children,
  color,
  className = '',
}: {
  children: ReactNode
  /** Any CSS colour — used at 18% for the fill and full strength for text. */
  color?: string
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold
        uppercase tracking-wider ${className}`}
      style={
        color
          ? { color, backgroundColor: `${color}2e` }
          : undefined
      }
    >
      {children}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Form controls                                                               */
/* -------------------------------------------------------------------------- */

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
  error?: string
  suffix?: ReactNode
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, suffix, className = '', id, ...rest },
  ref
) {
  const autoId = useId()
  const inputId = id ?? autoId
  const describedBy = error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={inputId}
        className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-fg-muted)]"
      >
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`min-h-12 w-full rounded-xl border bg-[var(--color-surface-2)] px-3.5
            text-[var(--color-fg)] placeholder:text-[var(--color-fg-muted)]
            transition-colors duration-200 outline-none
            focus:border-brand-500 ${suffix ? 'pr-12' : ''}
            ${error ? 'border-rose-500' : 'border-[var(--color-line)]'} ${className}`}
          {...rest}
        />
        {suffix ? (
          <span className="absolute inset-y-0 right-3 flex items-center text-sm text-[var(--color-fg-muted)]">
            {suffix}
          </span>
        ) : null}
      </div>
      {error ? (
        <p id={`${inputId}-err`} role="alert" className="text-xs font-medium text-rose-400">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-xs text-[var(--color-fg-muted)]">
          {hint}
        </p>
      ) : null}
    </div>
  )
})

/** Tab-style switch for 2–4 short options. Arrow keys move between them. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = 'md',
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
  label: string
  size?: 'sm' | 'md'
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="inline-flex w-full gap-1 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] p-1"
    >
      {options.map((opt) => {
        const selected = opt.value === value
        return (
          <button
            key={opt.value}
            role="tab"
            type="button"
            aria-selected={selected}
            onClick={() => onChange(opt.value)}
            className={`flex-1 rounded-lg font-semibold transition-colors duration-200
              ${size === 'sm' ? 'min-h-9 px-2 text-xs' : 'min-h-10 px-3 text-sm'}
              ${
                selected
                  ? 'bg-brand-500 text-white'
                  : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'
              }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  description?: string
}) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="block font-medium text-[var(--color-fg)]">
          {label}
        </label>
        {description ? (
          <p className="text-sm text-[var(--color-fg-muted)]">{description}</p>
        ) : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200
          ${checked ? 'bg-brand-500' : 'bg-[var(--color-line)]'}`}
      >
        <span
          className={`absolute top-1 size-5 rounded-full bg-white transition-transform duration-200
            ${checked ? 'translate-x-6' : 'translate-x-1'}`}
        />
      </button>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Overlays & feedback                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Bottom sheet — the thumb-friendly modal pattern for phones. Traps focus,
 * closes on Escape, and locks background scroll while open.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    // Defer so the panel exists before we move focus into it.
    const raf = requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>('input, button')?.focus()
    })

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      cancelAnimationFrame(raf)
      document.body.style.overflow = overflow
      previouslyFocused?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="animate-fade absolute inset-0 bg-ink-950/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="animate-sheet-up relative flex max-h-[90dvh] w-full flex-col
          rounded-t-3xl border border-[var(--color-line)] bg-[var(--color-surface)]
          sm:max-w-lg sm:rounded-3xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] px-4 py-3">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <IconButton icon="x" label="Close" onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
        {footer ? (
          <div className="safe-bottom border-t border-[var(--color-line)] p-4">{footer}</div>
        ) : null}
      </div>
    </div>
  )
}

export function ConfirmSheet({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Sheet
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" full onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" full onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <p className="text-[var(--color-fg-muted)]">{message}</p>
    </Sheet>
  )
}

export function Spinner({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`animate-spin ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" fill="none" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}

/** Reserves layout space while data loads, so content never jumps in. */
export function Skeleton({
  className = '',
  style,
}: {
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-[var(--color-surface-2)] ${className}`}
      style={style}
      aria-hidden="true"
    />
  )
}

/**
 * Accessible table alternative rendered alongside every chart. Lives here rather
 * than in Charts.tsx so importing it never drags in the Recharts bundle.
 */
export function ChartTable({
  caption,
  head,
  rows,
}: {
  caption: string
  head: string[]
  rows: string[][]
}) {
  if (rows.length === 0) return null
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
        View as table
      </summary>
      <div className="mt-2 max-h-56 overflow-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-[var(--color-surface)]">
            <tr>
              {head.map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="border-b border-[var(--color-line)] py-1.5 pr-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular">
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-[var(--color-line)]/60">
                {row.map((cell, j) => (
                  <td key={j} className="py-1.5 pr-3">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: IconName
  title: string
  message: string
  action?: ReactNode
}) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-brand-500/10 text-brand-400">
        <Icon name={icon} size={26} />
      </span>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="max-w-[38ch] text-sm text-[var(--color-fg-muted)]">{message}</p>
      {action}
    </div>
  )
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-5">
      <h1 className="font-display text-3xl font-semibold tracking-wide">{title}</h1>
      {subtitle ? (
        <p className="mt-0.5 text-sm text-[var(--color-fg-muted)]">{subtitle}</p>
      ) : null}
    </header>
  )
}
