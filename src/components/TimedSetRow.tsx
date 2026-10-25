import { useEffect, useId, useRef, useState } from 'react'
import { Icon } from './Icon'
import { SetOptionsSheet } from './SetOptionsSheet'
import { useUnit } from '../contexts/SettingsContext'
import { fmtDuration, parseDuration } from '../lib/logMode'
import { distanceUnit, fmtPace, kmTo, toKm } from '../lib/units'
import type { TimedPlaceholders } from '../lib/workoutExercise'
import type { CardioField, Unit, WorkoutSet } from '../types'

const fmtNum = (n: number) => String(Math.round(n * 100) / 100)

/**
 * A labelled optional number (distance, speed, incline, level). Holds typed text
 * locally and re-syncs only when the stored value diverges, like the set inputs.
 */
function NumField({
  label,
  value,
  placeholder,
  onValue,
  fromStored = (n) => n,
  toStored = (n) => n,
  max,
  integer,
}: {
  label: string
  value?: number
  placeholder?: number
  onValue: (n: number | undefined) => void
  /** stored -> display (e.g. km -> miles) */
  fromStored?: (n: number) => number
  toStored?: (n: number) => number
  max?: number
  integer?: boolean
}) {
  const id = useId()
  const [text, setText] = useState('')

  useEffect(() => {
    setText((prev) => {
      const typed = prev === '' ? 0 : toStored(Number(prev))
      if (Math.abs(typed - (value ?? 0)) < 0.001) return prev
      return value ? fmtNum(fromStored(value)) : ''
    })
    // fromStored/toStored are stable per unit; value is the real trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function change(raw: string) {
    setText(raw)
    let n = Number(raw)
    if (raw === '' || Number.isNaN(n) || n <= 0) return onValue(undefined)
    if (integer) n = Math.round(n)
    if (max !== undefined) n = Math.min(n, max)
    onValue(toStored(n))
  }

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <label htmlFor={id} className="truncate text-xs font-semibold text-[var(--color-fg-muted)]">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode={integer ? 'numeric' : 'decimal'}
        step="any"
        min="0"
        max={max !== undefined ? fromStored(max) : undefined}
        value={text}
        onChange={(e) => change(e.target.value)}
        placeholder={placeholder ? fmtNum(fromStored(placeholder)) : '—'}
        className="tabular min-h-11 w-full min-w-0 scroll-my-40 rounded-lg border border-transparent bg-[var(--color-surface)] px-2 text-center font-semibold text-[var(--color-fg)] outline-none placeholder:font-normal placeholder:italic placeholder:text-[var(--color-fg-muted)] focus:border-brand-500"
      />
    </div>
  )
}

const speedUnit = (unit: Unit) => (unit === 'kg' ? 'km/h' : 'mph')

/**
 * One editable timed set (cardio, planks, carries). Duration is typed as text
 * ("25" = 25 min, "25:30") and parsed on blur; the optional stopwatch works from
 * a stored start timestamp so it survives reloads and background tabs.
 */
export function TimedSetRow({
  index,
  set,
  cardioFields,
  placeholders = {},
  onChange,
  onStop,
  onToggleDone,
  onAutoDone,
  onRemove,
}: {
  index: number
  set: WorkoutSet
  /** Extra fields for this exercise; undefined keeps the original behaviour (distance only). */
  cardioFields?: CardioField[]
  placeholders?: TimedPlaceholders
  onChange: (patch: Partial<WorkoutSet>) => void
  /** Stopwatch stopped: the parent stores the duration, clears the timer and marks the set done. */
  onStop: (durationSec: number) => void
  onToggleDone: () => void
  /** A duration was typed and the field left: the parent ticks the set (never un-ticks). */
  onAutoDone: () => void
  onRemove: () => void
}) {
  const unit = useUnit()
  const [durationText, setDurationText] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [optionsOpen, setOptionsOpen] = useState(false)
  const durationId = useId()
  // Tapping the tick blurs the duration field first; without this guard the blur would tick it and the tap would untick it.
  const tickTapRef = useRef(0)

  const running = Boolean(set.timerStartedAt)
  const fields = cardioFields ?? (['distance'] as CardioField[])
  const has = (f: CardioField) => fields.includes(f)

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
      // Typing a time is enough to log the set — no separate tick needed.
      if (parsed > 0 && !set.done && Date.now() - tickTapRef.current > 600) onAutoDone()
    }
  }

  function startTimer() {
    // Keep any existing duration as an offset so a paused set can be resumed.
    onChange({ timerStartedAt: new Date(Date.now() - (set.durationSec ?? 0) * 1000).toISOString() })
  }

  const canComplete = (set.durationSec ?? 0) > 0 && !running
  const pace = set.durationSec && set.distanceKm ? fmtPace(set.durationSec, set.distanceKm, unit) : null
  const fieldCount = fields.length

  return (
    <li
      className={`flex flex-col gap-1.5 rounded-xl border px-1.5 py-1.5 transition-colors duration-200
        ${
          set.done
            ? 'border-go-500/40 bg-go-500/10'
            : 'border-[var(--color-line)] bg-[var(--color-surface-2)]'
        }`}
    >
      <div className="flex items-end gap-1.5">
        <span
          className={`tabular mb-1.5 grid size-8 shrink-0 place-items-center rounded-lg text-sm font-bold ${
            set.warmup ? 'bg-amber-500/20 text-amber-400' : 'bg-[var(--color-surface)] text-[var(--color-fg-muted)]'
          }`}
        >
          <span aria-hidden="true">{set.warmup ? 'W' : index + 1}</span>
          <span className="sr-only">{set.warmup ? `Set ${index + 1}, warm-up` : `Set ${index + 1}`}</span>
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <label htmlFor={durationId} className="truncate text-xs font-semibold text-[var(--color-fg-muted)]">
            Time (minutes, or mm:ss)
          </label>
          {running ? (
            <div
              role="timer"
              aria-label={`Set ${index + 1} timer running`}
              className="tabular flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-lg bg-brand-500/20 px-2 font-display text-xl font-bold text-brand-400"
            >
              <Icon name="clock" size={16} className="shrink-0 animate-pulse" />
              {fmtDuration(elapsedSec)}
            </div>
          ) : (
            <input
              id={durationId}
              type="text"
              inputMode="numeric"
              value={durationText}
              onChange={(e) => typeDuration(e.target.value)}
              onBlur={(e) => commitDuration(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              placeholder={placeholders.durationSec ? fmtDuration(placeholders.durationSec) : 'e.g. 25'}
              className="tabular min-h-11 w-full min-w-0 scroll-my-40 rounded-lg border border-transparent bg-[var(--color-surface)] px-2 text-center font-semibold text-[var(--color-fg)] outline-none placeholder:font-normal placeholder:italic placeholder:text-[var(--color-fg-muted)] focus:border-brand-500"
            />
          )}
        </div>

        {running ? (
          <button
            type="button"
            onClick={() => onStop(elapsedSec)}
            aria-label="Stop timer"
            className="grid size-11 shrink-0 place-items-center rounded-lg bg-brand-500 text-ink-950 transition-colors duration-200"
          >
            <Icon name="pause" size={18} />
          </button>
        ) : (
          <button
            type="button"
            onClick={startTimer}
            disabled={set.done}
            aria-label={`Start stopwatch for set ${index + 1}`}
            className="grid size-11 shrink-0 place-items-center rounded-lg bg-[var(--color-surface)] text-brand-400 transition-colors duration-200 hover:bg-brand-500/15 disabled:opacity-30"
          >
            <Icon name="play" size={16} />
          </button>
        )}

        <button
          type="button"
          onPointerDown={() => (tickTapRef.current = Date.now())}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onToggleDone}
          disabled={!canComplete && !set.done}
          aria-label={set.done ? `Mark set ${index + 1} not done` : `Log set ${index + 1} as done`}
          aria-pressed={set.done}
          className={`grid size-11 shrink-0 place-items-center rounded-lg transition-colors duration-200
            disabled:opacity-30 ${
              set.done
                ? 'bg-go-500 text-ink-950'
                : 'bg-[var(--color-surface)] text-[var(--color-fg-muted)] hover:text-go-400'
            }`}
        >
          <Icon name="check" size={20} />
        </button>

        <button
          type="button"
          onClick={() => setOptionsOpen(true)}
          aria-label={`Set ${index + 1} options: warm-up, remove`}
          className="grid size-11 shrink-0 place-items-center rounded-lg text-[var(--color-fg-muted)] transition-colors duration-200 hover:bg-[var(--color-surface)] hover:text-[var(--color-fg)]"
        >
          <Icon name="more" size={18} />
        </button>
      </div>

      {fieldCount > 0 ? (
        <div className={`grid gap-1.5 pl-9 ${fieldCount >= 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {has('distance') ? (
            <NumField
              label={`Distance (${distanceUnit(unit)})`}
              value={set.distanceKm}
              placeholder={placeholders.distanceKm}
              onValue={(n) => onChange({ distanceKm: n })}
              fromStored={(km) => kmTo(unit, km)}
              toStored={(v) => toKm(unit, v)}
            />
          ) : null}
          {has('speed') ? (
            <NumField
              label={`Speed (${speedUnit(unit)})`}
              value={set.speedKmh}
              placeholder={placeholders.speedKmh}
              onValue={(n) => onChange({ speedKmh: n })}
              fromStored={(km) => kmTo(unit, km)}
              toStored={(v) => toKm(unit, v)}
            />
          ) : null}
          {has('incline') ? (
            <NumField
              label="Incline (%)"
              value={set.inclinePct}
              placeholder={placeholders.inclinePct}
              onValue={(n) => onChange({ inclinePct: n })}
            />
          ) : null}
          {has('level') ? (
            <NumField
              label="Level / resistance (1–20)"
              value={set.level}
              placeholder={placeholders.level}
              onValue={(n) => onChange({ level: n })}
              integer
              max={20}
            />
          ) : null}
        </div>
      ) : null}

      {pace ? <p className="tabular pl-9 text-sm text-[var(--color-fg-muted)]">Pace {pace}</p> : null}

      <SetOptionsSheet
        open={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        title={`Set ${index + 1} options`}
        warmup={Boolean(set.warmup)}
        onWarmup={(w) => onChange({ warmup: w })}
        showEffort={false}
        effort={undefined}
        onEffort={() => undefined}
        onRemove={onRemove}
      />
    </li>
  )
}
