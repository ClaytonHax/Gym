import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { ExercisePicker } from './ExercisePicker'
import { Button, IconButton, Sheet } from './ui'
import { useRoutines } from '../hooks/useRoutines'
import { useToast } from '../contexts/ToastContext'
import type { Exercise, PlanExercise, Routine } from '../types'

const REST_OPTIONS = [30, 60, 90, 120, 150, 180, 240, 300]

function restLabel(sec: number): string {
  return sec < 60 ? `${sec}s` : `${sec / 60} min`
}

/** Spread a list of rep ranges over `count` sets; the last range repeats. */
function spread(ranges: string[], count: number): string[] {
  return Array.from({ length: count }, (_, i) => ranges[Math.min(i, ranges.length - 1)] ?? '')
}

function rangesText(targets: string[]): string {
  return targets.every((t) => t === targets[0]) ? (targets[0] ?? '') : targets.join(', ')
}

function parseRanges(text: string): string[] {
  const list = text.split(',').map((t) => t.trim())
  return list.length ? list : ['']
}

function fromExercise(e: Exercise): PlanExercise {
  return {
    exerciseId: e.id,
    name: e.name,
    muscle: e.muscle,
    tracksWeight: e.tracksWeight,
    targets: ['10-15', '10-15', '10-15'],
    restSec: 120,
  }
}

/** Create or edit a custom routine: exercises, sets, rep ranges and rest. */
export function RoutineBuilder({
  open,
  onClose,
  routine,
}: {
  open: boolean
  onClose: () => void
  /** Pass an existing routine to edit it; omit to create. */
  routine?: Routine | null
}) {
  const { saveRoutine, updateRoutine } = useRoutines()
  const toast = useToast()
  const [name, setName] = useState('')
  const [items, setItems] = useState<PlanExercise[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(routine?.name ?? '')
    setItems(
      routine?.exercises.map((e) => ({
        ...e,
        targets: e.targets ?? Array.from({ length: e.sets ?? 3 }, () => ''),
      })) ?? []
    )
  }, [open, routine])

  function patchItem(i: number, patch: Partial<PlanExercise>) {
    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...patch } : it)))
  }

  function move(i: number, dir: -1 | 1) {
    setItems((prev) => {
      const t = i + dir
      if (t < 0 || t >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[t]] = [next[t], next[i]]
      return next
    })
  }

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) return toast('Give the routine a name.', 'error')
    if (items.length === 0) return toast('Add at least one exercise.', 'error')
    setSaving(true)
    try {
      // Firestore rejects undefined, so optional keys are dropped rather than nulled.
      const exercises = items.map(({ sets: _legacy, ...it }) =>
        Object.fromEntries(Object.entries(it).filter(([, v]) => v !== undefined))
      ) as unknown as PlanExercise[]
      if (routine) await updateRoutine(routine.id, { name: trimmed, exercises })
      else await saveRoutine({ name: trimmed, exercises })
      toast(routine ? 'Routine updated.' : 'Routine saved.')
      onClose()
    } catch {
      toast('Could not save the routine.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={routine ? 'Edit routine' : 'New routine'}
        footer={
          <Button full variant="go" loading={saving} onClick={save}>
            Save routine
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Arms & Abs"
              className="min-h-12 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 outline-none focus:border-brand-500"
            />
          </label>

          <ul className="flex flex-col gap-3">
            {items.map((it, i) => (
              <li
                key={`${it.exerciseId}-${i}`}
                className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] p-3"
              >
                <div className="flex items-center gap-1">
                  <p className="min-w-0 flex-1 truncate font-semibold">{it.name}</p>
                  <IconButton
                    icon="arrow-up"
                    label={`Move ${it.name} up`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  />
                  <IconButton
                    icon="arrow-down"
                    label={`Move ${it.name} down`}
                    disabled={i === items.length - 1}
                    onClick={() => move(i, 1)}
                  />
                  <IconButton
                    icon="trash"
                    label={`Remove ${it.name}`}
                    onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                    className="hover:bg-rose-500/15 hover:text-rose-400"
                  />
                </div>

                <div className="mt-2 grid grid-cols-[auto_1fr_auto] items-end gap-3">
                  <div>
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">
                      Sets
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Fewer sets of ${it.name}`}
                        disabled={it.targets.length <= 1}
                        onClick={() =>
                          patchItem(i, { targets: spread(it.targets, it.targets.length - 1) })
                        }
                        className="grid size-10 place-items-center rounded-lg bg-[var(--color-surface)] disabled:opacity-30"
                      >
                        <Icon name="minus" size={16} />
                      </button>
                      <span className="tabular w-6 text-center font-semibold">{it.targets.length}</span>
                      <button
                        type="button"
                        aria-label={`More sets of ${it.name}`}
                        disabled={it.targets.length >= 10}
                        onClick={() =>
                          patchItem(i, { targets: spread(it.targets, it.targets.length + 1) })
                        }
                        className="grid size-10 place-items-center rounded-lg bg-[var(--color-surface)] disabled:opacity-30"
                      >
                        <Icon name="plus" size={16} />
                      </button>
                    </div>
                  </div>

                  <label className="min-w-0">
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">
                      Reps
                    </span>
                    <input
                      value={rangesText(it.targets)}
                      onChange={(e) =>
                        patchItem(i, { targets: spread(parseRanges(e.target.value), it.targets.length) })
                      }
                      placeholder="10-15"
                      aria-label={`Rep range for ${it.name}`}
                      className="min-h-10 w-full rounded-lg border border-transparent bg-[var(--color-surface)] px-2 text-center font-semibold outline-none focus:border-brand-500"
                    />
                  </label>

                  <label>
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">
                      Rest
                    </span>
                    <select
                      value={it.restSec ?? 120}
                      onChange={(e) => patchItem(i, { restSec: Number(e.target.value) })}
                      aria-label={`Rest after ${it.name}`}
                      className="min-h-10 rounded-lg border border-transparent bg-[var(--color-surface)] px-2 font-semibold outline-none focus:border-brand-500"
                    >
                      {[...new Set([...REST_OPTIONS, it.restSec ?? 120])]
                        .sort((a, b) => a - b)
                        .map((s) => (
                          <option key={s} value={s}>
                            {restLabel(s)}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
              </li>
            ))}
          </ul>

          <Button variant="secondary" full icon="plus" onClick={() => setPickerOpen(true)}>
            Add exercises
          </Button>
          <p className="text-xs text-[var(--color-fg-muted)]">
            Reps accepts a range like 8-12, “failure”, or a list like “5-9, 10-15” to give each set its
            own target.
          </p>
        </div>
      </Sheet>

      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(picked) => setItems((prev) => [...prev, ...picked.map(fromExercise)])}
      />
    </>
  )
}
