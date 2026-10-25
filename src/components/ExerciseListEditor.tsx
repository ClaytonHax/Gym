import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'
import { ExercisePicker } from './ExercisePicker'
import { Button, IconButton } from './ui'
import { LogModeToggle } from './LogModeToggle'
import { fmtTargetDuration, isTimed } from '../lib/logMode'
import type { Exercise, LogMode, PlanExercise } from '../types'

const REST_OPTIONS = [30, 60, 90, 120, 150, 180, 240, 300]
const TIME_OPTIONS = [300, 600, 900, 1200, 1500, 1800, 2700, 3600]

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
  const timed = e.logBy === 'time'
  return {
    exerciseId: e.id,
    name: e.name,
    muscle: e.muscle,
    tracksWeight: e.tracksWeight,
    ...(timed ? { logBy: 'time' as const, targetDurationSec: 600 } : {}),
    ...(e.cardioFields?.length ? { cardioFields: e.cardioFields } : {}),
    targets: timed ? [] : ['10-15', '10-15', '10-15'],
    restSec: 120,
  }
}

/**
 * Editable list of exercises with sets, rep targets and rest. Shared by the
 * routine builder and the plan editor; the parent owns the state.
 */
export function ExerciseListEditor({
  items,
  onChange,
}: {
  items: PlanExercise[]
  onChange: (next: PlanExercise[]) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)

  function patchItem(i: number, patch: Partial<PlanExercise>) {
    onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)))
  }

  function setMode(i: number, mode: LogMode) {
    onChange(
      items.map((it, j) => {
        if (j !== i) return it
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { logBy, targetDurationSec, targets, ...rest } = it
        return mode === 'time'
          ? { ...rest, logBy: 'time', targetDurationSec: targetDurationSec ?? 600, targets: [] }
          : { ...rest, targets: ['10-15', '10-15', '10-15'] }
      }),
    )
  }

  function move(i: number, dir: -1 | 1) {
    const t = i + dir
    if (t < 0 || t >= items.length) return
    const next = [...items]
    ;[next[i], next[t]] = [next[t], next[i]]
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-4">
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
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                className="hover:bg-rose-500/15 hover:text-rose-400"
              />
            </div>

            <div className="mt-2">
              <LogModeToggle
                size="sm"
                label={`Log ${it.name} by`}
                value={isTimed(it) ? 'time' : 'reps'}
                onChange={(m) => setMode(i, m)}
              />
            </div>

            <div
              className={`mt-2 grid items-end gap-3 ${
                isTimed(it) ? 'grid-cols-[1fr_auto]' : 'grid-cols-[auto_1fr_auto]'
              }`}
            >
              {isTimed(it) ? (
                <div className="min-w-0">
                  <label>
                    <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">
                      Goal (minutes)
                    </span>
                    <select
                      value={it.targetDurationSec ?? 600}
                      onChange={(e) => patchItem(i, { targetDurationSec: Number(e.target.value) })}
                      aria-label={`Goal minutes for ${it.name}`}
                      className="min-h-11 rounded-lg border border-transparent bg-[var(--color-surface)] px-2 font-semibold outline-none focus:border-brand-500"
                    >
                      {[...new Set([...TIME_OPTIONS, it.targetDurationSec ?? 600])]
                        .sort((a, b) => a - b)
                        .map((s) => (
                          <option key={s} value={s}>
                            {fmtTargetDuration(s)}
                          </option>
                        ))}
                    </select>
                  </label>
                  <p className="mt-1 text-xs text-[var(--color-fg-muted)]">One timed block. Add more rounds while you train.</p>
                </div>
              ) : (
                <>
              <div>
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">
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
                    className="grid size-11 place-items-center rounded-lg bg-[var(--color-surface)] disabled:opacity-30"
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
                    className="grid size-11 place-items-center rounded-lg bg-[var(--color-surface)] disabled:opacity-30"
                  >
                    <Icon name="plus" size={16} />
                  </button>
                </div>
              </div>

              <label className="min-w-0">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">
                  Reps
                </span>
                <input
                  value={rangesText(it.targets)}
                  onChange={(e) =>
                    patchItem(i, {
                      targets: spread(parseRanges(e.target.value), it.targets.length),
                    })
                  }
                  placeholder="10-15"
                  aria-label={`Rep range for ${it.name}`}
                  className="min-h-10 w-full rounded-lg border border-transparent bg-[var(--color-surface)] px-2 text-center font-semibold outline-none focus:border-brand-500"
                />
              </label>
                </>
              )}

              <label>
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">
                  Rest
                </span>
                <select
                  value={it.restSec ?? 120}
                  onChange={(e) => patchItem(i, { restSec: Number(e.target.value) })}
                  aria-label={`Rest after ${it.name}`}
                  className="min-h-11 rounded-lg border border-transparent bg-[var(--color-surface)] px-2 font-semibold outline-none focus:border-brand-500"
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
        Reps: type a range such as 8-12, or the word “failure” (keep going until you can't do
        another). For different goals per set, separate them with commas: 5-9, 10-15.
      </p>

      {/* Portalled so the picker's fixed overlay isn't trapped inside a transformed sheet. */}
      {createPortal(
        <ExercisePicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onPick={(picked) => onChange([...items, ...picked.map(fromExercise)])}
        />,
        document.body,
      )}
    </div>
  )
}
