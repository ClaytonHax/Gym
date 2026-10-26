import { useState, type RefObject } from 'react'
import { Icon } from '../Icon'
import { Stepper } from './Stepper'
import { kgTo, step, toKg } from '../../lib/units'
import type { Unit, WorkoutSet } from '../../types'

const round2 = (n: number) => Math.round(n * 100) / 100

const CHIP_BASE =
  'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors duration-200'

/**
 * The big "do this now" panel: weight and reps steppers side by side, plus the
 * rarely used per-set toggles (warm-up, effort, delete) as small chips.
 */
export function CurrentSetPanel({
  index,
  set,
  unit,
  tracksWeight,
  dumbbell,
  values,
  editing,
  repsRef,
  onChange,
  onUnlog,
  onRemove,
}: {
  index: number
  set: WorkoutSet
  unit: Unit
  tracksWeight: boolean
  dumbbell: boolean
  values: { reps: number; weightKg: number; repsSuggested: boolean; weightSuggested: boolean }
  /** Re-editing a set that was already logged. */
  editing: boolean
  repsRef: RefObject<HTMLDivElement>
  onChange: (patch: Partial<WorkoutSet>) => void
  onUnlog: () => void
  onRemove: () => void
}) {
  const [effortOpen, setEffortOpen] = useState(false)
  const numericTarget = /^\d+$/.test(set.targetReps ?? '')
  const weightLabel = tracksWeight ? (dumbbell ? `${unit} per dumbbell` : unit) : `Extra ${unit} (optional)`
  const repsLabel = set.targetReps && !numericTarget ? `Reps · ${set.targetReps}` : 'Reps'
  const off = 'border-[var(--color-line)] text-[var(--color-fg-muted)] hover:border-brand-500 hover:text-brand-400'

  return (
    <li className="flex flex-col gap-2.5 rounded-2xl border-2 border-brand-500/60 bg-[var(--color-surface)] p-2.5">
      <p className="px-1 text-xs font-bold uppercase tracking-wider text-brand-400">
        {editing ? `Editing set ${index + 1}` : set.warmup ? `Warm-up · set ${index + 1}` : `Set ${index + 1}`}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="min-w-0">
          <Stepper
            label={weightLabel}
            value={round2(kgTo(unit, values.weightKg))}
            suggested={values.weightSuggested}
            step={step(unit)}
            decimals
            onChange={(n) => onChange({ weightKg: toKg(unit, n) })}
            ariaLabel={tracksWeight ? `Set ${index + 1} weight in ${unit}` : `Set ${index + 1} extra weight in ${unit}`}
          />
        </div>
        <div ref={repsRef} className="min-w-0">
          <Stepper
            label={repsLabel}
            value={values.reps}
            suggested={values.repsSuggested}
            step={1}
            onChange={(n) => onChange({ reps: n })}
            ariaLabel={`Set ${index + 1} reps`}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          aria-pressed={Boolean(set.warmup)}
          onClick={() => onChange({ warmup: !set.warmup })}
          className={`${CHIP_BASE} ${set.warmup ? 'border-amber-400 bg-amber-500/20 text-amber-400' : off}`}
        >
          Warm-up
        </button>
        <button
          type="button"
          aria-expanded={effortOpen}
          onClick={() => setEffortOpen((o) => !o)}
          className={`${CHIP_BASE} ${set.rpe ? 'border-violet-400 bg-violet-500/20 text-violet-300' : off}`}
        >
          {set.rpe ? `Effort @${set.rpe}` : 'Effort'}
        </button>
        {editing ? (
          <button type="button" onClick={onUnlog} className={`${CHIP_BASE} ${off}`}>
            <Icon name="rotate" size={14} />
            Unlog
          </button>
        ) : null}
        <button
          type="button"
          onClick={onRemove}
          className={`${CHIP_BASE} border-rose-500/40 text-rose-400 hover:bg-rose-500/10`}
        >
          <Icon name="trash" size={14} />
          Delete set
        </button>
      </div>

      {effortOpen ? (
        <div role="radiogroup" aria-label="Effort, 6 easy to 10 max" className="grid grid-cols-5 gap-1.5">
          {[6, 7, 8, 9, 10].map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={set.rpe === v}
              onClick={() => onChange({ rpe: set.rpe === v ? undefined : v })}
              className={`tabular min-h-11 rounded-lg border text-sm font-bold transition-colors duration-200 ${
                set.rpe === v
                  ? 'border-violet-400 bg-violet-500/25 text-violet-300'
                  : 'border-[var(--color-line)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      ) : null}
    </li>
  )
}
