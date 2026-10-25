import { Link } from 'react-router-dom'
import { createPortal } from 'react-dom'
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
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
    // Dark label on orange: white on #F97316 is only 2.8:1, ink-950 is ~7:1.
    'bg-brand-500 text-ink-950 hover:bg-brand-400 active:bg-brand-600 shadow-lg shadow-brand-500/25',
  go: 'bg-go-500 text-ink-950 hover:bg-go-400 active:bg-go-600 shadow-lg shadow-go-500/25',
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
      className={`inline-flex items-center justify-center rounded-xl font-bold tracking-wide
        transition-[color,background-color,border-color,transform] duration-150 disabled:opacity-50
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

export const Card = forwardRef<
  HTMLElement,
  {
    children: ReactNode
    className?: string
    style?: CSSProperties
    as?: 'div' | 'section' | 'li' | 'article'
  }
>(function Card({ children, className = '', style, as: As = 'div' }, ref) {
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <As ref={ref as any} style={style} className={`card p-4 ${className}`}>
      {children}
    </As>
  )
})

export function SectionHeader({
  title,
  action,
}: {
  title: string
  action?: ReactNode
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="flex items-center gap-2 text-xl font-bold tracking-wide text-[var(--color-fg)]">
        <span className="h-4 w-1 rounded-full bg-brand-500" aria-hidden="true" />
        {title}
      </h2>
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
        <span className="tabular font-display text-4xl leading-none font-bold text-[var(--color-fg)]">
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
        <p id={`${inputId}-hint`} className="text-sm text-[var(--color-fg-muted)]">
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
                  ? 'bg-brand-500 text-ink-950 shadow-md shadow-brand-500/25'
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
    // The whole row is the label, so tapping the text toggles too.
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-4">
      <span className="min-w-0">
        <span className="block font-medium text-[var(--color-fg)]">{label}</span>
        {description ? (
          <span className="block text-sm text-[var(--color-fg-muted)]">{description}</span>
        ) : null}
      </span>
      {/* The button is only the 44px hit area (the global min-height rule would
          otherwise stretch a 28px track into a blob); the track is drawn inside. */}
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className="flex min-h-11 w-14 shrink-0 items-center justify-center"
      >
        <span
          aria-hidden="true"
          className={`relative block h-7 w-12 rounded-full transition-colors duration-200
            ${checked ? 'bg-brand-500' : 'bg-[var(--color-line)]'}`}
        >
          <span
            className={`absolute left-1 top-1 block size-5 rounded-full bg-white shadow-sm shadow-black/30
              transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`}
          />
        </span>
      </button>
    </label>
  )
}

/* -------------------------------------------------------------------------- */
/* Overlays & feedback                                                         */
/* -------------------------------------------------------------------------- */

interface ViewportBox {
  height: number
  top: number
}

/**
 * Tracks the *visual* viewport. On iOS the on-screen keyboard overlays the page
 * without shrinking the layout viewport, so `100dvh`/`inset-0` still extend
 * behind it. `visualViewport` reports the area that is really visible.
 * Returns null where the API is missing (callers fall back to plain `inset-0`).
 */
function useVisualViewport(enabled: boolean): ViewportBox | null {
  const [box, setBox] = useState<ViewportBox | null>(null)

  useEffect(() => {
    const vv = typeof window === 'undefined' ? undefined : window.visualViewport
    if (!enabled || !vv) {
      setBox(null)
      return
    }
    const read = () => {
      const next = { height: Math.round(vv.height), top: Math.round(vv.offsetTop) }
      setBox((prev) => (prev && prev.height === next.height && prev.top === next.top ? prev : next))
    }
    read()
    vv.addEventListener('resize', read)
    vv.addEventListener('scroll', read)
    return () => {
      vv.removeEventListener('resize', read)
      vv.removeEventListener('scroll', read)
    }
  }, [enabled])

  return box
}

const EDITABLE = 'input, textarea, select, [contenteditable="true"]'

/**
 * Bottom sheet — the thumb-friendly modal pattern for phones. Traps focus,
 * closes on Escape, and locks background scroll while open. It sizes itself to
 * the visual viewport so the on-screen keyboard never covers the body/footer.
 *
 * `size="full"` is for search-style sheets: the panel fills the visible height,
 * `pinned` (the search input) stays put under the header and `children` scroll
 * beneath it, so results remain visible above the keyboard.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  pinned,
  size = 'auto',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  /** Rendered under the header and outside the scroll area (e.g. a search field). */
  pinned?: ReactNode
  size?: 'auto' | 'full'
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const viewport = useVisualViewport(open)
  const titleId = useId()
  // Callers usually pass an inline arrow. Reading it through a ref keeps the
  // effect below from re-running on every keystroke, which used to steal focus
  // and dismiss the iOS keyboard mid-typing.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const sizeRef = useRef(size)
  sizeRef.current = size

  // Keep the focused field visible inside the scrolling body: when it gains
  // focus, and again whenever the keyboard resizes the visual viewport.
  const revealFocused = () => {
    const el = document.activeElement
    if (!(el instanceof HTMLElement) || !el.matches(EDITABLE)) return
    if (!bodyRef.current?.contains(el)) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView?.({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' })
  }
  const revealRef = useRef(revealFocused)
  revealRef.current = revealFocused

  const viewportHeight = viewport?.height
  // With the keyboard up the home-indicator inset is covered; skip that padding.
  const keyboardUp = viewport !== null && window.innerHeight - viewport.height > 120
  useEffect(() => {
    if (open && viewportHeight !== undefined) revealRef.current()
  }, [open, viewportHeight])

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
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
    // Defer so the panel exists before we move focus into it. Only search-style
    // sheets pop the keyboard on open; elsewhere an autofocused field wins,
    // otherwise focus the panel so a keyboard doesn't cover the content.
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current
      if (!panel) return
      if (sizeRef.current === 'full') {
        panel.querySelector<HTMLElement>('input, button')?.focus()
      } else if (!panel.contains(document.activeElement)) {
        panel.focus({ preventScroll: true })
      }
    })

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      cancelAnimationFrame(raf)
      document.body.style.overflow = overflow
      previouslyFocused?.focus?.()
    }
  }, [open])

  if (!open) return null

  // Portal to <body>: an animated/transformed ancestor would otherwise become the
  // containing block for `position: fixed` and push the sheet off-screen.
  return createPortal(
    <div
      className="fixed inset-x-0 z-50 flex items-end justify-center sm:items-center"
      // Track the visible area above the keyboard; plain full-screen as a fallback.
      style={viewport ? { top: viewport.top, height: viewport.height } : { top: 0, bottom: 0 }}
    >
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
        tabIndex={-1}
        // focusin bubbles; wait a beat for the keyboard to finish animating in.
        onFocus={() => window.setTimeout(() => revealRef.current(), 300)}
        className={`animate-sheet-up relative flex w-full flex-col outline-none
          border border-[var(--color-line)] bg-[var(--color-surface)] shadow-2xl
          sm:max-w-lg sm:rounded-3xl ${
            size === 'full'
              ? // Stops short of the status bar so the title and close button stay reachable.
                'h-[calc(100%-env(safe-area-inset-top)-1rem)] rounded-t-2xl sm:h-auto sm:max-h-[85%]'
              : 'max-h-[92%] rounded-t-3xl sm:max-h-[90%]'
          }`}
      >
        <span
          className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[var(--color-line)] sm:hidden"
          aria-hidden="true"
        />
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] px-4 py-3">
          <h2 id={titleId} className="text-xl font-bold tracking-wide">
            {title}
          </h2>
          <IconButton icon="x" label="Close" onClick={onClose} />
        </div>
        {pinned ? <div className="shrink-0 px-4 pt-3">{pinned}</div> : null}
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          {children}
        </div>
        {footer ? (
          <div
            className={`${keyboardUp ? '' : 'safe-bottom '}border-t border-[var(--color-line)] p-4`}
          >{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body
  )
}

export function ConfirmSheet({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  tone = 'danger',
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  /** 'primary' for reversible actions (delay, skip) that shouldn't look destructive. */
  tone?: 'danger' | 'primary'
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
          <Button variant={tone} full onClick={onConfirm}>
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
      <span className="grid size-14 place-items-center rounded-2xl bg-brand-500/15 text-brand-400">
        <Icon name={icon} size={26} />
      </span>
      <h3 className="text-xl font-bold tracking-wide">{title}</h3>
      <p className="max-w-[38ch] text-sm text-[var(--color-fg-muted)]">{message}</p>
      {action}
    </div>
  )
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-5">
      <h1 className="font-display text-4xl font-bold tracking-wide">{title}</h1>
      {subtitle ? (
        <p className="mt-0.5 text-sm text-[var(--color-fg-muted)]">{subtitle}</p>
      ) : null}
    </header>
  )
}

/* -------------------------------------------------------------------------- */
/* Gamification & list primitives                                              */
/* -------------------------------------------------------------------------- */

const RING_COLORS = { brand: 'var(--color-brand-500)', go: 'var(--color-go-500)' }

/** Circular progress toward a target. Children render centred inside the ring. */
export function ProgressRing({
  value,
  max,
  size = 96,
  stroke = 8,
  color = 'brand',
  label,
  children,
}: {
  value: number
  max: number
  size?: number
  stroke?: number
  color?: 'brand' | 'go'
  label?: string
  children?: ReactNode
}) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  const aria = label ?? `${value} of ${max}`

  return (
    <div
      role="img"
      aria-label={aria}
      className="relative inline-grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={RING_COLORS[color]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          style={{ transition: 'stroke-dashoffset 300ms cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  )
}

const STREAK_SIZES = {
  sm: { icon: 18, num: 'text-xl', unit: 'text-[10px]', pad: 'px-2.5 py-1' },
  md: { icon: 26, num: 'text-3xl', unit: 'text-xs', pad: 'px-3.5 py-1.5' },
  lg: { icon: 40, num: 'text-5xl', unit: 'text-sm', pad: 'px-5 py-3' },
}

/** Filled SVG flame + count. Muted when the streak is not currently active. */
export function StreakBadge({
  count,
  unit = 'day',
  active = true,
  size = 'md',
}: {
  count: number
  unit?: 'day' | 'week'
  active?: boolean
  size?: 'sm' | 'md' | 'lg'
}) {
  const s = STREAK_SIZES[size]
  const text = `${count} ${unit}${count === 1 ? '' : 's'} streak`
  return (
    <span
      role="img"
      aria-label={active ? text : `${text} (not active today)`}
      className={`inline-flex items-center gap-2 rounded-2xl ${s.pad} ${
        active ? 'bg-brand-500/15 text-flame' : 'bg-[var(--color-surface-2)] text-[var(--color-fg-muted)]'
      }`}
    >
      <svg width={s.icon} height={s.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M12 22c4.42 0 8-3.13 8-7 0-4.5-4-6.5-4-11 0 0-1.5 2.5-3.5 4C10 9.5 8 11.5 8 15c0 1.6.8 3 2 3.9"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M12 22c-2.2 0-4-1.5-4-3.6 0-1.9 2-2.9 2.6-4.9.9 1.1 5.4 2.6 5.4 5.2 0 1.8-1.7 3.3-4 3.3z"
          fill="var(--color-surface)"
          opacity="0.35"
        />
      </svg>
      <span className="flex items-baseline gap-1" aria-hidden="true">
        <span className={`num-display ${s.num}`}>{count}</span>
        <span className={`font-semibold uppercase tracking-wider ${s.unit}`}>{unit}</span>
      </span>
    </span>
  )
}

/** Small "PR" trophy pill shown next to personal-record sets. */
export function PRBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md bg-brand-500 px-1.5 py-0.5
        text-[11px] font-bold uppercase tracking-wider text-ink-950 ${className}`}
    >
      <Icon name="trophy" size={12} />
      PR
    </span>
  )
}

/** Tappable list row (56px min). Renders a router Link when `to` is given. */
export function ListRow({
  to,
  onClick,
  leading,
  title,
  subtitle,
  trailing,
}: {
  to?: string
  onClick?: () => void
  leading?: ReactNode
  title: string
  subtitle?: string
  trailing?: ReactNode
}) {
  const interactive = Boolean(to || onClick)
  const cls = `flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left
    transition-colors duration-150 ${
      interactive ? 'hover:bg-[var(--color-surface-2)] active:bg-[var(--color-surface-2)]' : ''
    }`
  const body = (
    <>
      {leading ? <span className="shrink-0">{leading}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-[var(--color-fg)]">{title}</span>
        {subtitle ? (
          <span className="block truncate text-sm text-[var(--color-fg-muted)]">{subtitle}</span>
        ) : null}
      </span>
      {trailing ? (
        <span className="shrink-0 text-[var(--color-fg-muted)]">{trailing}</span>
      ) : interactive ? (
        <Icon name="chevron-right" size={18} className="shrink-0 text-[var(--color-fg-muted)]" />
      ) : null}
    </>
  )
  if (to) {
    return (
      <Link to={to} className={cls}>
        {body}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {body}
      </button>
    )
  }
  return <div className={cls}>{body}</div>
}
