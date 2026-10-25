import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { useUnit } from '../contexts/SettingsContext'
import { fmtDuration, parseDuration } from '../lib/logMode'
import { distanceUnit, fmtPace, kmTo, toKm } from '../lib/units'
import type { WorkoutSet } from '../types'

/**
 * One editable timed set (cardio, planks, carries). Duration is typed as text
 * ("25" = 25 min, "25:30") and parsed on blur; the optional stopwatch works from
 * a stored start timestamp so it survives reloads and background tabs.
 */
export function TimedSetRow({
  index,
  set,
  placeholderSec,
  placeholderKm,
  onChange,
  onStop,
  onToggleDone,
  onRemove,
}: {
  index: number
  set: WorkoutSet
  /** Last-time (or plan target) duration shown in the empty field. */
  placeholderSec?: number
  /** Last-time distance in km, shown in the empty distance field. */
  placeholderKm?: number
  onChange: (patch: Partial<WorkoutSet>) => void
  /** Stopwatch stopped: the parent stores the duration, clears the timer and marks the set done. */
  onStop: (durationSec: number) => void
  onToggleDone: () => void
  onRemove: () => void
}) {
  const unit = useUnit()
  const [durationText, setDurationText] = useState('')
  const [distanceText, setDistanceText] = useState('')
  const [now, setNow] = useState(() => Date.now())

  const running = Boolean(set.timerStartedAt)

  // Elapsed is always derived from the timestamp, never from counting ticks.
  useEffect(() => {
    if (!set.timerStartedAt) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [set.timerStartedAt])

  const elapsedSec = set.timerStartedAt
    ? Math.max(0, Math.floor((now - new Date(set.timerStartedAt).getTime()) / 1000))
    : 0

  // Like SetRow: only re-sync when the stored value diverges from what's typed,
  // so "2" isn't reformatted to "2:00" mid-keystroke.
  useEffect(() => {
    setDurationText((prev) => {
      if ((parseDuration(prev) ?? 0) === (set.durationSec ?? 0)) return prev
      return set.durationSec ? fmtDuration(set.durationSec) : ''
    })
  }, [set.durationSec])

  function typeDuration(text: string) {
    const clean = text.replace(/[^0-9:.]/g, '')
    setDurationText(clean)
    // Commit as it's typed so the done check is live; blur tidies the format.
    const parsed = parseDuration(clean)
    if (clean.trim() === '') onChange({ durationSec: undefined })
    else if (parsed !== null) onChange({ durationSec: parsed > 0 ? parsed : undefined })
  }

  useEffect(() => {
    setDistanceText((prev) => {
      const typed = prev === '' ? 0 : toKm(unit, Number(prev))
      if (Math.abs(typed - (set.distanceKm ?? 0)) < 0.001) return prev
      return set.distanceKm ? String(Math.round(kmTo(unit, set.distanceKm) * 100) / 100) : ''
    })
  }, [set.distanceKm, unit])

  function commitDuration(text: string) {
    const parsed = parseDuration(text)
    if (text.trim() === '') {
      onChange({ durationSec: undefined })
    } else if (parsed === null) {
      // Unparseable — snap back to what's stored.
      setDurationText(set.durationSec ? fmtDuration(set.durationSec) : '')
    } else {
      onChange({ durationSec: parsed > 0 ? parsed : undefined })
      setDurationText(parsed > 0 ? fmtDuration(parsed) : '')
    }
  }

  function commitDistance(text: string) {
    setDistanceText(text)
    const n = Number(text)
    onChange({ distanceKm: text === '' || Number.isNaN(n) || n <= 0 ? undefined : toKm(unit, n) })
  }

  function startTimer() {
    // Keep any existing duration as an offset so a paused set can be resumed.
    onChange({ timerStartedAt: new Date(Date.now() - (set.durationSec ?? 0) * 1000).toISOString() })
  }

  const canComplete = (set.durationSec ?? 0) > 0 && !running
  const pace = set.durationSec && set.distanceKm ? fmtPace(set.durationSec, set.distanceKm, unit) : null

  return (
    <li
      className={`flex flex-col gap-1 rounded-xl border px-1.5 py-1.5 transition-colors duration-200
        ${
          set.done
            ? 'border-go-500/40 bg-go-500/10'
            : 'border-[var(--color-line)] bg-[var(--color-surface-2)]'
        }`}
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange({ warmup: !set.warmup })}
          aria-label={set.warmup ? `Set ${index + 1}, warm-up — make working set` : `Set ${index + 1} — mark as warm-up`}
          title={set.warmup ? 'Warm-up set (excluded from totals)' : 'Working set'}
          className={`touch-auto tabular grid size-8 shrink-0 place-items-center rounded-lg text-xs font-bold
            transition-colors duration-200 ${
              set.warmup
                ? 'bg-amber-500/20 text-amber-400'
                : 'bg-[var(--color-surface)] text-[var(--color-fg-muted)]'
            }`}
        >
          {set.warmup ? 'W' : index + 1}
        </button>

        {running ? (
          <div
            role="timer"
            aria-label={`Set ${index + 1} timer running`}
            className="tabular flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-500/20 px-2 font-display text-xl font-bold text-brand-400"
          >
            <Icon name="clock" size={16} className="shrink-0 animate-pulse" />
            {fmtDuration(elapsedSec)}
          </div>
        ) : (
          <input
            type="text"
            inputMode="numeric"
            value={durationText}
            onChange={(e) => typeDuration(e.target.value)}
            onBlur={(e) => commitDuration(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            aria-label={`Set ${index + 1} duration`}
            placeholder={placeholderSec ? fmtDuration(placeholderSec) : 'mm:ss'}
            className="tabular min-h-10 w-full min-w-0 flex-1 rounded-lg border border-transparent bg-[var(--color-surface)] px-2 text-center font-semibold text-[var(--color-fg)] outline-none focus:border-brand-500"
          />
        )}

        <input
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          value={distanceText}
          onChange={(e) => commitDistance(e.target.value)}
          aria-label={`Set ${index + 1} distance in ${distanceUnit(unit)}`}
          placeholder={placeholderKm ? String(Math.round(kmTo(unit, placeholderKm) * 100) / 100) : distanceUnit(unit)}
          className="tabular min-h-10 w-14 shrink-0 rounded-lg border border-transparent bg-[var(--color-surface)] px-1 text-center font-semibold text-[var(--color-fg)] outline-none focus:border-brand-500"
        />

        {running ? (
          <button
            type="button"
            onClick={() => onStop(elapsedSec)}
            aria-label="Stop timer"
            className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-500 text-ink-950 transition-colors duration-200"
          >
            <Icon name="pause" size={18} />
          </button>
        ) : (
          <button
            type="button"
            onClick={startTimer}
            disabled={set.done}
            aria-label={`Start timer for set ${index + 1}`}
            className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--color-surface)] text-brand-400 transition-colors duration-200 hover:bg-brand-500/15 disabled:opacity-30"
          >
            <Icon name="play" size={16} />
          </button>
        )}

        <button
          type="button"
          onClick={onToggleDone}
          disabled={!canComplete && !set.done}
          aria-label={set.done ? `Mark set ${index + 1} incomplete` : `Complete set ${index + 1}`}
          aria-pressed={set.done}
          className={`grid size-10 shrink-0 place-items-center rounded-lg transition-colors duration-200
            disabled:opacity-30 ${
              set.done
                ? 'bg-go-500 text-ink-950'
                : 'bg-[var(--color-surface)] text-[var(--color-fg-muted)] hover:text-go-400'
            }`}
        >
          <Icon name="check" size={18} />
        </button>

        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove set ${index + 1}`}
          className="grid h-10 w-8 shrink-0 place-items-center rounded-lg text-[var(--color-fg-muted)] transition-colors duration-200 hover:bg-rose-500/15 hover:text-rose-400"
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      {pace ? <p className="tabular pl-10 text-[11px] text-[var(--color-fg-muted)]">Pace {pace}</p> : null}
    </li>
  )
}
