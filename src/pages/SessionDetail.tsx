import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import {
  Badge,
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  IconButton,
  Spinner,
} from '../components/ui'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import { useWorkouts } from '../hooks/useWorkouts'
import { useActiveWorkout } from '../hooks/useActiveWorkout'
import { MUSCLE_COLORS } from '../data/exercises'
import { fmtDateLong, fmtDuration, fmtTime } from '../lib/date'
import { fmtVolume, fmtWeight } from '../lib/units'
import { bestSetOf, estimate1rm, personalRecords } from '../lib/stats'

export function SessionDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const { profile } = useSettings()
  const unit = profile.unit
  const { workouts, loading, deleteWorkout } = useWorkouts()
  const { save: saveActive, active } = useActiveWorkout()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const workout = workouts.find((w) => w.id === id)

  /** Exercise ids where this session set the all-time best. */
  const prIds = useMemo(() => {
    const records = personalRecords(workouts)
    return new Set(
      records.filter((r) => workout && r.date === workout.startedAt).map((r) => r.exerciseId)
    )
  }, [workouts, workout])

  if (loading) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center text-[var(--color-fg-muted)]">
        <Spinner size={28} />
      </div>
    )
  }

  if (!workout) {
    return (
      <div className="animate-rise">
        <EmptyState
          icon="history"
          title="Workout not found"
          message="This session may have been deleted from another device."
          action={
            <Button variant="secondary" onClick={() => navigate('/history')}>
              Back to history
            </Button>
          }
        />
      </div>
    )
  }

  function repeatWorkout() {
    if (active) {
      toast('Finish or discard your current workout first.', 'error')
      return
    }
    saveActive({
      name: workout!.name,
      startedAt: new Date().toISOString(),
      exercises: workout!.exercises.map((ex) => ({
        ...ex,
        // Same loads, cleared checkmarks — the point is to beat last time.
        sets: ex.sets.map((s) => ({ ...s, done: false })),
      })),
    })
    navigate('/workout')
  }

  async function remove() {
    try {
      await deleteWorkout(workout!.id)
      toast('Workout deleted.', 'info')
      navigate('/history', { replace: true })
    } catch {
      toast('Could not delete that workout.', 'error')
    }
  }

  return (
    <div className="animate-rise flex flex-col gap-5">
      <header className="flex items-start gap-2">
        <IconButton icon="chevron-left" label="Back" onClick={() => navigate(-1)} className="-ml-2" />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-semibold tracking-wide">{workout.name}</h1>
          <p className="text-sm text-[var(--color-fg-muted)]">
            {fmtDateLong(workout.startedAt)} · {fmtTime(workout.startedAt)}
          </p>
        </div>
        <IconButton
          icon="trash"
          label="Delete workout"
          onClick={() => setConfirmDelete(true)}
          className="text-rose-400 hover:bg-rose-500/15"
        />
      </header>

      <dl className="grid grid-cols-3 gap-3">
        {[
          { label: 'Duration', value: fmtDuration(workout.durationSec), icon: 'clock' as const },
          { label: 'Volume', value: fmtVolume(workout.totalVolumeKg, unit), icon: 'layers' as const },
          { label: 'Sets', value: String(workout.setCount), icon: 'check' as const },
        ].map((item) => (
          <Card key={item.label} className="p-3 text-center">
            <dt className="flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">
              <Icon name={item.icon} size={12} />
              {item.label}
            </dt>
            <dd className="tabular mt-1 font-display text-xl font-semibold">{item.value}</dd>
          </Card>
        ))}
      </dl>

      <Button variant="secondary" size="lg" full icon="rotate" onClick={repeatWorkout}>
        Repeat this workout
      </Button>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Exercises</h2>
        <ul className="flex flex-col gap-3">
          {workout.exercises.map((ex, i) => {
            const best = bestSetOf(ex)
            const isPr = prIds.has(ex.exerciseId)
            return (
              <Card as="li" key={`${ex.exerciseId}-${i}`} className="p-3.5">
                <div className="mb-2.5 flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold">{ex.name}</h3>
                  <Badge color={MUSCLE_COLORS[ex.muscle]}>{ex.muscle}</Badge>
                  {isPr ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-400">
                      <Icon name="trophy" size={11} />
                      PR
                    </span>
                  ) : null}
                </div>

                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">
                      <th scope="col" className="w-10 pb-1 text-left">
                        Set
                      </th>
                      {ex.tracksWeight ? (
                        <th scope="col" className="pb-1 text-right">
                          Weight
                        </th>
                      ) : null}
                      <th scope="col" className="pb-1 text-right">
                        Reps
                      </th>
                      {ex.tracksWeight ? (
                        <th scope="col" className="pb-1 text-right">
                          Volume
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody className="tabular">
                    {ex.sets.map((set, j) => (
                      <tr key={j} className="border-t border-[var(--color-line)]/60">
                        <th scope="row" className="py-1.5 text-left font-semibold text-[var(--color-fg-muted)]">
                          {set.warmup ? 'W' : j + 1}
                        </th>
                        {ex.tracksWeight ? (
                          <td className="py-1.5 text-right font-medium">
                            {fmtWeight(set.weightKg, unit, false)}
                            <span className="ml-0.5 text-xs text-[var(--color-fg-muted)]">{unit}</span>
                          </td>
                        ) : null}
                        <td className="py-1.5 text-right font-medium">{set.reps}</td>
                        {ex.tracksWeight ? (
                          <td className="py-1.5 text-right text-[var(--color-fg-muted)]">
                            {set.warmup ? '—' : fmtWeight(set.weightKg * set.reps, unit, false)}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>

                {best && ex.tracksWeight ? (
                  <p className="tabular mt-2 text-xs text-[var(--color-fg-muted)]">
                    Best set {fmtWeight(best.weightKg, unit)} × {best.reps} · est. 1RM{' '}
                    <span className="font-semibold text-brand-400">
                      {fmtWeight(estimate1rm(best.weightKg, best.reps), unit)}
                    </span>
                  </p>
                ) : null}

                {ex.notes ? (
                  <p className="mt-2 whitespace-pre-wrap text-xs text-[var(--color-fg-muted)]">{ex.notes}</p>
                ) : null}
              </Card>
            )
          })}
        </ul>
      </section>

      {workout.notes ? (
        <section>
          <h2 className="mb-2 text-lg font-semibold">Notes</h2>
          <Card>
            <p className="whitespace-pre-wrap text-sm text-[var(--color-fg-muted)]">{workout.notes}</p>
          </Card>
        </section>
      ) : null}

      <ConfirmSheet
        open={confirmDelete}
        title="Delete this workout?"
        message={`“${workout.name}” and all of its sets will be permanently removed.`}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={remove}
      />
    </div>
  )
}
