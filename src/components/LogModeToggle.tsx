import { Icon } from './Icon'
import type { LogMode } from '../types'

const OPTIONS: Array<{ mode: LogMode; label: string; icon: 'dumbbell' | 'clock' }> = [
  { mode: 'reps', label: 'Weight & reps', icon: 'dumbbell' },
  { mode: 'time', label: 'Time', icon: 'clock' },
]

/**
 * Segmented switch between rep-based and timed logging. Deliberately loud — two
 * labelled pills, the active one filled — so it's obvious how an exercise is logged.
 */
export function LogModeToggle({
  value,
  onChange,
  size = 'md',
  label = 'Log by',
}: {
  value: LogMode
  onChange: (mode: LogMode) => void
  size?: 'sm' | 'md'
  /** Accessible group name, e.g. "Log Treadmill by". */
  label?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid grid-cols-2 gap-1 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] p-1"
    >
      {OPTIONS.map((o) => {
        const active = value === o.mode
        return (
          <button
            key={o.mode}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => !active && onChange(o.mode)}
            className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-lg font-semibold
              transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-brand-500
              ${size === 'sm' ? 'min-h-11 text-sm' : 'min-h-12 text-sm'}
              ${
                active
                  ? 'bg-brand-500 text-ink-950 shadow-sm'
                  : 'text-[var(--color-fg-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-fg)]'
              }`}
          >
            <Icon name={o.icon} size={size === 'sm' ? 14 : 16} />
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
