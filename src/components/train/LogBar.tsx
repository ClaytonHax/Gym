import { useEffect, useState } from 'react'
import { Icon, type IconName } from '../Icon'
import { ProgressRing } from '../ui'
import { Confetti } from './Celebrate'
import { fmtClock } from '../../lib/date'

export interface Feedback {
  /** Changes on every logged set so the banner re-shows. */
  id: number
  text: string
  tone: 'go' | 'xp'
  icon: IconName
}

export interface LogBarRest {
  running: boolean
  remaining: number
  total: number
  onAddThirty: () => void
  onSkip: () => void
}

/**
 * Fixed bottom bar: feedback banner, rest countdown while resting, and the one
 * big button for whatever comes next. The bottom nav is hidden during a workout,
 * so this owns the thumb zone.
 */
export function LogBar({
  label,
  tone = 'go',
  onPress,
  disabled,
  feedback,
  rest,
  confetti,
}: {
  label: string
  tone?: 'go' | 'brand' | 'xp'
  onPress: () => void
  disabled?: boolean
  feedback: Feedback | null
  rest: LogBarRest
  confetti: { key: number; intensity: 'small' | 'big' }
}) {
  const [shown, setShown] = useState<Feedback | null>(null)

  // Banner lives 2.5s; the rest row below it keeps counting on its own.
  useEffect(() => {
    if (!feedback) return
    setShown(feedback)
    const t = window.setTimeout(() => setShown(null), 2500)
    return () => window.clearTimeout(t)
  }, [feedback])

  const pill =
    'tabular min-h-11 shrink-0 rounded-xl bg-[var(--color-surface-2)] px-3.5 text-sm font-bold transition-colors duration-200 hover:text-brand-400'

  return (
    <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-line)] bg-[var(--color-canvas)]/92 backdrop-blur">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 p-3">
        <div aria-live="polite" className="empty:hidden">
          {shown ? (
            <p
              key={shown.id}
              className={`animate-slide-up flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-center font-display text-lg font-bold ${
                shown.tone === 'xp'
                  ? 'bg-[var(--color-xp-400)] text-ink-950'
                  : 'bg-go-500/20 text-go-400'
              }`}
            >
              <Icon name={shown.icon} size={20} className="shrink-0" />
              <span className="min-w-0">{shown.text}</span>
            </p>
          ) : null}
        </div>

        {rest.running ? (
          <div className="flex items-center gap-2" role="group" aria-label="Rest timer">
            <ProgressRing value={rest.remaining} max={rest.total} size={44} stroke={5} label="Rest remaining">
              <Icon name="clock" size={16} className="text-[var(--color-rest)]" />
            </ProgressRing>
            <p className="min-w-0 flex-1 truncate">
              <span className="text-sm font-semibold text-[var(--color-fg-muted)]">Rest </span>
              <span className="tabular font-display text-2xl font-bold">{fmtClock(rest.remaining)}</span>
            </p>
            <button type="button" onClick={rest.onAddThirty} className={pill}>
              +30s
            </button>
            <button type="button" onClick={rest.onSkip} className={pill}>
              Skip
            </button>
          </div>
        ) : null}

        <button
          type="button"
          onClick={onPress}
          disabled={disabled}
          // Keep a focused field focused so the first tap isn't eaten by a blur-driven layout shift.
          onMouseDown={(e) => e.preventDefault()}
          className={`btn-3d btn-3d-${tone} w-full text-lg`}
        >
          {label}
        </button>
      </div>
      <Confetti burstKey={confetti.key} intensity={confetti.intensity} />
    </div>
  )
}
