import { Badge, Sheet } from './ui'
import { MUSCLE_COLORS } from '../data/exercises'
import { useUnit } from '../contexts/SettingsContext'
import { fmtClock, fmtDuration } from '../lib/date'
import { fmtCardioSet } from '../lib/stats'
import { isTimed } from '../lib/logMode'
import { fmtDistance, fmtVolume, fmtWeight } from '../lib/units'
import type { SharedExercise, SharedWorkout } from '../lib/sharing'
import type { WorkoutSet } from '../types'

function ExerciseBlock({ ex }: { ex: SharedExercise }) {
  const unit = useUnit()
  const timed = isTimed(ex)
  let n = 0
  return (
    <section className="card p-4" aria-label={ex.name}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-base font-semibold normal-case tracking-normal" style={{ fontFamily: 'var(--font-sans)' }}>
          {ex.name}
        </h3>
        <Badge color={MUSCLE_COLORS[ex.muscle]} className="shrink-0">
          {ex.muscle}
        </Badge>
      </div>
      <table className="tabular mt-3 w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">
            <th className="w-12 pb-1 font-bold">Set</th>
            {timed ? (
              <th className="pb-1 font-bold">Effort</th>
            ) : (
              <>
                <th className="pb-1 font-bold">{ex.tracksWeight ? 'Weight' : ''}</th>
                <th className="pb-1 text-right font-bold">Reps</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {ex.sets.map((s, i) => {
            if (!s.warmup) n++
            return (
              <tr key={i} className="border-t border-[var(--color-line)]">
                <td className="py-1.5 font-semibold text-[var(--color-fg-muted)]">{s.warmup ? 'W' : n}</td>
                {timed ? (
                  <td className="py-1.5">
                    {fmtCardioSet({ ...s, done: true } as WorkoutSet, unit, { clock: fmtClock, distance: fmtDistance })}
                    {s.rpe ? <span className="text-[var(--color-fg-muted)]"> · RPE {s.rpe}</span> : null}
                  </td>
                ) : (
                  <>
                    <td className="py-1.5 font-semibold">
                      {ex.tracksWeight ? fmtWeight(s.weightKg, unit) : ''}
                      {s.rpe ? <span className="font-normal text-[var(--color-fg-muted)]"> · RPE {s.rpe}</span> : null}
                    </td>
                    <td className="py-1.5 text-right font-semibold">{s.reps}</td>
                  </>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

/** A friend's full workout, shown only while they keep sharing it. */
export function SharedWorkoutSheet({
  workout,
  onClose,
}: {
  workout: SharedWorkout | null
  onClose: () => void
}) {
  const unit = useUnit()
  // `workout` goes null when the friend stops sharing it, which closes the sheet.
  const date = workout ? new Date(workout.startedAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : ''
  return (
    <Sheet open={!!workout} onClose={onClose} title={workout?.name ?? 'Workout'} size="full">
      {workout ? (
        <div className="flex flex-col gap-3 pb-4">
          <p className="text-sm text-[var(--color-fg-muted)]">
            {date}
            {workout.planDayName ? ` · ${workout.planDayName}` : ''}
          </p>
          <dl className="tabular grid grid-cols-3 gap-2 rounded-xl bg-[var(--color-surface-2)] p-2.5 text-center">
            {[
              { label: 'Time', value: fmtDuration(workout.durationSec).replace(/ \d+s$/, '') },
              { label: 'Sets', value: String(workout.setCount) },
              { label: 'Volume', value: fmtVolume(workout.totalVolumeKg, unit) },
            ].map((s) => (
              <div key={s.label} className="min-w-0">
                <dt className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">{s.label}</dt>
                <dd className="truncate font-display text-lg font-bold leading-tight">{s.value}</dd>
              </div>
            ))}
          </dl>
          {workout.exercises.map((ex, i) => (
            <ExerciseBlock key={`${ex.exerciseId}-${i}`} ex={ex} />
          ))}
        </div>
      ) : null}
    </Sheet>
  )
}
