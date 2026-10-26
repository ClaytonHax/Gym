import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'
import { ExercisePicker } from './ExercisePicker'
import { Button, IconButton } from './ui'
import { LogModeToggle } from './LogModeToggle'
import { fmtTargetDuration, isTimed } from '../lib/logMode'
import { linkedToNext, moveItem, newSupersetId, supersetColor, tidySupersets, toggleSupersetWithNext } from '../lib/supersets'
import { HOLD_HANDLE_CLASS, useHoldToReorder } from '../hooks/useHoldToReorder'
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

type RepsMode = 'fixed' | 'range' | 'failure'

function repsMode(v: string): RepsMode {
  const t = v.trim().toLowerCase()
  if (t === 'failure') return 'failure'
  return t.includes('-') ? 'range' : 'fixed'
}

const REPS_MODES: Array<[RepsMode, string]> = [
  ['fixed', 'Fixed'],
  ['range', 'Range'],
  ['failure', 'Failure'],
]

const REPS_INPUT =
  'min-h-11 w-full rounded-lg border border-transparent bg-[var(--color-surface)] px-3 text-center text-base font-semibold outline-none focus:border-brand-500'

/** Three ways to set a rep target: one number, a low–high range, or to failure. */
function RepsEditor({ name, value, onChange }: { name: string; value: string; onChange: (v: string) => void }) {
  const [mode, setMode] = useState<RepsMode>(() => repsMode(value))
  const [lo, hi] = value.split('-').map((x) => x.trim())
  const digits = (x: string) => x.replace(/\D/g, '').slice(0, 3)

  function pick(m: RepsMode) {
    setMode(m)
    const n = digits(lo ?? '')
    onChange(m === 'failure' ? 'failure' : m === 'range' ? `${n}-` : n)
  }

  return (
    <div className="mt-3">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">Reps</span>
      <div role="group" aria-label={`Rep type for ${name}`} className="mb-2 grid grid-cols-3 gap-1 rounded-lg bg-[var(--color-surface)] p-1">
        {REPS_MODES.map(([m, label]) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => pick(m)}
            className={`min-h-9 rounded-md text-sm font-semibold ${
              mode === m ? 'bg-brand-500 text-white' : 'text-[var(--color-fg-muted)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === 'fixed' ? (
        <input
          inputMode="numeric"
          value={mode === 'fixed' ? digits(value) : ''}
          onChange={(e) => onChange(digits(e.target.value))}
          placeholder="10"
          aria-label={`Reps for ${name}`}
          className={REPS_INPUT}
        />
      ) : mode === 'range' ? (
        <div className="flex items-center gap-2">
          <input
            inputMode="numeric"
            value={digits(lo ?? '')}
            onChange={(e) => onChange(`${digits(e.target.value)}-${digits(hi ?? '')}`)}
            placeholder="8"
            aria-label={`Minimum reps for ${name}`}
            className={REPS_INPUT}
          />
          <span className="font-semibold text-[var(--color-fg-muted)]">–</span>
          <input
            inputMode="numeric"
            value={digits(hi ?? '')}
            onChange={(e) => onChange(`${digits(lo ?? '')}-${digits(e.target.value)}`)}
            placeholder="12"
            aria-label={`Maximum reps for ${name}`}
            className={REPS_INPUT}
          />
        </div>
      ) : (
        <p className="min-h-11 rounded-lg bg-[var(--color-surface)] px-3 py-2.5 text-center text-base font-semibold">
          To failure
        </p>
      )}
    </div>
  )
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

  function restSelect(it: PlanExercise, i: number) {
    // Mid-superset there's no rest: you go straight into the next exercise.
    if (linkedToNext(items, i)) {
      return (
        <div>
          <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">
            Rest
          </span>
          <p className="flex min-h-11 items-center text-sm font-semibold text-violet-300">None, go to next</p>
        </div>
      )
    }
    return (
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
    )
  }

  const reorder = useHoldToReorder((from, to) => onChange(moveItem(items, from, to)))

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {items.map((it, i) => {
          const paired = linkedToNext(items, i)
          const inSuperset = paired || linkedToNext(items, i - 1)
          return (
          <li
            key={`${it.exerciseId}-${i}`}
            {...reorder.itemProps(i)}
            style={inSuperset ? { borderLeftColor: supersetColor(items, paired ? i : i - 1) } : undefined}
            className={`rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] p-3 ${
              inSuperset ? 'border-l-4' : ''
            }`}
          >
            <div {...reorder.handleProps(i)} className={`flex items-center gap-1 ${HOLD_HANDLE_CLASS}`}>
              <Icon name="grip" size={18} className="-ml-1 shrink-0 text-[var(--color-fg-muted)]" />
              <p className="min-w-0 flex-1 truncate font-semibold">{it.name}</p>
              <IconButton
                icon="arrow-up"
                label={`Move ${it.name} up`}
                disabled={i === 0}
                onClick={() => onChange(moveItem(items, i, i - 1))}
              />
              <IconButton
                icon="arrow-down"
                label={`Move ${it.name} down`}
                disabled={i === items.length - 1}
                onClick={() => onChange(moveItem(items, i, i + 1))}
              />
              <IconButton
                icon="trash"
                label={`Remove ${it.name}`}
                onClick={() => onChange(tidySupersets(items.filter((_, j) => j !== i)))}
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

            {isTimed(it) ? (
              <div className="mt-2 grid grid-cols-[1fr_auto] items-end gap-3">
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
                {restSelect(it, i)}
              </div>
            ) : (
              <>
                {/* Reps gets its own full-width row: squeezed between Sets and Rest it was cut off on phones. */}
                <div className="mt-2 flex items-end justify-between gap-3">
                  <div>
                    <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">
                      Sets
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Fewer sets of ${it.name}`}
                        disabled={it.targets.length <= 1}
                        onClick={() => patchItem(i, { targets: spread(it.targets, it.targets.length - 1) })}
                        className="grid size-11 place-items-center rounded-lg bg-[var(--color-surface)] disabled:opacity-30"
                      >
                        <Icon name="minus" size={16} />
                      </button>
                      <span className="tabular w-6 text-center font-semibold">{it.targets.length}</span>
                      <button
                        type="button"
                        aria-label={`More sets of ${it.name}`}
                        disabled={it.targets.length >= 10}
                        onClick={() => patchItem(i, { targets: spread(it.targets, it.targets.length + 1) })}
                        className="grid size-11 place-items-center rounded-lg bg-[var(--color-surface)] disabled:opacity-30"
                      >
                        <Icon name="plus" size={16} />
                      </button>
                    </div>
                  </div>
                  {restSelect(it, i)}
                </div>

                <RepsEditor
                  name={it.name}
                  value={it.targets[0] ?? ''}
                  onChange={(v) => patchItem(i, { targets: spread([v], it.targets.length) })}
                />
              </>
            )}

            {i < items.length - 1 ? (
              <button
                type="button"
                onClick={() => onChange(toggleSupersetWithNext(items, i, newSupersetId))}
                aria-pressed={paired}
                className={`mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors duration-200 ${
                  paired
                    ? 'border-violet-500 bg-violet-500/15 text-violet-200'
                    : 'border-[var(--color-line)] text-[var(--color-fg-muted)] hover:border-violet-500 hover:text-[var(--color-fg)]'
                }`}
              >
                <Icon name="link" size={14} />
                {paired ? 'Split superset' : `Superset with ${items[i + 1].name}`}
              </button>
            ) : null}
          </li>
          )
        })}
      </ul>

      <Button variant="secondary" full icon="plus" onClick={() => setPickerOpen(true)}>
        Add exercises
      </Button>
      <p className="text-xs text-[var(--color-fg-muted)]">
        Reps: pick a single number, a range, or failure (keep going until you can't do
        another). Press and hold an exercise's name to drag it somewhere else. A superset is done back to back, with
        rest only after the last exercise in it.
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
