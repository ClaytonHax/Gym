import { useMemo, useState } from 'react'
import { ExercisePicker } from '../components/ExercisePicker'
import { RoutineBuilder } from '../components/RoutineBuilder'
import { Button, IconButton, Segmented } from '../components/ui'
import { useToast } from '../contexts/ToastContext'
import { useRoutines } from '../hooks/useRoutines'
import { useWorkouts } from '../hooks/useWorkouts'
import { MUSCLE_COLORS } from '../data/exercises'
import { nextProgram, planToExercises, PROGRAMS, PROGRAM_GROUPS } from '../data/programs'
import { fmtDuration } from '../lib/date'
import type { ActiveWorkout, Exercise, PlanExercise, ProgramGroup, Routine, WorkoutExercise } from '../types'

function defaultName(): string {
  const h = new Date().getHours()
  return `${h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening'} Workout`
}

/** Rough session length: ~45s under tension per set plus the prescribed rest. */
export function estimateMinutes(plan: PlanExercise[]): number {
  const sec = plan.reduce((t, e) => t + e.targets.length * (45 + (e.restSec ?? 90)), 0)
  return Math.round(sec / 60 / 5) * 5
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
  const sets = plan.reduce((n, e) => n + e.targets.length, 0)
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
              {e.targets.length}×{e.targets[0] || '—'}
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
  const { workouts } = useWorkouts()
  const { routines, deleteRoutine } = useRoutines()
  const [group, setGroup] = useState<ProgramGroup>('Push')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [editing, setEditing] = useState<Routine | null>(null)

  const next = useMemo(() => nextProgram(workouts), [workouts])
  const programs = PROGRAMS.filter((p) => p.group === group)

  function start(name: string, exercises: WorkoutExercise[]) {
    onStart({ name, startedAt: new Date().toISOString(), exercises })
  }

  function toExercise(ex: Exercise): WorkoutExercise {
    return {
      exerciseId: ex.id,
      name: ex.name,
      muscle: ex.muscle,
      tracksWeight: ex.tracksWeight,
      sets: [{ weightKg: 0, reps: 0, done: false }],
    }
  }

  return (
    <div className="animate-rise flex flex-col gap-6">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-wide">Train</h1>
        <p className="mt-0.5 text-sm text-[var(--color-fg-muted)]">
          Pick a set workout, run your own routine, or start from scratch.
        </p>
      </header>

      <section aria-label="Up next">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-400">Up next</p>
        <ul>
          <PlanCard
            highlight
            title={next.name}
            subtitle={next.focus}
            plan={next.exercises}
            onStart={() => start(next.name, planToExercises(next.exercises))}
          />
        </ul>
      </section>

      <section aria-label="Set workouts">
        <h2 className="mb-3 text-lg font-semibold">Push · Pull · Legs</h2>
        <Segmented
          label="Workout type"
          value={group}
          onChange={setGroup}
          options={PROGRAM_GROUPS.map((g) => ({ value: g, label: g }))}
        />
        <ul className="mt-3 flex flex-col gap-3">
          {programs.map((p) => (
            <PlanCard
              key={p.id}
              title={p.name}
              subtitle={p.focus}
              plan={p.exercises}
              onStart={() => start(p.name, planToExercises(p.exercises))}
            />
          ))}
        </ul>
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
            Build your own with “New”, or tick “Save as a routine” when you finish a session.
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
                onStart={() => start(r.name, planToExercises(r.exercises))}
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

      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(picked) => start(defaultName(), picked.map(toExercise))}
      />
      <RoutineBuilder open={builderOpen} onClose={() => setBuilderOpen(false)} routine={editing} />
    </div>
  )
}
