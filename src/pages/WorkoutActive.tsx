import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import {
  Badge,
  Button,
  Card,
  ConfirmSheet,
  IconButton,
  Sheet,
  Spinner,
} from '../components/ui'
import { ExercisePicker } from '../components/ExercisePicker'
import { RestTimer, type RestTimerHandle } from '../components/RestTimer'
import { SetRow } from '../components/SetRow'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import { useActiveWorkout } from '../hooks/useActiveWorkout'
import { useWorkouts } from '../hooks/useWorkouts'
import { BUILTIN_EXERCISES, MUSCLE_COLORS, TEMPLATES } from '../data/exercises'
import { fmtDuration } from '../lib/date'
import { fmtVolume, fmtWeight } from '../lib/units'
import { completedSetCount, lastPerformance, volumeOf } from '../lib/stats'
import type { ActiveWorkout, Exercise, WorkoutExercise, WorkoutSet } from '../types'

function emptySet(): WorkoutSet {
  return { weightKg: 0, reps: 0, done: false }
}

function toWorkoutExercise(ex: Exercise): WorkoutExercise {
  return {
    exerciseId: ex.id,
    name: ex.name,
    muscle: ex.muscle,
    tracksWeight: ex.tracksWeight,
    sets: [emptySet()],
  }
}

function defaultName(): string {
  const h = new Date().getHours()
  const part = h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening'
  return `${part} Workout`
}

/* -------------------------------------------------------------------------- */
/* Start screen                                                                */
/* -------------------------------------------------------------------------- */

function StartScreen({ onStart }: { onStart: (workout: ActiveWorkout) => void }) {
  const [pickerOpen, setPickerOpen] = useState(false)

  function startBlank(exercises: WorkoutExercise[] = []) {
    onStart({ name: defaultName(), startedAt: new Date().toISOString(), exercises })
  }

  function startTemplate(id: string) {
    const template = TEMPLATES.find((t) => t.id === id)
    if (!template) return
    const exercises = template.exerciseIds.flatMap((exId) => {
      const ex = BUILTIN_EXERCISES.find((e) => e.id === exId)
      return ex ? [{ ...toWorkoutExercise(ex), sets: [emptySet(), emptySet(), emptySet()] }] : []
    })
    onStart({ name: template.name, startedAt: new Date().toISOString(), exercises })
  }

  return (
    <div className="animate-rise flex flex-col gap-6">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-wide">New workout</h1>
        <p className="mt-0.5 text-sm text-[var(--color-fg-muted)]">
          Pick a split or build your own session.
        </p>
      </header>

      <Button size="lg" variant="go" full icon="play" onClick={() => startBlank()}>
        Start empty workout
      </Button>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Templates</h2>
        <ul className="grid grid-cols-2 gap-3">
          {TEMPLATES.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => startTemplate(t.id)}
                className="card h-full w-full p-3.5 text-left transition-colors duration-200 hover:border-brand-500/60"
              >
                <span className="mb-2 grid size-9 place-items-center rounded-lg bg-brand-500/10 text-brand-400">
                  <Icon name="layers" size={18} />
                </span>
                <span className="block font-display text-lg font-semibold">{t.name}</span>
                <span className="block text-xs text-[var(--color-fg-muted)]">{t.focus}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <Button variant="secondary" size="lg" full icon="search" onClick={() => setPickerOpen(true)}>
        Choose exercises
      </Button>

      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(picked) => startBlank(picked.map(toWorkoutExercise))}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Active screen                                                               */
/* -------------------------------------------------------------------------- */

export function WorkoutActive() {
  const navigate = useNavigate()
  const toast = useToast()
  const { profile } = useSettings()
  const unit = profile.unit
  const { active, save, hydrated } = useActiveWorkout()
  const { workouts, saveWorkout } = useWorkouts()

  const [pickerOpen, setPickerOpen] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [finishOpen, setFinishOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [saving, setSaving] = useState(false)
  const timerRef = useRef<RestTimerHandle | null>(null)

  const onTimerReady = useCallback((handle: RestTimerHandle) => {
    timerRef.current = handle
  }, [])

  useEffect(() => {
    if (!active) return
    const tick = () => setElapsed((Date.now() - new Date(active.startedAt).getTime()) / 1000)
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [active])

  // Guard against closing the tab mid-session by accident.
  useEffect(() => {
    if (!active) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [active])

  const volume = useMemo(() => (active ? volumeOf(active.exercises) : 0), [active])
  const setsDone = useMemo(() => (active ? completedSetCount(active.exercises) : 0), [active])

  const patch = useCallback(
    (updater: (draft: ActiveWorkout) => ActiveWorkout) => {
      if (!active) return
      save(updater(active))
    },
    [active, save]
  )

  const updateExercise = useCallback(
    (index: number, updater: (ex: WorkoutExercise) => WorkoutExercise) => {
      patch((draft) => ({
        ...draft,
        exercises: draft.exercises.map((ex, i) => (i === index ? updater(ex) : ex)),
      }))
    },
    [patch]
  )

  function addExercises(picked: Exercise[]) {
    patch((draft) => ({
      ...draft,
      exercises: [...draft.exercises, ...picked.map(toWorkoutExercise)],
    }))
  }

  function addSet(index: number) {
    updateExercise(index, (ex) => {
      // Carry the previous set's load forward — that's almost always the intent.
      const last = ex.sets[ex.sets.length - 1]
      return {
        ...ex,
        sets: [
          ...ex.sets,
          last ? { ...last, done: false } : emptySet(),
        ],
      }
    })
  }

  function toggleSetDone(exIndex: number, setIndex: number) {
    const ex = active?.exercises[exIndex]
    const wasDone = ex?.sets[setIndex]?.done
    updateExercise(exIndex, (e) => ({
      ...e,
      sets: e.sets.map((s, i) => (i === setIndex ? { ...s, done: !s.done } : s)),
    }))
    // Completing a working set kicks off rest automatically.
    if (!wasDone && !ex?.sets[setIndex]?.warmup) timerRef.current?.start()
  }

  function copyLastTime(exIndex: number) {
    const ex = active?.exercises[exIndex]
    if (!ex) return
    const last = lastPerformance(workouts, ex.exerciseId)
    if (!last) {
      toast('No previous session for this exercise yet.', 'info')
      return
    }
    updateExercise(exIndex, (e) => ({
      ...e,
      sets: last.sets.map((s) => ({ weightKg: s.weightKg, reps: s.reps, done: false })),
    }))
    toast('Loaded your last session’s sets.')
  }

  function moveExercise(index: number, direction: -1 | 1) {
    const target = index + direction
    patch((draft) => {
      if (target < 0 || target >= draft.exercises.length) return draft
      const next = [...draft.exercises]
      ;[next[index], next[target]] = [next[target], next[index]]
      return { ...draft, exercises: next }
    })
  }

  async function finish() {
    if (!active) return
    setSaving(true)
    try {
      // Drop unlogged sets and empty exercises so history stays clean.
      const exercises = active.exercises
        .map((ex) => ({ ...ex, sets: ex.sets.filter((s) => s.done) }))
        .filter((ex) => ex.sets.length > 0)

      if (exercises.length === 0) {
        toast('Complete at least one set before finishing.', 'error')
        setFinishOpen(false)
        return
      }

      const id = await saveWorkout({
        name: active.name.trim() || defaultName(),
        startedAt: active.startedAt,
        finishedAt: new Date().toISOString(),
        durationSec: Math.round((Date.now() - new Date(active.startedAt).getTime()) / 1000),
        exercises,
        notes: active.notes,
      })
      save(null)
      setFinishOpen(false)
      toast('Workout saved. Nice work.')
      navigate(`/history/${id}`, { replace: true })
    } catch {
      toast('Could not save the workout. It’s still here — try again.', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!hydrated) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center text-[var(--color-fg-muted)]">
        <Spinner size={28} />
      </div>
    )
  }

  if (!active) return <StartScreen onStart={(w) => save(w)} />

  return (
    <div className="animate-rise flex flex-col gap-4">
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <input
              autoFocus
              value={active.name}
              onChange={(e) => patch((d) => ({ ...d, name: e.target.value }))}
              onBlur={() => setRenaming(false)}
              onKeyDown={(e) => e.key === 'Enter' && setRenaming(false)}
              aria-label="Workout name"
              className="w-full rounded-lg border border-brand-500 bg-[var(--color-surface-2)] px-2 py-1 font-display text-2xl font-semibold tracking-wide outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className="flex items-center gap-2 text-left"
            >
              <h1 className="font-display text-2xl font-semibold tracking-wide">{active.name}</h1>
              <Icon name="note" size={15} className="shrink-0 text-[var(--color-fg-muted)]" />
            </button>
          )}
          <p className="tabular mt-0.5 flex items-center gap-1.5 text-sm text-[var(--color-fg-muted)]">
            <span className="size-2 animate-pulse rounded-full bg-go-500" />
            {fmtDuration(elapsed)} · {setsDone} sets · {fmtVolume(volume, unit)}
          </p>
        </div>
        <IconButton icon="note" label="Workout notes" onClick={() => setNotesOpen(true)} />
        <IconButton
          icon="trash"
          label="Discard workout"
          onClick={() => setDiscardOpen(true)}
          className="text-rose-400 hover:bg-rose-500/15"
        />
      </header>

      <RestTimer onReady={onTimerReady} />

      {active.exercises.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-8 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-brand-500/10 text-brand-400">
            <Icon name="dumbbell" size={24} />
          </span>
          <p className="font-semibold">No exercises yet</p>
          <p className="max-w-[32ch] text-sm text-[var(--color-fg-muted)]">
            Add your first movement and start logging sets.
          </p>
          <Button icon="plus" onClick={() => setPickerOpen(true)}>
            Add exercise
          </Button>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {active.exercises.map((ex, exIndex) => {
            const last = lastPerformance(workouts, ex.exerciseId)
            return (
              <Card as="li" key={`${ex.exerciseId}-${exIndex}`} className="p-3">
                <div className="mb-2.5 flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-base font-semibold">{ex.name}</h2>
                      <Badge color={MUSCLE_COLORS[ex.muscle]}>{ex.muscle}</Badge>
                    </div>
                    {last ? (
                      <p className="tabular mt-0.5 truncate text-xs text-[var(--color-fg-muted)]">
                        Last:{' '}
                        {last.sets
                          .slice(0, 4)
                          .map((s) =>
                            ex.tracksWeight ? `${fmtWeight(s.weightKg, unit, false)}×${s.reps}` : `${s.reps}`
                          )
                          .join(' · ')}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-xs text-[var(--color-fg-muted)]">First time — set a baseline</p>
                    )}
                  </div>
                  <div className="flex shrink-0">
                    {last ? (
                      <IconButton
                        icon="copy"
                        label={`Copy last session's sets for ${ex.name}`}
                        onClick={() => copyLastTime(exIndex)}
                      />
                    ) : null}
                    <IconButton
                      icon="arrow-up"
                      label={`Move ${ex.name} up`}
                      disabled={exIndex === 0}
                      onClick={() => moveExercise(exIndex, -1)}
                    />
                    <IconButton
                      icon="arrow-down"
                      label={`Move ${ex.name} down`}
                      disabled={exIndex === active.exercises.length - 1}
                      onClick={() => moveExercise(exIndex, 1)}
                    />
                    <IconButton
                      icon="trash"
                      label={`Remove ${ex.name}`}
                      onClick={() =>
                        patch((d) => ({
                          ...d,
                          exercises: d.exercises.filter((_, i) => i !== exIndex),
                        }))
                      }
                      className="hover:bg-rose-500/15 hover:text-rose-400"
                    />
                  </div>
                </div>

                <ul className="flex flex-col gap-1.5">
                  {ex.sets.map((set, setIndex) => (
                    <SetRow
                      key={setIndex}
                      index={setIndex}
                      set={set}
                      tracksWeight={ex.tracksWeight}
                      placeholder={last?.sets[setIndex]}
                      onChange={(setPatch) =>
                        updateExercise(exIndex, (e) => ({
                          ...e,
                          sets: e.sets.map((s, i) => (i === setIndex ? { ...s, ...setPatch } : s)),
                        }))
                      }
                      onToggleDone={() => toggleSetDone(exIndex, setIndex)}
                      onRemove={() =>
                        updateExercise(exIndex, (e) => ({
                          ...e,
                          sets: e.sets.filter((_, i) => i !== setIndex),
                        }))
                      }
                    />
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => addSet(exIndex)}
                  className="mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl
                    border border-dashed border-[var(--color-line)] text-sm font-semibold
                    text-[var(--color-fg-muted)] transition-colors duration-200
                    hover:border-brand-500 hover:text-brand-400"
                >
                  <Icon name="plus" size={16} />
                  Add set
                </button>
              </Card>
            )
          })}
        </ul>
      )}

      {active.exercises.length > 0 ? (
        <Button variant="secondary" size="lg" full icon="plus" onClick={() => setPickerOpen(true)}>
          Add exercise
        </Button>
      ) : null}

      {active.notes ? (
        <Card className="flex gap-2.5">
          <Icon name="note" size={16} className="mt-0.5 shrink-0 text-[var(--color-fg-muted)]" />
          <p className="whitespace-pre-wrap text-sm text-[var(--color-fg-muted)]">{active.notes}</p>
        </Card>
      ) : null}

      <Button size="lg" variant="go" full icon="check" onClick={() => setFinishOpen(true)}>
        Finish workout
      </Button>

      <ExercisePicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={addExercises} />

      <Sheet
        open={notesOpen}
        onClose={() => setNotesOpen(false)}
        title="Workout notes"
        footer={
          <Button full onClick={() => setNotesOpen(false)}>
            Done
          </Button>
        }
      >
        <label htmlFor="workout-notes" className="sr-only">
          Workout notes
        </label>
        <textarea
          id="workout-notes"
          rows={6}
          value={active.notes ?? ''}
          onChange={(e) => patch((d) => ({ ...d, notes: e.target.value }))}
          placeholder="How did it feel? Anything to remember for next time?"
          className="w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] p-3.5 text-[var(--color-fg)] placeholder:text-[var(--color-fg-muted)] outline-none focus:border-brand-500"
        />
      </Sheet>

      <Sheet
        open={finishOpen}
        onClose={() => setFinishOpen(false)}
        title="Finish workout"
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" full onClick={() => setFinishOpen(false)}>
              Keep going
            </Button>
            <Button variant="go" full loading={saving} onClick={finish}>
              Save workout
            </Button>
          </div>
        }
      >
        <dl className="grid grid-cols-3 gap-3 text-center">
          {[
            { label: 'Duration', value: fmtDuration(elapsed) },
            { label: 'Sets', value: String(setsDone) },
            { label: 'Volume', value: fmtVolume(volume, unit) },
          ].map((item) => (
            <div key={item.label} className="rounded-xl bg-[var(--color-surface-2)] p-3">
              <dt className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">
                {item.label}
              </dt>
              <dd className="tabular mt-1 font-display text-xl font-semibold">{item.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm text-[var(--color-fg-muted)]">
          Incomplete sets are discarded — only the sets you ticked off get saved.
        </p>
      </Sheet>

      <ConfirmSheet
        open={discardOpen}
        title="Discard this workout?"
        message="Every set you've logged in this session will be lost. This can't be undone."
        confirmLabel="Discard"
        onCancel={() => setDiscardOpen(false)}
        onConfirm={() => {
          save(null)
          setDiscardOpen(false)
          toast('Workout discarded.', 'info')
          navigate('/')
        }}
      />
    </div>
  )
}
