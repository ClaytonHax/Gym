import type { RefObject } from 'react'
import { Icon } from '../Icon'
import { Badge, IconButton } from '../ui'
import { ExerciseGuide } from '../ExerciseGuide'
import { ExerciseNotes } from '../ExerciseNotes'
import { TimedSetRow } from '../TimedSetRow'
import { CurrentSetPanel } from './CurrentSetPanel'
import { shownValues } from './setValues'
import { MUSCLE_COLORS } from '../../data/exercises'
import { fmtClock } from '../../lib/date'
import { fmtDuration, fmtTargetDuration } from '../../lib/logMode'
import { fmtDistance, fmtWeight, step } from '../../lib/units'
import { XP_RULES, setXp } from '../../lib/xp'
import { aimLabel, keyOf, timedPlaceholders } from '../../lib/workoutExercise'
import type { Unit, WorkoutExercise, WorkoutSet } from '../../types'

const CHIP =
  'inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[var(--color-line)] px-3.5 text-sm font-semibold text-[var(--color-fg-muted)] transition-colors duration-200 hover:border-brand-500 hover:text-brand-400'

const INFO_CHIP =
  'inline-flex items-center gap-1.5 rounded-full bg-[var(--color-surface-2)] px-3 py-1.5 text-sm text-[var(--color-fg-muted)]'

/** The one big card for the exercise you're on. */
export function ExerciseFocus({
  ex,
  unit,
  dumbbell,
  last,
  lastFull,
  timed,
  overload,
  showPlanRest,
  superset,
  panelIndex,
  editing,
  repsRef,
  onMenu,
  onSetChange,
  onEditSet,
  onUnlog,
  onRemoveSet,
  onAddSet,
  onNotes,
  onToggleDone,
}: {
  ex: WorkoutExercise
  unit: Unit
  dumbbell: boolean
  last?: { sets: Array<{ weightKg: number; reps: number; durationSec?: number; distanceKm?: number }> }
  lastFull: WorkoutSet[]
  timed: boolean
  overload: boolean
  showPlanRest: boolean
  superset?: { color?: string }
  /** The set the big panel is on (first not-done, or the done one being edited); -1 when none. */
  panelIndex: number
  editing: boolean
  repsRef: RefObject<HTMLDivElement>
  onMenu: () => void
  onSetChange: (setIndex: number, patch: Partial<WorkoutSet>) => void
  onEditSet: (setIndex: number) => void
  onUnlog: (setIndex: number) => void
  onRemoveSet: (setIndex: number) => void
  onAddSet: () => void
  onNotes: (text: string) => void
  onToggleDone: (setIndex: number, override?: Partial<WorkoutSet>, mode?: 'toggle' | 'done') => void
}) {
  const complete = ex.sets.length > 0 && ex.sets.every((s) => s.done)
  const aim = !timed ? aimLabel(ex.sets) : null
  const doneTimed = ex.sets.filter((s) => s.done && !s.warmup)
  const totalSec = doneTimed.reduce((n, s) => n + (s.durationSec ?? 0), 0)
  const totalKm = doneTimed.reduce((n, s) => n + (s.distanceKm ?? 0), 0)
  const exKey = keyOf(ex, ex.exerciseId)
  const lastSet = ex.sets[ex.sets.length - 1]

  const lastText = last
    ? last.sets
        .slice(0, 3)
        .map((s) =>
          timed
            ? `${fmtDuration(s.durationSec ?? 0)}${s.distanceKm ? ` · ${fmtDistance(s.distanceKm, unit)}` : ''}`
            : ex.tracksWeight
              ? `${fmtWeight(s.weightKg, unit, false)}×${s.reps}`
              : `${s.reps}`
        )
        .join(timed ? ', ' : ' · ')
    : null

  return (
    <section
      data-focus-card
      aria-label={`${ex.name}, current exercise`}
      className={`card scroll-mt-28 p-3 transition-colors duration-300 ${superset ? 'border-l-4' : ''} ${
        complete ? '!border-go-500/50' : ''
      }`}
      style={superset?.color ? { borderLeftColor: superset.color } : undefined}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-2 font-display text-3xl font-semibold leading-tight">{ex.name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge color={MUSCLE_COLORS[ex.muscle]}>{ex.muscle}</Badge>
            {superset ? <Badge color={superset.color ?? '#a78bfa'}>Superset</Badge> : null}
          </div>
        </div>
        <IconButton icon="more" label={`${ex.name} options`} onClick={onMenu} className="-mr-1 -mt-1" />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {timed && (ex.targetDurationSec || totalSec > 0) ? (
          <span className={`${INFO_CHIP} tabular !text-brand-400`}>
            <Icon name="target" size={14} />
            {ex.targetDurationSec ? `Aim ${fmtTargetDuration(ex.targetDurationSec)}` : ''}
            {ex.targetDurationSec && totalSec > 0 ? ' · ' : ''}
            {totalSec > 0 ? `So far ${fmtDuration(totalSec)}${totalKm > 0 ? ` · ${fmtDistance(totalKm, unit)}` : ''}` : ''}
          </span>
        ) : null}
        {aim ? (
          <span className={`${INFO_CHIP} tabular !text-brand-400`}>
            <Icon name="target" size={14} />
            {aim}
            {ex.restSec && showPlanRest ? ` · Rest ${fmtClock(ex.restSec)}` : ''}
          </span>
        ) : null}
        {lastText ? (
          <span className={`${INFO_CHIP} tabular`}>
            <Icon name="clock" size={14} />
            Last: {lastText}
          </span>
        ) : (
          <span className={INFO_CHIP}>New for you, start light</span>
        )}
      </div>

      {overload ? (
        <p className="mt-2 flex items-center gap-2 rounded-xl bg-[var(--color-xp-400)]/15 px-3 py-2 text-sm font-bold text-[var(--color-xp-500)]">
          <Icon name="trending" size={16} className="shrink-0" />
          Level up! You topped your range last time. Try +{step(unit)} {unit}.
        </p>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-1.5">
        <ExerciseGuide exerciseId={ex.exerciseId} name={ex.name} chipClass={CHIP} />
        <ExerciseNotes exerciseId={ex.exerciseId} name={ex.name} chipClass={CHIP} />
      </div>

      <ul className="mt-3 flex flex-col gap-1.5">
        {ex.sets.map((set, i) => {
          const key = keyOf(set, `${i}`)
          if (timed) {
            return (
              <TimedSetRow
                key={key}
                index={i}
                set={set}
                cardioFields={ex.cardioFields}
                placeholders={timedPlaceholders(ex, i, lastFull)}
                onChange={(p) => onSetChange(i, p)}
                onStop={(durationSec) => onToggleDone(i, { durationSec, timerStartedAt: undefined }, 'done')}
                onToggleDone={() => onToggleDone(i)}
                onAutoDone={() => onToggleDone(i, undefined, 'done')}
                onRemove={() => onRemoveSet(i)}
              />
            )
          }
          if (i === panelIndex) {
            return (
              <CurrentSetPanel
                key={key}
                index={i}
                set={set}
                unit={unit}
                tracksWeight={ex.tracksWeight}
                dumbbell={dumbbell}
                values={shownValues(ex, i, last?.sets)}
                editing={editing}
                repsRef={repsRef}
                onChange={(p) => onSetChange(i, p)}
                onUnlog={() => onUnlog(i)}
                onRemove={() => onRemoveSet(i)}
              />
            )
          }
          const label = set.warmup ? 'W' : String(i + 1)
          if (set.done) {
            const xp = setXp(set)
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => onEditSet(i)}
                  aria-label={`Edit set ${i + 1}`}
                  className="flex min-h-11 w-full items-center gap-2.5 rounded-xl border border-go-500/30 bg-go-500/10 px-2.5 text-left"
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-go-500 text-ink-950">
                    <Icon name="check" size={16} />
                  </span>
                  <span className="tabular w-7 shrink-0 text-sm font-bold text-[var(--color-fg-muted)]">{label}</span>
                  <span className="tabular min-w-0 flex-1 truncate font-semibold">
                    {ex.tracksWeight
                      ? `${fmtWeight(set.weightKg, unit)} × ${set.reps}`
                      : `${set.weightKg > 0 ? `+${fmtWeight(set.weightKg, unit)} · ` : ''}${set.reps} reps`}
                  </span>
                  {set.rpe ? <span className="tabular text-sm font-bold text-violet-300">@{set.rpe}</span> : null}
                  <span className="tabular shrink-0 text-sm font-bold text-[var(--color-xp-500)]">+{xp}</span>
                </button>
              </li>
            )
          }
          // Upcoming: faint line showing what it will pre-fill with.
          const v = shownValues(ex, i, last?.sets)
          const planned = set.targetReps && !/^\d+$/.test(set.targetReps) ? set.targetReps : null
          return (
            <li
              key={key}
              className="flex min-h-11 items-center gap-2.5 rounded-xl border border-dashed border-[var(--color-line)] px-2.5 text-[var(--color-fg-muted)] opacity-80"
            >
              <span className="size-7 shrink-0 rounded-full border-2 border-[var(--color-line)]" aria-hidden="true" />
              <span className="tabular w-7 shrink-0 text-sm font-bold">{label}</span>
              <span className="tabular min-w-0 flex-1 truncate italic">
                {v.reps > 0
                  ? `${ex.tracksWeight && v.weightKg > 0 ? `${fmtWeight(v.weightKg, unit)} × ` : ''}${v.reps}`
                  : (planned ?? 'Set your reps')}
              </span>
            </li>
          )
        })}
      </ul>

      {ex.notes !== undefined ? (
        <>
          <label htmlFor={`notes-${exKey}`} className="mt-3 block text-sm font-semibold">
            Notes for {ex.name}
          </label>
          <textarea
            id={`notes-${exKey}`}
            rows={2}
            value={ex.notes}
            onChange={(e) => onNotes(e.target.value)}
            placeholder="Seat height, how it felt…"
            className="mt-1 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] p-2.5 text-base outline-none placeholder:text-[var(--color-fg-muted)] focus:border-brand-500"
          />
        </>
      ) : null}

      {complete ? (
        <p className="animate-pop mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-go-500/15 py-2.5 text-sm font-bold text-go-400">
          <Icon name="check" size={16} /> Exercise complete! +{XP_RULES.exercise} XP
        </p>
      ) : null}

      <button
        type="button"
        onClick={onAddSet}
        className={
          timed && lastSet?.done
            ? 'mt-3 flex min-h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-brand-500 text-sm font-bold text-ink-950 transition-colors duration-200 hover:bg-brand-400'
            : 'mt-3 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--color-line)] text-sm font-semibold text-[var(--color-fg-muted)] transition-colors duration-200 hover:border-brand-500 hover:text-brand-400'
        }
      >
        <Icon name="plus" size={16} />
        {timed && lastSet?.done ? 'Add another set' : 'Add set'}
      </button>
    </section>
  )
}
