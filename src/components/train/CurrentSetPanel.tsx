import { useState, type RefObject } from 'react'
import { Icon } from '../Icon'
import { Stepper } from './Stepper'
import { fmtWeight, kgTo, step, toKg } from '../../lib/units'
import { assistedPatch } from '../../lib/assisted'
import type { ShownValues } from './setValues'
import type { Unit, WorkoutSet } from '../../types'

const round2 = (n: number) => Math.round(n * 100) / 100

/** Inline body-weight entry used by the assisted calculation: a decimal field plus Save. */
function BodyWeightEntry({
  unit,
  initial,
  required,
  onSave,
  onCancel,
}: {
  unit: Unit
  initial: string
  required?: boolean
  onSave: (kg: number) => void
  onCancel?: () => void
}) {
  const [text, setText] = useState(initial)
  const n = Number(text.replace(',', '.'))
  const valid = text.trim() !== '' && Number.isFinite(n) && n > 0
  const label = `Your body weight (${unit})`
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-0 flex-1 basis-32 text-xs font-semibold text-[var(--color-fg-muted)]">
        {label}
        <input
          type="text"
          inputMode="decimal"
          enterKeyHint="done"
          required={required}
          data-body-input
          aria-label={label}
          value={text}
          onChange={(e) => setText(e.target.value.replace(/,/g, '.').replace(/[^\d.]/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && valid) onSave(toKg(unit, n))
          }}
          className="tabular mt-1 min-h-11 w-full rounded-xl border-2 border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-base text-[var(--color-fg)] outline-none focus:border-brand-500"
        />
      </label>
      <button
        type="button"
        disabled={!valid}
        onClick={() => onSave(toKg(unit, n))}
        className="inline-flex min-h-11 items-center rounded-full bg-brand-500 px-4 text-sm font-bold text-ink-950 transition-colors duration-200 hover:bg-brand-400 disabled:opacity-50"
      >
        Save
      </button>
      {onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-[var(--color-fg-muted)]"
        >
          Cancel
        </button>
      ) : null}
    </div>
  )
}

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
  assisted,
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
  values: ShownValues
  /** Re-editing a set that was already logged. */
  editing: boolean
  /** Assisted exercise: the left stepper edits assistance and a body-weight line shows the maths. */
  assisted?: { bodyKg: number | null; onSaveBody: (kg: number) => void }
  repsRef: RefObject<HTMLDivElement>
  onChange: (patch: Partial<WorkoutSet>) => void
  onUnlog: () => void
  onRemove: () => void
}) {
  const [effortOpen, setEffortOpen] = useState(false)
  const [changingBody, setChangingBody] = useState(false)
  const bodyKg = assisted?.bodyKg ?? null
  const assistKg = values.assistKg ?? 0
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
          {assisted ? (
            <Stepper
              label={`Assist ${unit}`}
              value={round2(kgTo(unit, assistKg))}
              suggested={Boolean(values.assistSuggested)}
              step={step(unit)}
              decimals
              onChange={(n) => {
                const a = toKg(unit, n)
                onChange(bodyKg ? assistedPatch(bodyKg, a) : { assistKg: a })
              }}
              ariaLabel={`Set ${index + 1} assistance in ${unit}`}
            />
          ) : (
            <Stepper
              label={weightLabel}
              value={round2(kgTo(unit, values.weightKg))}
              suggested={values.weightSuggested}
              step={step(unit)}
              decimals
              onChange={(n) => onChange({ weightKg: toKg(unit, n) })}
              ariaLabel={tracksWeight ? `Set ${index + 1} weight in ${unit}` : `Set ${index + 1} extra weight in ${unit}`}
            />
          )}
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

      {assisted ? (
        <div className="flex flex-col gap-1.5 rounded-2xl bg-[var(--color-surface-2)] px-3 py-2.5">
          {bodyKg ? (
            <>
              <p className="tabular text-sm text-[var(--color-fg-muted)]">
                {fmtWeight(bodyKg, unit)} body − {fmtWeight(assistKg, unit)} assist ={' '}
                <span className="text-lg font-bold text-[var(--color-fg)]">{fmtWeight(values.weightKg, unit)}</span>
              </p>
              {assistKg >= bodyKg ? (
                <p className="text-xs text-amber-400">Assistance can’t be more than your body weight.</p>
              ) : null}
              {!editing ? (
                changingBody ? (
                  <BodyWeightEntry
                    unit={unit}
                    initial={String(round2(kgTo(unit, bodyKg)))}
                    onSave={(kg) => {
                      assisted.onSaveBody(kg)
                      setChangingBody(false)
                    }}
                    onCancel={() => setChangingBody(false)}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setChangingBody(true)}
                    className="inline-flex min-h-11 w-fit items-center rounded-full border border-[var(--color-line)] px-3.5 text-sm font-semibold text-[var(--color-fg-muted)] transition-colors duration-200 hover:border-brand-500 hover:text-brand-400"
                  >
                    Change body weight
                  </button>
                )
              ) : null}
            </>
          ) : (
            <BodyWeightEntry unit={unit} initial="" required onSave={assisted.onSaveBody} />
          )}
        </div>
      ) : null}

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
