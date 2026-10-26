import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Icon } from '../Icon'
import { haptic } from '../../lib/haptics'

const HOLD_DELAY_MS = 400
const HOLD_INTERVAL_MS = 90

/** Two decimals max, so float noise (0.1 + 0.2) never reaches the screen. */
const round2 = (n: number) => Math.round(n * 100) / 100

/** 62.5 and 60, never 62.50 or 60.00. */
const fmt = (n: number) => String(round2(n))

/**
 * Big number with − / + on either side. Tap the number to type it; hold − or +
 * to keep stepping. Used for weight (decimals) and reps (whole numbers).
 */
export function Stepper({
  label,
  value,
  suggested = false,
  step,
  min = 0,
  decimals = false,
  onChange,
  ariaLabel,
}: {
  label: string
  value: number
  /** A suggestion the person hasn't confirmed yet: shown muted and italic. */
  suggested?: boolean
  step: number
  min?: number
  /** Allow fractional values (weight) rather than whole numbers (reps). */
  decimals?: boolean
  onChange: (n: number) => void
  ariaLabel: string
}) {
  const [editing, setEditing] = useState(false)
  // Escape sets this so the blur that follows the unmount doesn't commit the draft.
  const cancelRef = useRef(false)
  // Hold-to-repeat reads the latest value, not the one from when the press started.
  const valueRef = useRef(value)
  valueRef.current = value
  const timers = useRef<{ delay?: number; repeat?: number }>({})

  const clearTimers = () => {
    window.clearTimeout(timers.current.delay)
    window.clearInterval(timers.current.repeat)
    timers.current = {}
  }
  useEffect(() => clearTimers, [])

  const clampValue = (n: number) => {
    const rounded = decimals ? round2(n) : Math.round(n)
    return Math.max(min, rounded)
  }

  const bump = (dir: 1 | -1) => {
    haptic(8)
    onChange(clampValue(valueRef.current + dir * step))
  }

  const startHold = (dir: 1 | -1) => (e: PointerEvent<HTMLButtonElement>) => {
    // Only the primary button; a right-click shouldn't step the value.
    if (e.button !== 0) return
    e.preventDefault()
    clearTimers()
    bump(dir)
    timers.current.delay = window.setTimeout(() => {
      timers.current.repeat = window.setInterval(() => bump(dir), HOLD_INTERVAL_MS)
    }, HOLD_DELAY_MS)
  }

  const commit = (text: string) => {
    const parsed = Number(text.replace(',', '.'))
    // Empty or non-numeric input leaves the value as it was.
    if (text.trim() !== '' && Number.isFinite(parsed)) onChange(clampValue(parsed))
    setEditing(false)
  }

  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      cancelRef.current = true
      setEditing(false)
    }
  }

  const holdHandlers = (dir: 1 | -1) => ({
    onPointerDown: startHold(dir),
    onPointerUp: clearTimers,
    onPointerLeave: clearTimers,
    onPointerCancel: clearTimers,
  })

  const stepBtn =
    'flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface)] text-[var(--color-fg)] border border-[var(--color-line)] active:bg-[var(--color-line)] select-none touch-none'

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex flex-col items-center rounded-2xl bg-[var(--color-surface-2)] p-3"
    >
      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">
        {label}
      </span>
      <div className="mt-1 flex w-full items-center justify-between gap-2">
        <button
          type="button"
          aria-label={`Decrease ${ariaLabel}`}
          className={stepBtn}
          {...holdHandlers(-1)}
        >
          <Icon name="minus" size={22} />
        </button>

        {editing ? (
          <input
            type="number"
            inputMode={decimals ? 'decimal' : 'numeric'}
            step={decimals ? 'any' : 1}
            min={min}
            aria-label={ariaLabel}
            defaultValue={fmt(value)}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onBlur={(e) => {
              if (cancelRef.current) {
                cancelRef.current = false
                return
              }
              commit(e.currentTarget.value)
            }}
            onKeyDown={onInputKey}
            className="num-display tabular min-w-0 flex-1 bg-transparent text-center text-4xl text-[var(--color-fg)] outline-none"
          />
        ) : (
          <button
            type="button"
            aria-label={`${ariaLabel}, tap to type`}
            onClick={() => {
              cancelRef.current = false
              setEditing(true)
            }}
            className={`num-display tabular min-w-0 flex-1 bg-transparent text-center text-4xl ${
              suggested ? 'italic text-[var(--color-fg-muted)]' : 'text-[var(--color-fg)]'
            }`}
          >
            {fmt(value)}
          </button>
        )}

        <button
          type="button"
          aria-label={`Increase ${ariaLabel}`}
          className={stepBtn}
          {...holdHandlers(1)}
        >
          <Icon name="plus" size={22} />
        </button>
      </div>
    </div>
  )
}
