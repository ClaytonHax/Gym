import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { useUnit } from '../contexts/SettingsContext'
import { kgTo, step, toKg } from '../lib/units'
import type { WorkoutSet } from '../types'

/**
 * One editable set. The weight/reps fields hold display-unit strings while being
 * typed (so a half-typed "12." doesn't get mangled) and commit to kg on change.
 */
export function SetRow({
  index,
  set,
  tracksWeight,
  placeholder,
  onChange,
  onToggleDone,
  onRemove,
}: {
  index: number
  set: WorkoutSet
  tracksWeight: boolean
  /** "Last time" target, e.g. "80 × 8". */
  placeholder?: { weightKg: number; reps: number }
  onChange: (patch: Partial<WorkoutSet>) => void
  onToggleDone: () => void
  onRemove: () => void
}) {
  const unit = useUnit()
  const [weightText, setWeightText] = useState('')
  const [repsText, setRepsText] = useState('')

  // Re-sync only when the stored value genuinely diverges from what's typed —
  // e.g. a unit switch, "copy last time", or a cross-device sync.
  useEffect(() => {
    setWeightText((prev) => {
      const typed = prev === '' ? 0 : toKg(unit, Number(prev))
      if (Math.abs(typed - set.weightKg) < 0.001) return prev
      return set.weightKg === 0 ? '' : String(Math.round(kgTo(unit, set.weightKg) * 100) / 100)
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
    onChange({ reps: clean === '' ? 0 : Number(clean) })
  }

  function nudge(delta: number) {
    const next = Math.max(0, kgTo(unit, set.weightKg) + delta)
    commitWeight(String(Math.round(next * 100) / 100))
  }

  const canComplete = set.reps > 0 && (!tracksWeight || set.weightKg >= 0)

  return (
    <li
      className={`flex items-center gap-2 rounded-xl border px-2 py-2 transition-colors duration-200
        ${
          set.done
            ? 'border-go-500/40 bg-go-500/10'
            : 'border-[var(--color-line)] bg-[var(--color-surface-2)]'
        }`}
    >
      <button
        type="button"
        onClick={() => onChange({ warmup: !set.warmup })}
        aria-label={set.warmup ? `Set ${index + 1}, warm-up — make working set` : `Set ${index + 1} — mark as warm-up`}
        title={set.warmup ? 'Warm-up set (excluded from volume)' : 'Working set'}
        className={`tabular grid size-8 shrink-0 place-items-center rounded-lg text-xs font-bold
          transition-colors duration-200 ${
            set.warmup
              ? 'bg-amber-500/20 text-amber-400'
              : 'bg-[var(--color-surface)] text-[var(--color-fg-muted)]'
          }`}
      >
        {set.warmup ? 'W' : index + 1}
      </button>

      {tracksWeight ? (
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <button
            type="button"
            onClick={() => nudge(-step(unit))}
            aria-label="Decrease weight"
            className="grid size-9 shrink-0 place-items-center rounded-lg text-[var(--color-fg-muted)] transition-colors duration-200 hover:bg-[var(--color-surface)] hover:text-[var(--color-fg)]"
          >
            <Icon name="minus" size={16} />
          </button>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            value={weightText}
            onChange={(e) => commitWeight(e.target.value)}
            aria-label={`Set ${index + 1} weight in ${unit}`}
            placeholder={placeholder ? String(Math.round(kgTo(unit, placeholder.weightKg)) || '') : '0'}
            className="tabular min-h-10 w-full min-w-0 rounded-lg border border-transparent bg-[var(--color-surface)] px-2 text-center font-semibold text-[var(--color-fg)] outline-none focus:border-brand-500"
          />
          <button
            type="button"
            onClick={() => nudge(step(unit))}
            aria-label="Increase weight"
            className="grid size-9 shrink-0 place-items-center rounded-lg text-[var(--color-fg-muted)] transition-colors duration-200 hover:bg-[var(--color-surface)] hover:text-[var(--color-fg)]"
          >
            <Icon name="plus" size={16} />
          </button>
        </div>
      ) : (
        <span className="flex-1 pl-1 text-xs uppercase tracking-wider text-[var(--color-fg-muted)]">
          Bodyweight
        </span>
      )}

      <input
        type="number"
        inputMode="numeric"
        min="0"
        value={repsText}
        onChange={(e) => commitReps(e.target.value)}
        aria-label={`Set ${index + 1} reps`}
        placeholder={placeholder ? String(placeholder.reps) : '0'}
        className="tabular min-h-10 w-14 shrink-0 rounded-lg border border-transparent bg-[var(--color-surface)] px-1 text-center font-semibold text-[var(--color-fg)] outline-none focus:border-brand-500"
      />
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">
        reps
      </span>

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
        className="grid size-9 shrink-0 place-items-center rounded-lg text-[var(--color-fg-muted)] transition-colors duration-200 hover:bg-rose-500/15 hover:text-rose-400"
      >
        <Icon name="x" size={16} />
      </button>
    </li>
  )
}
