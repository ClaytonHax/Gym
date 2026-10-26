import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { SetOptionsSheet } from './SetOptionsSheet'
import { useUnit } from '../contexts/SettingsContext'
import { kgTo, step, toKg } from '../lib/units'
import type { WorkoutSet } from '../types'

const fmtNum = (n: number) => String(Math.round(n * 100) / 100)

/**
 * One editable set. The weight/reps fields hold display-unit strings while being
 * typed (so a half-typed "12." doesn't get mangled) and commit to kg on change.
 *
 * An empty row can show a suggestion (last time / the previous set) as greyed
 * placeholder text. Tapping the tick on an empty row logs exactly those numbers.
 */
export function SetRow({
  index,
  set,
  tracksWeight,
  suggestion,
  targetReps,
  showSuggestionHint,
  onChange,
  onToggleDone,
  onRemove,
}: {
  index: number
  set: WorkoutSet
  tracksWeight: boolean
  /** Suggested numbers for an empty row, e.g. the previous set or last session's. */
  suggestion?: { weightKg: number; reps: number }
  /** Prescribed range ('5-9', 'failure') — shown in the empty reps field when there's no suggestion. */
  targetReps?: string
  /** Spell out the suggestion under this row (only the next set to do, to keep the list calm). */
  showSuggestionHint?: boolean
  onChange: (patch: Partial<WorkoutSet>) => void
  /** `override` carries suggested numbers the person never typed, so the tick logs what they saw. */
  onToggleDone: (override?: Partial<WorkoutSet>) => void
  onRemove: () => void
}) {
  const unit = useUnit()
  const [weightText, setWeightText] = useState('')
  const [repsText, setRepsText] = useState('')
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [hint, setHint] = useState<string | null>(null)

  // Re-sync only when the stored value genuinely diverges from what's typed —
  // e.g. a unit switch, "copy last time", or a cross-device sync.
  useEffect(() => {
    setWeightText((prev) => {
      const typed = prev === '' ? 0 : toKg(unit, Number(prev))
      if (Math.abs(typed - set.weightKg) < 0.001) return prev
      return set.weightKg === 0 ? '' : fmtNum(kgTo(unit, set.weightKg))
    })
  }, [set.weightKg, unit])

  useEffect(() => {
    setRepsText(set.reps === 0 ? '' : String(set.reps))
  }, [set.reps])

  function commitWeight(text: string) {
    setWeightText(text)
    const n = Number(text)
    onChange({ weightKg: text === '' || Number.isNaN(n) ? 0 : toKg(unit, n) })
  }

  function commitReps(text: string) {
    const clean = text.replace(/[^0-9]/g, '')
    setRepsText(clean)
    setHint(null)
    onChange({ reps: clean === '' ? 0 : Number(clean) })
  }

  function nudge(delta: number) {
    const base = set.weightKg || suggestion?.weightKg || 0
    commitWeight(fmtNum(Math.max(0, kgTo(unit, base) + delta)))
  }

  const planReps = /^\d+$/.test(targetReps ?? '') ? Number(targetReps) : 0
  const suggestedReps = suggestion?.reps || planReps
  const suggestedWeight = tracksWeight ? suggestion?.weightKg || 0 : 0
  const empty = set.reps === 0 && set.weightKg === 0

  function complete() {
    if (set.done) return onToggleDone()
    const reps = set.reps || suggestedReps
    if (reps <= 0) {
      setHint('Type how many reps you did, then tap the tick.')
      return
    }
    setHint(null)
    const weightKg = set.weightKg || suggestedWeight
    onToggleDone({ reps, ...(weightKg !== set.weightKg ? { weightKg } : {}) })
  }

  const weightPlaceholder = suggestedWeight > 0 ? fmtNum(kgTo(unit, suggestedWeight)) : '—'
  const repsPlaceholder = suggestedReps > 0 ? String(suggestedReps) : targetReps && !/^\d+$/.test(targetReps) ? targetReps : '—'
  const inputBase =
    'tabular min-h-11 w-full min-w-0 scroll-my-40 rounded-lg border border-transparent bg-[var(--color-surface)] px-1 text-center text-lg font-semibold text-[var(--color-fg)] outline-none placeholder:font-normal placeholder:italic placeholder:text-[var(--color-fg-muted)] focus:border-brand-500'

  return (
    <li className="flex flex-col gap-1">
      <div
        className={`flex items-center gap-1 rounded-xl border px-1 py-1.5 transition-colors duration-200
          ${
            set.done
              ? 'border-go-500/40 bg-go-500/10'
              : 'border-[var(--color-line)] bg-[var(--color-surface-2)]'
          }`}
      >
        <span
          className={`tabular grid size-6 shrink-0 place-items-center rounded-md text-xs font-bold ${
            set.warmup ? 'bg-amber-500/20 text-amber-400' : 'bg-[var(--color-surface)] text-[var(--color-fg-muted)]'
          }`}
          title={set.warmup ? 'Warm-up set (not counted in totals)' : undefined}
        >
          <span aria-hidden="true">{set.warmup ? 'W' : index + 1}</span>
          <span className="sr-only">{set.warmup ? `Set ${index + 1}, warm-up` : `Set ${index + 1}`}</span>
        </span>

        {/* Nudge buttons only on wider screens — at phone width they squeeze the weight field to nothing. */}
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {tracksWeight ? (
            <button
              type="button"
              onClick={() => nudge(-step(unit))}
              aria-label="Decrease weight"
              className="hidden size-11 shrink-0 place-items-center rounded-lg text-[var(--color-fg-muted)] transition-colors duration-200 hover:bg-[var(--color-surface)] hover:text-[var(--color-fg)] sm:grid"
            >
              <Icon name="minus" size={16} />
            </button>
          ) : null}
          <input
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            value={weightText}
            onChange={(e) => commitWeight(e.target.value)}
            aria-label={
              tracksWeight
                ? `Set ${index + 1} weight in ${unit}`
                : `Set ${index + 1} extra weight in ${unit}, optional`
            }
            placeholder={tracksWeight ? weightPlaceholder : '+ optional'}
            className={inputBase}
          />
          {tracksWeight ? (
            <button
              type="button"
              onClick={() => nudge(step(unit))}
              aria-label="Increase weight"
              className="hidden size-11 shrink-0 place-items-center rounded-lg text-[var(--color-fg-muted)] transition-colors duration-200 hover:bg-[var(--color-surface)] hover:text-[var(--color-fg)] sm:grid"
            >
              <Icon name="plus" size={16} />
            </button>
          ) : null}
        </div>

        <input
          type="number"
          inputMode="numeric"
          min="0"
          value={repsText}
          onChange={(e) => commitReps(e.target.value)}
          aria-label={`Set ${index + 1} reps`}
          placeholder={repsPlaceholder}
          className={`${inputBase} !w-14 shrink-0 px-1`}
        />

        <button
          type="button"
          onClick={() => setOptionsOpen(true)}
          aria-label={
            set.rpe
              ? `Set ${index + 1} options, effort ${set.rpe}`
              : `Set ${index + 1} options: warm-up, effort, remove`
          }
          className={`tabular grid size-10 shrink-0 place-items-center rounded-lg text-xs font-bold transition-colors duration-200 ${
            set.rpe
              ? 'bg-violet-500/20 text-violet-200'
              : 'text-[var(--color-fg-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-fg)]'
          }`}
        >
          {set.rpe ? `@${set.rpe}` : <Icon name="more" size={18} />}
        </button>

        <button
          type="button"
          // Keep the focused field focused: blur-driven layout shifts (keyboard, nav) are what ate the first tap.
          onMouseDown={(e) => e.preventDefault()}
          onClick={complete}
          aria-label={set.done ? `Mark set ${index + 1} not done` : `Log set ${index + 1} as done`}
          aria-pressed={set.done}
          className={`grid size-10 shrink-0 place-items-center rounded-lg transition-colors duration-200 ${
            set.done
              ? 'bg-go-500 text-ink-950'
              : 'bg-[var(--color-surface)] text-[var(--color-fg-muted)] hover:text-go-400'
          }`}
        >
          <Icon name="check" size={20} />
        </button>
      </div>

      {hint ? (
        <p role="alert" className="px-1 text-sm text-rose-400">
          {hint}
        </p>
      ) : showSuggestionHint && !set.done && empty && suggestedReps > 0 ? (
        <p className="px-1 text-sm text-[var(--color-fg-muted)]">
          Suggested: {suggestedWeight > 0 ? `${fmtNum(kgTo(unit, suggestedWeight))} ${unit} × ` : ''}
          {suggestedReps} reps. Tap the tick to log it, or type your own.
        </p>
      ) : null}

      <SetOptionsSheet
        open={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        title={`Set ${index + 1} options`}
        warmup={Boolean(set.warmup)}
        onWarmup={(w) => onChange({ warmup: w })}
        effort={set.rpe}
        onEffort={(rpe) => onChange({ rpe })}
        onRemove={onRemove}
      />
    </li>
  )
}
