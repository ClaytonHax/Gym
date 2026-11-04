import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from './Icon'
import { ExercisePicker } from './ExercisePicker'
import { LogModeToggle } from './LogModeToggle'
import { RepsEditor } from './RepsEditor'
import { Button, Sheet, Toggle } from './ui'
import { useToast } from '../contexts/ToastContext'
import { MUSCLE_COLORS } from '../data/exercises'
import { fmtTargetDuration, isTimed } from '../lib/logMode'
import { linkedToNext, moveItem, newSupersetId, tidySupersets, toggleSupersetWithNext } from '../lib/supersets'
import type { Exercise, LogMode, PlanExercise } from '../types'

const REST_OPTIONS = [0, 30, 60, 90, 120, 180, 240, 300]
const TIME_OPTIONS = [300, 600, 900, 1200, 1800, 2700, 3600]
const DEFAULT_REST = 120
const DEFAULT_TARGETS = ['10-15', '10-15', '10-15']

export function restLabel(sec: number): string {
  if (sec === 0) return 'None'
  return sec < 60 ? `${sec}s` : `${sec / 60} min`
}

/** Spread a list of rep ranges over `count` sets; the last range repeats. */
export function spread(ranges: string[], count: number): string[] {
  return Array.from({ length: count }, (_, i) => ranges[Math.min(i, ranges.length - 1)] ?? '')
}

export function fromExercise(e: Exercise): PlanExercise {
  const timed = e.logBy === 'time'
  return {
    exerciseId: e.id,
    name: e.name,
    muscle: e.muscle,
    tracksWeight: e.tracksWeight,
    ...(timed ? { logBy: 'time' as const, targetDurationSec: 600 } : {}),
    ...(e.cardioFields?.length ? { cardioFields: e.cardioFields } : {}),
    targets: timed ? [] : [...DEFAULT_TARGETS],
    restSec: DEFAULT_REST,
  }
}

function Label({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">{children}</h3>
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors duration-200 motion-reduce:transition-none ${
        on ? 'border-brand-500 bg-brand-500 text-ink-950' : 'border-[var(--color-line)] bg-[var(--color-surface-2)]'
      }`}
    >
      {children}
    </button>
  )
}

function ActionRow({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: IconName
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-12 w-full items-center gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-4 text-left font-semibold transition-colors duration-200 disabled:opacity-40 motion-reduce:transition-none ${
        danger ? 'text-rose-400' : ''
      }`}
    >
      <Icon name={icon} size={18} />
      {label}
    </button>
  )
}

/**
 * Focused editor for one exercise of a list. Edits apply live to the parent's
 * draft; the list stays the single owner of list-level operations.
 */
export function ExerciseDetailSheet({
  items,
  index,
  onChange,
  onIndexChange,
  onClose,
}: {
  items: PlanExercise[]
  index: number
  onChange: (next: PlanExercise[]) => void
  /** The exercise moved; keep the sheet pointed at it. */
  onIndexChange: (i: number) => void
  onClose: () => void
}) {
  const toast = useToast()
  const [swapping, setSwapping] = useState(false)
  const it = items[index]
  if (!it) return null

  const timed = isTimed(it)
  const next = items[index + 1]
  const prev = items[index - 1]
  const paired = linkedToNext(items, index)
  const prevPaired = linkedToNext(items, index - 1)
  const rest = it.restSec ?? DEFAULT_REST
  const goal = it.targetDurationSec ?? 600
  const differs = it.targets.some((t) => t !== it.targets[0])

  function patch(p: Partial<PlanExercise>) {
    onChange(items.map((x, j) => (j === index ? { ...x, ...p } : x)))
  }

  function setMode(mode: LogMode) {
    if ((mode === 'time') === timed) return
    onChange(
      items.map((x, j) => {
        if (j !== index) return x
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { logBy, targetDurationSec, targets, ...restOf } = x
        return mode === 'time'
          ? { ...restOf, logBy: 'time', targetDurationSec: targetDurationSec ?? 600, targets: [] }
          : { ...restOf, targets: [...DEFAULT_TARGETS] }
      }),
    )
  }

  function swap(picked: Exercise[]) {
    const e = picked[0]
    if (!e) return
    const fresh = fromExercise(e)
    const sameKind = !timed && !isTimed(fresh)
    const swapped: PlanExercise = {
      ...(sameKind ? { ...fresh, targets: it.targets } : fresh),
      restSec: it.restSec ?? DEFAULT_REST,
      ...(it.supersetId ? { supersetId: it.supersetId } : {}),
    }
    onChange(items.map((x, j) => (j === index ? swapped : x)))
  }

  function move(to: number) {
    onChange(moveItem(items, index, to))
    onIndexChange(to)
  }

  function duplicate() {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { supersetId, ...copy } = it
    const out = [...items]
    out.splice(index + 1, 0, { ...copy, targets: [...it.targets] })
    onChange(tidySupersets(out))
    toast(`Duplicated ${it.name}`, 'info')
  }

  function remove() {
    const before = items
    const name = it.name
    onClose()
    onChange(tidySupersets(items.filter((_, j) => j !== index)))
    toast(`Removed ${name}`, 'info', { action: { label: 'Undo', onClick: () => onChange(before) } })
  }

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={it.name}
        footer={
          <Button full onClick={onClose}>
            Done
          </Button>
        }
      >
        <div className="flex flex-col gap-5">
          <p className="flex items-center gap-2 text-sm text-[var(--color-fg-muted)]">
            <span className="size-2.5 rounded-full" style={{ background: MUSCLE_COLORS[it.muscle] }} aria-hidden />
            {it.muscle}
          </p>

          <section>
            <Label>Track by</Label>
            <LogModeToggle label={`Log ${it.name} by`} value={timed ? 'time' : 'reps'} onChange={setMode} />
          </section>

          {timed ? (
            <section>
              <Label>Goal</Label>
              <div role="group" aria-label="Goal time" className="flex flex-wrap gap-2">
                {[...new Set([...TIME_OPTIONS, goal])]
                  .sort((a, b) => a - b)
                  .map((s) => (
                    <Chip key={s} on={goal === s} onClick={() => patch({ targetDurationSec: s })}>
                      {fmtTargetDuration(s)}
                    </Chip>
                  ))}
              </div>
              <p className="mt-2 text-xs text-[var(--color-fg-muted)]">One timed block. Add more rounds while you train.</p>
            </section>
          ) : (
            <>
              <section>
                <Label>Sets</Label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    aria-label={`Fewer sets of ${it.name}`}
                    disabled={it.targets.length <= 1}
                    onClick={() => patch({ targets: spread(it.targets, it.targets.length - 1) })}
                    className="grid size-12 place-items-center rounded-xl bg-[var(--color-surface)] disabled:opacity-30"
                  >
                    <Icon name="minus" size={20} />
                  </button>
                  <span className="num-display tabular min-w-12 text-center text-3xl" aria-live="polite">
                    {it.targets.length}
                  </span>
                  <button
                    type="button"
                    aria-label={`More sets of ${it.name}`}
                    disabled={it.targets.length >= 10}
                    onClick={() => patch({ targets: spread(it.targets, it.targets.length + 1) })}
                    className="grid size-12 place-items-center rounded-xl bg-[var(--color-surface)] disabled:opacity-30"
                  >
                    <Icon name="plus" size={20} />
                  </button>
                </div>
              </section>

              <section>
                <Label>Reps</Label>
                <RepsEditor
                  name={it.name}
                  value={it.targets[0] ?? ''}
                  onChange={(v) => patch({ targets: spread([v], it.targets.length) })}
                />
                {differs ? (
                  <p className="mt-2 text-xs text-[var(--color-fg-muted)]">
                    Sets currently have different targets — changing reps sets all of them.
                  </p>
                ) : null}
              </section>
            </>
          )}

          <section>
            <Label>Rest</Label>
            {paired && next ? (
              <p className="flex min-h-11 items-center text-sm font-semibold text-violet-300">
                No rest — straight into {next.name}
              </p>
            ) : (
              <div role="group" aria-label={`Rest after ${it.name}`} className="flex flex-wrap gap-2">
                {[...new Set([...REST_OPTIONS, rest])]
                  .sort((a, b) => a - b)
                  .map((s) => (
                    <Chip key={s} on={rest === s} onClick={() => patch({ restSec: s })}>
                      {restLabel(s)}
                    </Chip>
                  ))}
              </div>
            )}
          </section>

          {next ? (
            <section>
              <Label>Superset</Label>
              <Toggle
                checked={paired}
                onChange={() => onChange(toggleSupersetWithNext(items, index, newSupersetId))}
                label={`Superset with ${next.name}`}
                description="Do them back to back, rest after the last one."
              />
              {prevPaired && prev ? (
                <p className="mt-2 text-xs text-[var(--color-fg-muted)]">Part of a superset with {prev.name}</p>
              ) : null}
            </section>
          ) : prevPaired && prev ? (
            <section>
              <Label>Superset</Label>
              <p className="text-xs text-[var(--color-fg-muted)]">Part of a superset with {prev.name}</p>
            </section>
          ) : null}

          <section>
            <Label>Actions</Label>
            <div className="flex flex-col gap-2">
              <ActionRow icon="rotate" label="Swap exercise" onClick={() => setSwapping(true)} />
              <div className="grid grid-cols-2 gap-2">
                <ActionRow icon="arrow-up" label="Move up" disabled={index === 0} onClick={() => move(index - 1)} />
                <ActionRow
                  icon="arrow-down"
                  label="Move down"
                  disabled={index === items.length - 1}
                  onClick={() => move(index + 1)}
                />
              </div>
              <ActionRow icon="copy" label="Duplicate" onClick={duplicate} />
              <ActionRow icon="trash" label="Remove exercise" danger onClick={remove} />
            </div>
          </section>
        </div>
      </Sheet>

      {/* Portalled so the picker's fixed overlay isn't trapped inside a transformed sheet. */}
      {createPortal(
        <ExercisePicker open={swapping} onClose={() => setSwapping(false)} onPick={swap} swapFor={it.name} />,
        document.body,
      )}
    </>
  )
}
