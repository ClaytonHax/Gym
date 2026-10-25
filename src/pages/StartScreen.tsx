import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { ExercisePicker } from '../components/ExercisePicker'
import { RoutineBuilder } from '../components/RoutineBuilder'
import { StarterPlans } from '../components/plans'
import { Button, IconButton, Sheet, Skeleton } from '../components/ui'
import { useToast } from '../contexts/ToastContext'
import { useRoutines } from '../hooks/useRoutines'
import { usePlans } from '../hooks/usePlans'
import { MUSCLE_COLORS } from '../data/exercises'
import { planToExercises } from '../data/programs'
import { toWorkoutExercise, withCardioFields, attachCardioFields } from '../lib/workoutExercise'
import { fmtDuration } from '../lib/date'
import { estimateMinutes, exerciseTargetLabel, scheduleFor, setCountOf, startPlanDay } from '../lib/plans'
import type { ActiveWorkout, PlanExercise, Routine, WorkoutExercise } from '../types'

function defaultName(): string {
  const h = new Date().getHours()
  return `${h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening'} Workout`
}

function PlanCard({
  title,
  subtitle,
  plan,
  highlight,
  onStart,
  actions,
}: {
  title: string
  subtitle: string
  plan: PlanExercise[]
  highlight?: boolean
  onStart: () => void
  actions?: React.ReactNode
}) {
  const sets = setCountOf(plan)
  return (
    <li className={`card overflow-hidden ${highlight ? 'border-brand-500/60' : ''}`}>
      <div className="flex items-start gap-2 p-4 pb-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-2xl font-semibold">{title}</h3>
          <p className="text-xs text-[var(--color-fg-muted)]">{subtitle}</p>
        </div>
        {actions}
      </div>
      <ul className="flex flex-col gap-1 px-4 pb-3 text-sm">
        {plan.slice(0, 5).map((e, i) => (
          <li key={`${e.exerciseId}-${i}`} className="flex items-center gap-2">
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: MUSCLE_COLORS[e.muscle] }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate">{e.name}</span>
            <span className="tabular shrink-0 text-xs text-[var(--color-fg-muted)]">
              {exerciseTargetLabel(e)}
            </span>
          </li>
        ))}
        {plan.length > 5 ? (
          <li className="pl-3.5 text-xs text-[var(--color-fg-muted)]">+{plan.length - 5} more</li>
        ) : null}
      </ul>
      <div className="flex items-center gap-3 border-t border-[var(--color-line)] bg-[var(--color-surface-2)]/50 p-3">
        <p className="tabular flex-1 text-xs text-[var(--color-fg-muted)]">
          {plan.length} exercises · {sets} sets · ~{fmtDuration(estimateMinutes(plan) * 60)}
        </p>
        <Button variant="go" size="sm" icon="play" onClick={onStart}>
          Start
        </Button>
      </div>
    </li>
  )
}

/** The Train tab when nothing is in progress: pick a program, a routine, or go freestyle. */
export function StartScreen({ onStart }: { onStart: (workout: ActiveWorkout) => void }) {
  const toast = useToast()
  const { activePlan, activeState, today, loading: plansLoading } = usePlans()
  const { routines, deleteRoutine } = useRoutines()
  const [anywayOpen, setAnywayOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [editing, setEditing] = useState<Routine | null>(null)

  const todayDay = today?.day ?? null
  const isWorkoutToday = Boolean(today && todayDay && !today.isRest && todayDay.kind === 'workout')
  const workoutDays = activePlan
    ? activePlan.days.flatMap((day, index) => (day.kind === 'workout' ? [{ day, index }] : []))
    : []

  /** Start any day of the active plan, tagged with its place in the cycle. */
  function startPlanned(index: number) {
    if (!activePlan || !activeState) return
    const slot = scheduleFor(activePlan, activeState, today?.date ?? new Date())
    onStart(
      withCardioFields(
        startPlanDay(activePlan, { ...slot, day: activePlan.days[index], dayIndex: index, isRest: false }),
        activePlan.days[index].exercises
      )
    )
  }

  function start(name: string, exercises: WorkoutExercise[]) {
    onStart({ name, startedAt: new Date().toISOString(), exercises })
  }

  return (
    <div className="animate-rise flex flex-col gap-6">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-wide">Train</h1>
        <p className="mt-0.5 text-sm text-[var(--color-fg-muted)]">
          Follow today’s plan, run your own routine, or start from scratch.
        </p>
      </header>

      <section aria-label="Today">
        {plansLoading ? (
          <Skeleton className="h-[76px]" />
        ) : !activePlan || !today ? (
          <div className="flex flex-col gap-3">
            <StarterPlans />
            <Link to="/plans/library" className="card-accent flex min-h-14 items-center gap-3 p-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-brand-400">
                <Icon name="layers" size={22} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-xl font-semibold">Follow a training plan</span>
                <span className="block text-sm text-[var(--color-fg-muted)]">
                  Browse plans or build your own, with a schedule that runs itself.
                </span>
              </span>
              <Icon name="chevron-right" size={20} className="shrink-0 text-[var(--color-fg-muted)]" />
            </Link>
          </div>
        ) : isWorkoutToday && todayDay ? (
          <div className="card-accent overflow-hidden">
            <div className="p-4 pb-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-400">
                Today · Day {today.dayNumber} of {today.cycleLength}{today.cycle > 1 ? ` · Round ${today.cycle}` : ''}
              </p>
              <h2 className="num-display mt-1 text-4xl">{todayDay.name}</h2>
              {todayDay.focus ? (
                <p className="text-sm text-[var(--color-fg-muted)]">{todayDay.focus}</p>
              ) : null}
            </div>
            <ul className="flex flex-col gap-1 px-4 pb-3 text-sm">
              {todayDay.exercises.slice(0, 5).map((e, i) => (
                <li key={`${e.exerciseId}-${i}`} className="flex items-center gap-2">
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: MUSCLE_COLORS[e.muscle] }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">{e.name}</span>
                  <span className="tabular shrink-0 text-xs text-[var(--color-fg-muted)]">
                    {exerciseTargetLabel(e)}
                  </span>
                </li>
              ))}
              {todayDay.exercises.length > 5 ? (
                <li className="pl-3.5 text-xs text-[var(--color-fg-muted)]">
                  +{todayDay.exercises.length - 5} more
                </li>
              ) : null}
            </ul>
            <div className="flex items-center gap-3 border-t border-[var(--color-line)] bg-[var(--color-surface-2)]/50 p-3">
              <p className="tabular flex-1 text-xs text-[var(--color-fg-muted)]">
                {todayDay.exercises.length} exercises · {setCountOf(todayDay.exercises)} sets · ~
                {fmtDuration(estimateMinutes(todayDay.exercises) * 60)}
              </p>
              <Button
                variant="go"
                size="md"
                icon="play"
                onClick={() => onStart(withCardioFields(startPlanDay(activePlan, today), todayDay.exercises))}
              >
                Start
              </Button>
            </div>
          </div>
        ) : (
          <div className="card-accent flex flex-col gap-3 p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-rest/15 text-rest">
                <Icon name="moon" size={24} />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-rest">
                  Rest day · Day {today.dayNumber} of {today.cycleLength}
                </p>
                <h2 className="num-display text-3xl">Recover today</h2>
              </div>
            </div>
            <p className="text-sm text-[var(--color-fg-muted)]">
              {today.adjusted
                ? 'You moved today\u2019s workout. Rest up, or train anyway.'
                : 'Your plan has a rest day here. Muscles grow while you recover.'}
            </p>
            <Button variant="secondary" full onClick={() => setAnywayOpen(true)}>
              Train anyway
            </Button>
          </div>
        )}
      </section>

      <section aria-label="My routines">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">My routines</h2>
          <Button
            variant="secondary"
            size="sm"
            icon="plus"
            onClick={() => {
              setEditing(null)
              setBuilderOpen(true)
            }}
          >
            New
          </Button>
        </div>
        {routines.length === 0 ? (
          <p className="card p-4 text-sm text-[var(--color-fg-muted)]">
            Build your own with “New”, or choose “Save this workout to reuse later” when you finish a session.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {routines.map((r) => (
              <PlanCard
                key={r.id}
                title={r.name}
                subtitle={`${r.exercises.length} exercises`}
                plan={r.exercises.map((e) => ({
                  ...e,
                  targets: e.targets ?? Array.from({ length: e.sets ?? 3 }, () => ''),
                }))}
                onStart={() => start(r.name, attachCardioFields(planToExercises(r.exercises), r.exercises))}
                actions={
                  <div className="-mr-2 -mt-1 flex">
                    <IconButton
                      icon="note"
                      label={`Edit routine ${r.name}`}
                      onClick={() => {
                        setEditing(r)
                        setBuilderOpen(true)
                      }}
                    />
                    <IconButton
                      icon="trash"
                      label={`Delete routine ${r.name}`}
                      onClick={() => void deleteRoutine(r.id).then(() => toast('Routine deleted.', 'info'))}
                      className="hover:bg-rose-500/15 hover:text-rose-400"
                    />
                  </div>
                }
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Freestyle" className="flex flex-col gap-3">
        <Button size="lg" variant="secondary" full icon="dumbbell" onClick={() => start(defaultName(), [])}>
          Start empty workout
        </Button>
        <Button variant="secondary" size="lg" full icon="search" onClick={() => setPickerOpen(true)}>
          Choose exercises
        </Button>
      </section>

      <Sheet open={anywayOpen} onClose={() => setAnywayOpen(false)} title="Train anyway">
        <ul className="flex flex-col gap-2">
          {workoutDays.map(({ day, index }) => (
            <li key={day.id}>
              <button
                type="button"
                onClick={() => {
                  setAnywayOpen(false)
                  startPlanned(index)
                }}
                className="card flex min-h-14 w-full items-center gap-3 p-3 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{day.name}</span>
                  <span className="tabular block text-xs text-[var(--color-fg-muted)]">
                    {day.exercises.length} exercises · {setCountOf(day.exercises)} sets
                  </span>
                </span>
                <Icon name="play" size={18} className="shrink-0 text-go-400" />
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(picked) => start(defaultName(), picked.map(toWorkoutExercise))}
      />
      <RoutineBuilder open={builderOpen} onClose={() => setBuilderOpen(false)} routine={editing} />
    </div>
  )
}
