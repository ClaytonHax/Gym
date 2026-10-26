import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { ExercisePicker } from '../components/ExercisePicker'
import { RoutineBuilder } from '../components/RoutineBuilder'
import { StarterPlans } from '../components/plans'
import { ConfirmSheet, IconButton, Sheet, Skeleton } from '../components/ui'
import { TrainStatusBar } from '../components/train/TrainStatusBar'
import { PlanPath, type NodeState } from '../components/train/PlanPath'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import { useRoutines } from '../hooks/useRoutines'
import { useWorkouts } from '../hooks/useWorkouts'
import { usePlans } from '../hooks/usePlans'
import { useXp } from '../hooks/useXp'
import { MUSCLE_COLORS } from '../data/exercises'
import { planToExercises } from '../data/programs'
import { toWorkoutExercise, withCardioFields, attachCardioFields } from '../lib/workoutExercise'
import { dayKey, fmtDuration } from '../lib/date'
import { nextWorkoutLabel, nextWorkoutSlot } from '../lib/planUiLogic'
import { estimateMinutes, exerciseTargetLabel, scheduleFor, setCountOf, startPlanDay } from '../lib/plans'
import { computeStreaks } from '../lib/streaks'
import { dailyQuests, todayQuestStats } from '../lib/quests'
import { XP_RULES } from '../lib/xp'
import type { ActiveWorkout, PlanExercise, Routine, WorkoutExercise } from '../types'

function defaultName(): string {
  const h = new Date().getHours()
  return `${h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening'} Workout`
}

/** Sets, minutes and a rough XP estimate (sets + exercise bonuses + finish) for a day. */
function dayMeta(exercises: PlanExercise[]) {
  const sets = setCountOf(exercises)
  return {
    sets,
    minutes: estimateMinutes(exercises),
    xp: sets * XP_RULES.set + exercises.length * XP_RULES.exercise + XP_RULES.finish,
  }
}

function metaLine(exercises: PlanExercise[]): string {
  const m = dayMeta(exercises)
  return `${exercises.length} exercises · ${m.sets} sets · ~${fmtDuration(m.minutes * 60)} · ~+${m.xp} XP`
}

/** Small dots, one per distinct muscle, for a compact "what's in this" row. */
function MuscleDots({ exercises }: { exercises: PlanExercise[] }) {
  const muscles = [...new Set(exercises.map((e) => e.muscle))].slice(0, 6)
  return (
    <span className="flex gap-1" aria-hidden>
      {muscles.map((m) => (
        <span key={m} className="size-2.5 rounded-full" style={{ backgroundColor: MUSCLE_COLORS[m] }} />
      ))}
    </span>
  )
}

function MuscleChips({ exercises }: { exercises: PlanExercise[] }) {
  const muscles = [...new Set(exercises.map((e) => e.muscle))]
  const shown = muscles.slice(0, 6)
  return (
    <ul className="flex flex-wrap gap-1.5">
      {shown.map((m) => (
        <li
          key={m}
          className="flex items-center gap-1.5 rounded-full bg-[var(--color-surface-2)] px-2.5 py-1 text-xs font-bold"
        >
          <span className="size-2 rounded-full" style={{ backgroundColor: MUSCLE_COLORS[m] }} aria-hidden />
          {m}
        </li>
      ))}
      {muscles.length > shown.length ? (
        <li className="rounded-full bg-[var(--color-surface-2)] px-2.5 py-1 text-xs font-bold text-[var(--color-fg-muted)]">
          +{muscles.length - shown.length}
        </li>
      ) : null}
    </ul>
  )
}

function ExerciseLines({ exercises }: { exercises: PlanExercise[] }) {
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {exercises.map((e, i) => (
        <li key={`${e.exerciseId}-${i}`} className="flex items-center gap-2">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: MUSCLE_COLORS[e.muscle] }}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate">{e.name}</span>
          <span className="tabular shrink-0 text-xs text-[var(--color-fg-muted)]">{exerciseTargetLabel(e)}</span>
        </li>
      ))}
    </ul>
  )
}

/** The Train tab when nothing is in progress: today's lesson, the plan path, routines, freestyle. */
export function StartScreen({ onStart }: { onStart: (workout: ActiveWorkout) => void }) {
  const toast = useToast()
  const { profile } = useSettings()
  const { activePlan, activeState, today, upcoming, isRestDay, loading: plansLoading } = usePlans()
  const { workouts } = useWorkouts()
  const { routines, deleteRoutine } = useRoutines()
  const xp = useXp()
  const [anywayOpen, setAnywayOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [editing, setEditing] = useState<Routine | null>(null)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [restOpen, setRestOpen] = useState(false)
  const [menuRoutine, setMenuRoutine] = useState<Routine | null>(null)
  const [deleting, setDeleting] = useState<Routine | null>(null)

  const todayDay = today?.day ?? null
  const isWorkoutToday = Boolean(today && todayDay && !today.isRest && todayDay.kind === 'workout')
  // Already trained today: say so and point at the next one, but still allow a repeat.
  const todayDone = workouts.some((w) => dayKey(new Date(w.startedAt)) === dayKey())
  const nextSlot = todayDone ? nextWorkoutSlot(upcoming(9), true) : undefined
  const workoutDays = activePlan
    ? activePlan.days.flatMap((day, index) => (day.kind === 'workout' ? [{ day, index }] : []))
    : []

  // Same inputs as the Dashboard so the flame matches everywhere.
  const streak = useMemo(
    () =>
      computeStreaks(workouts, {
        isRestDay,
        planStartDate: activeState?.startDate,
        weeklyGoal: profile.weeklyGoal,
      }),
    [workouts, isRestDay, activeState?.startDate, profile.weeklyGoal]
  )
  const quests = useMemo(
    () => dailyQuests(dayKey(), todayQuestStats(workouts, xp.byWorkout, xp.prsByWorkout)),
    [workouts, xp.byWorkout, xp.prsByWorkout]
  )

  // Per-node state for the current round of the plan.
  const nodeStates = useMemo<NodeState[]>(() => {
    if (!activePlan || !today) return []
    return activePlan.days.map((day, i) => {
      const done =
        today.cycle > 0 &&
        workouts.some(
          (w) => w.planId === activePlan.id && w.planCycle === today.cycle && w.planDayIndex === i
        )
      if (done) return 'done'
      if (today.dayIndex === i && !today.isRest) return 'today'
      return day.kind === 'rest' ? 'rest' : 'upcoming'
    })
  }, [activePlan, today, workouts])

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

  function selectNode(index: number) {
    if (!activePlan) return
    if (activePlan.days[index].kind === 'rest') setRestOpen(true)
    else setPreviewIndex(index)
  }

  const preview = previewIndex !== null && activePlan ? activePlan.days[previewIndex] : null

  return (
    <div className="animate-rise flex flex-col gap-6">
      <TrainStatusBar streak={streak} level={xp.level} quests={quests} />

      <section aria-label="Today">
        {plansLoading ? (
          <Skeleton className="h-[220px]" />
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
          <div className="card-accent flex flex-col gap-3 rounded-3xl p-5">
            <p
              className={`flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-[0.14em] ${
                todayDone ? 'text-go-400' : 'text-brand-400'
              }`}
            >
              {todayDone ? <Icon name="check-circle" size={16} /> : null}
              {todayDone ? 'Done today' : 'Today'} · Day {today.dayNumber} of {today.cycleLength}
              {today.cycle > 1 ? ` · Round ${today.cycle}` : ''}
            </p>
            <div>
              <h2 className="num-display text-4xl">{todayDay.name}</h2>
              {todayDay.focus ? (
                <p className="text-sm text-[var(--color-fg-muted)]">{todayDay.focus}</p>
              ) : null}
            </div>
            {todayDone && nextSlot ? (
              <p className="text-sm font-semibold text-go-400">Next: {nextWorkoutLabel(nextSlot)}</p>
            ) : null}
            <MuscleChips exercises={todayDay.exercises} />
            <p className="tabular text-xs font-semibold text-[var(--color-fg-muted)]">
              {metaLine(todayDay.exercises)}
            </p>
            <button
              type="button"
              onClick={() => onStart(withCardioFields(startPlanDay(activePlan, today), todayDay.exercises))}
              className={`btn-3d mt-1 w-full min-h-14 text-lg ${todayDone ? 'btn-3d-neutral' : 'btn-3d-go'}`}
            >
              <Icon name={todayDone ? 'rotate' : 'play'} size={20} />
              {todayDone ? 'Do it again' : 'Start'}
            </button>
          </div>
        ) : (
          <div className="card-accent flex flex-col gap-3 rounded-3xl p-5">
            <div className="flex items-center gap-3">
              <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-rest/15 text-rest">
                <Icon name="moon" size={28} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-rest">
                  Rest day · Day {today.dayNumber} of {today.cycleLength}
                </p>
                <h2 className="num-display text-3xl">Recover today</h2>
              </div>
            </div>
            <p className="text-sm text-[var(--color-fg-muted)]">
              {today.adjusted
                ? 'You moved today’s workout. Rest up, or train anyway.'
                : 'Your plan has a rest day here. Muscles grow while you recover.'}
            </p>
            <button
              type="button"
              onClick={() => setAnywayOpen(true)}
              className="btn-3d btn-3d-neutral mt-1 w-full min-h-14"
            >
              Train anyway
            </button>
          </div>
        )}
      </section>

      {activePlan && today ? (
        <section aria-label="Your plan">
          <h2 className="mb-2 text-lg font-semibold">
            Your plan · Round {Math.max(1, today.cycle)}
          </h2>
          <PlanPath days={activePlan.days} states={nodeStates} onSelect={selectNode} />
        </section>
      ) : null}

      <section aria-label="Quick start" className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => start(defaultName(), [])}
          className="btn-3d btn-3d-neutral min-h-24 flex-col gap-1.5 text-base"
        >
          <Icon name="dumbbell" size={26} />
          Empty workout
        </button>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="btn-3d btn-3d-neutral min-h-24 flex-col gap-1.5 text-base"
        >
          <Icon name="search" size={26} />
          Pick exercises
        </button>
      </section>

      <section aria-label="My routines">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">My routines</h2>
          <button
            type="button"
            onClick={() => {
              setEditing(null)
              setBuilderOpen(true)
            }}
            className="btn-3d btn-3d-neutral min-h-11 rounded-xl px-3 text-sm"
          >
            <Icon name="plus" size={16} />
            New
          </button>
        </div>
        {routines.length === 0 ? (
          <p className="card p-4 text-sm text-[var(--color-fg-muted)]">
            Build your own with “New”, or choose “Save this workout to reuse later” when you finish a session.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {routines.map((r) => {
              const plan: PlanExercise[] = r.exercises.map((e) => ({
                ...e,
                targets: e.targets ?? Array.from({ length: e.sets ?? 3 }, () => ''),
              }))
              return (
                <li key={r.id} className="card flex items-center gap-3 p-3 pl-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-display text-xl font-semibold">{r.name}</h3>
                    <p className="tabular text-xs text-[var(--color-fg-muted)]">
                      {plan.length} exercises · {setCountOf(plan)} sets · ~
                      {fmtDuration(estimateMinutes(plan) * 60)}
                    </p>
                    <div className="mt-1.5">
                      <MuscleDots exercises={plan} />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => start(r.name, attachCardioFields(planToExercises(r.exercises), r.exercises))}
                    aria-label={`Start routine ${r.name}`}
                    className="btn-3d btn-3d-go min-h-12 rounded-xl px-4 text-base"
                  >
                    Start
                  </button>
                  <IconButton icon="more" label={`Options for ${r.name}`} onClick={() => setMenuRoutine(r)} />
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <Sheet open={menuRoutine !== null} onClose={() => setMenuRoutine(null)} title={menuRoutine?.name ?? 'Routine'}>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              setEditing(menuRoutine)
              setMenuRoutine(null)
              setBuilderOpen(true)
            }}
            className="card flex min-h-14 w-full items-center gap-3 p-3 text-left font-semibold"
          >
            <Icon name="note" size={20} className="text-[var(--color-fg-muted)]" />
            Edit routine
          </button>
          <button
            type="button"
            onClick={() => {
              setDeleting(menuRoutine)
              setMenuRoutine(null)
            }}
            className="card flex min-h-14 w-full items-center gap-3 p-3 text-left font-semibold text-rose-400"
          >
            <Icon name="trash" size={20} />
            Delete routine
          </button>
        </div>
      </Sheet>

      <ConfirmSheet
        open={deleting !== null}
        title="Delete this routine?"
        message={deleting ? `“${deleting.name}” will be removed. Past workouts are not affected.` : ''}
        confirmLabel="Delete routine"
        onConfirm={() => {
          const r = deleting
          setDeleting(null)
          if (r) void deleteRoutine(r.id).then(() => toast('Routine deleted.', 'info'))
        }}
        onCancel={() => setDeleting(null)}
      />

      <Sheet
        open={preview !== null}
        onClose={() => setPreviewIndex(null)}
        title={preview?.name ?? 'Workout'}
        footer={
          <button
            type="button"
            onClick={() => {
              const i = previewIndex
              setPreviewIndex(null)
              if (i !== null) startPlanned(i)
            }}
            className="btn-3d btn-3d-go w-full min-h-14 text-lg"
          >
            <Icon name="play" size={20} />
            Start this day
          </button>
        }
      >
        {preview ? (
          <div className="flex flex-col gap-4">
            {preview.focus ? <p className="text-sm text-[var(--color-fg-muted)]">{preview.focus}</p> : null}
            <p className="tabular text-xs font-semibold text-[var(--color-fg-muted)]">
              {metaLine(preview.exercises)}
            </p>
            <ExerciseLines exercises={preview.exercises} />
          </div>
        ) : null}
      </Sheet>

      <Sheet open={restOpen} onClose={() => setRestOpen(false)} title="Rest day">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="grid size-16 place-items-center rounded-2xl bg-rest/15 text-rest">
            <Icon name="moon" size={32} />
          </span>
          <p className="text-sm text-[var(--color-fg-muted)]">
            Muscles grow while you recover. Feeling fresh? You can still train.
          </p>
          <button
            type="button"
            onClick={() => {
              setRestOpen(false)
              setAnywayOpen(true)
            }}
            className="btn-3d btn-3d-neutral w-full min-h-14"
          >
            Train anyway
          </button>
        </div>
      </Sheet>

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
