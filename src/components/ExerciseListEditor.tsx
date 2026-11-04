import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'
import { ExercisePicker } from './ExercisePicker'
import { ExerciseDetailSheet, fromExercise, restLabel } from './ExerciseDetailSheet'
import { Button } from './ui'
import { MUSCLE_COLORS } from '../data/exercises'
import { fmtTargetDuration, isTimed } from '../lib/logMode'
import { linkedToNext, moveItem, newSupersetId, supersetColor, toggleSupersetWithNext } from '../lib/supersets'
import { HOLD_HANDLE_CLASS, useHoldToReorder } from '../hooks/useHoldToReorder'
import type { PlanExercise } from '../types'

/** "3 sets · 8–12 reps · 2 min rest": the whole target at a glance. */
function summary(items: PlanExercise[], i: number): string {
  const it = items[i]
  const rest = linkedToNext(items, i) ? 'no rest' : `${restLabel(it.restSec ?? 120).replace(/^None$/, 'no')} rest`
  if (isTimed(it)) return `${fmtTargetDuration(it.targetDurationSec ?? 600)} · ${rest}`
  const sets = `${it.targets.length} ${it.targets.length === 1 ? 'set' : 'sets'}`
  const t = (it.targets[0] ?? '').trim()
  const reps = !t ? '' : t.toLowerCase() === 'failure' ? 'to failure' : `${t.replace('-', '–')} reps`
  if (!reps) return sets
  return `${sets} · ${reps} · ${rest}`
}

/**
 * Compact list of a day's exercises. Tapping one opens its detail sheet, where
 * sets, reps, rest and supersets are edited. Shared by the routine builder and
 * the plan editor; the parent owns the state.
 */
export function ExerciseListEditor({
  items,
  onChange,
}: {
  items: PlanExercise[]
  onChange: (next: PlanExercise[]) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const reorder = useHoldToReorder((from, to) => onChange(moveItem(items, from, to)))

  const detailOpen = openIndex !== null && openIndex < items.length

  const adder = (
    <>
      {/* Portalled so the picker's fixed overlay isn't trapped inside a transformed sheet. */}
      {createPortal(
        <ExercisePicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onPick={(picked) => onChange([...items, ...picked.map(fromExercise)])}
        />,
        document.body,
      )}
    </>
  )

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <Icon name="dumbbell" size={40} className="text-[var(--color-fg-muted)]" />
        <p className="font-display text-lg font-semibold">No exercises yet</p>
        <p className="mb-2 text-sm text-[var(--color-fg-muted)]">Add a few to build this workout.</p>
        <Button icon="plus" onClick={() => setPickerOpen(true)}>
          Add exercises
        </Button>
        {adder}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {items.map((it, i) => {
          const paired = linkedToNext(items, i)
          const inSuperset = paired || linkedToNext(items, i - 1)
          const ip = reorder.itemProps(i)
          return (
            <li
              key={`${it.exerciseId}-${i}`}
              {...ip}
              style={{
                ...ip.style,
                ...(inSuperset ? { borderLeftColor: supersetColor(items, paired ? i : i - 1) } : null),
              }}
              className={`rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] ${
                inSuperset ? 'border-l-4' : ''
              }`}
            >
              <div className="flex min-h-16 items-stretch">
                <div
                  {...reorder.handleProps(i)}
                  aria-hidden
                  className={`grid w-11 shrink-0 cursor-grab place-items-center text-[var(--color-fg-muted)] ${HOLD_HANDLE_CLASS}`}
                >
                  <Icon name="grip" size={18} />
                </div>
                <button
                  type="button"
                  onClick={() => setOpenIndex(i)}
                  aria-label={`Edit ${it.name}`}
                  className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-3 text-left"
                >
                  <span
                    className="h-9 w-2 shrink-0 rounded-full"
                    style={{ background: MUSCLE_COLORS[it.muscle] }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 block font-semibold leading-snug">{it.name}</span>
                    <span className="tabular block text-sm text-[var(--color-fg-muted)]">{summary(items, i)}</span>
                  </span>
                  <Icon name="chevron-right" size={18} className="shrink-0 text-[var(--color-fg-muted)]" />
                </button>
              </div>
              {paired ? (
                <div className="flex justify-center pb-2">
                  <button
                    type="button"
                    onClick={() => onChange(toggleSupersetWithNext(items, i, newSupersetId))}
                    aria-label={`Split superset between ${it.name} and ${items[i + 1].name}`}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-violet-500/60 bg-violet-500/15 px-3 text-xs font-semibold text-violet-200"
                  >
                    <Icon name="link" size={12} />
                    Superset
                  </button>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>

      {items.length >= 2 ? (
        <p className="text-center text-xs text-[var(--color-fg-muted)]">Hold ⠿ to reorder · tap to edit</p>
      ) : null}

      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-500/60 font-semibold text-brand-400 transition-colors duration-200 hover:bg-brand-500/10 motion-reduce:transition-none"
      >
        <Icon name="plus" size={18} />
        Add exercises
      </button>

      {detailOpen ? (
        <ExerciseDetailSheet
          items={items}
          index={openIndex}
          onChange={onChange}
          onIndexChange={setOpenIndex}
          onClose={() => setOpenIndex(null)}
        />
      ) : null}
      {adder}
    </div>
  )
}
