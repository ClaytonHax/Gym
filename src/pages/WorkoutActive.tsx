import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { PlateCalculator } from '../components/PlateCalculator'
import { StartScreen } from './StartScreen'
import { RestTimer, type RestTimerHandle } from '../components/RestTimer'
import { SetRow } from '../components/SetRow'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import { useActiveWorkout } from '../hooks/useActiveWorkout'
import { useRoutines } from '../hooks/useRoutines'
import { useWorkouts } from '../hooks/useWorkouts'
import { MUSCLE_COLORS } from '../data/exercises'
import { fmtClock, fmtDuration } from '../lib/date'
import { fmtVolume, fmtWeight, step } from '../lib/units'
import { completedSetCount, estimate1rm, lastPerformance, personalRecords, volumeOf } from '../lib/stats'
import type { ActiveWorkout, Exercise, WorkoutExercise, WorkoutSet } from '../types'

/**
 * Easter egg: roughly 1 in 4 Pull 2 sessions get a nod to "The Kill 2". Seeded
 * from the start time so it doesn't flicker on every render or reload.
 */
function Kill2Banner({ active }: { active: ActiveWorkout }) {
  const key = `gym.kill2.${active.startedAt}`
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem(key) === '1'
    } catch {
      return false
    }
  })
  const lucky = useMemo(() => {
    let h = 0
    for (const c of active.startedAt) h = (h * 31 + c.charCodeAt(0)) >>> 0
    return h % 4 === 0
  }, [active.startedAt])

  const name = (active.planDayName ?? active.name).trim().toLowerCase()
  if (name !== 'pull 2' || !lucky || hidden) return null

  return (
    <div className="hero animate-pop flex items-center gap-3 rounded-2xl p-4 text-ink-950">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-ink-950/15">
        <Icon name="zap" size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-2xl font-bold uppercase leading-none">Pull 2? This is The Kill 2.</p>
        <p className="mt-1 text-sm font-semibold">Back for the sequel. Go finish what Pull 1 started.</p>
      </div>
      <IconButton
        icon="x"
        label="Dismiss"
        onClick={() => {
          setHidden(true)
          try {
            sessionStorage.setItem(key, '1')
          } catch {
            // Fine — it just shows again after a reload.
          }
        }}
        className="text-ink-950 hover:bg-ink-950/10"
      />
    </div>
  )
}

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

/** Firestore rejects `undefined` fields, so cleared optionals must be dropped, not set. */
function dropUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T
}

/** Top of a rep target like "10-15" or "12"; null for "failure" or blank. */
function topOfRange(target?: string): number | null {
  const nums = target?.match(/\d+/g)
  return nums ? Number(nums[nums.length - 1]) : null
}

/** True when every working set last time reached the top of its target range. */
function hitTopOfRange(ex: WorkoutExercise, last: Array<{ reps: number }>): boolean {
  if (!ex.tracksWeight || last.length === 0) return false
  const targets = ex.sets.filter((s) => !s.warmup).map((s) => topOfRange(s.targetReps))
  if (targets.length === 0 || targets.some((t) => t === null)) return false
  return last.every((s, i) => s.reps >= (targets[Math.min(i, targets.length - 1)] as number))
}

function defaultName(): string {
  const h = new Date().getHours()
  const part = h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening'
  return `${part} Workout`
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
  const { saveRoutine } = useRoutines()

  const [pickerOpen, setPickerOpen] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [finishOpen, setFinishOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveAsRoutine, setSaveAsRoutine] = useState(false)
  const [platesFor, setPlatesFor] = useState<number | null>(null)
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

  const records = useMemo(
    () => new Map(personalRecords(workouts).map((r) => [r.exerciseId, r.estimated1rmKg])),
    [workouts]
  )

  const totalSets = active ? active.exercises.reduce((n, e) => n + e.sets.length, 0) : 0
  const doneSets = active ? active.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0) : 0

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
    const set = ex?.sets[setIndex]
    if (wasDone || !ex || !set || set.warmup) return

    // Live PR check against history — a first-ever session has nothing to beat.
    const prior = records.get(ex.exerciseId)
    if (ex.tracksWeight && prior && estimate1rm(set.weightKg, set.reps) > prior + 0.01) {
      toast(`New PR on ${ex.name}!`)
    }

    // Superset partners go back-to-back; rest only after the last exercise in the group.
    const next = active?.exercises[exIndex + 1]
    const mid = Boolean(ex.supersetId) && next?.supersetId === ex.supersetId
    if (!mid) timerRef.current?.start(ex.restSec)
  }

  function toggleSuperset(index: number) {
    patch((draft) => {
      const a = draft.exercises[index]
      const b = draft.exercises[index + 1]
      if (!a || !b) return draft
      const strip = (e: WorkoutExercise): WorkoutExercise => {
        const { supersetId: _unused, ...rest } = e
        return rest
      }
      let exercises: WorkoutExercise[]
      if (a.supersetId && a.supersetId === b.supersetId) {
        // Unlink b; a stays grouped only if something earlier still shares its id.
        const stillGrouped = draft.exercises.some((e, i) => i < index && e.supersetId === a.supersetId)
        exercises = draft.exercises.map((e, i) =>
          i === index + 1 || (i === index && !stillGrouped) ? strip(e) : e
        )
      } else {
        const id = a.supersetId ?? `ss-${Date.now().toString(36)}`
        exercises = draft.exercises.map((e, i) =>
          i === index || i === index + 1 ? { ...e, supersetId: id } : e
        )
      }
      return { ...draft, exercises }
    })
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
      sets: last.sets.map((s, i) => ({
        weightKg: s.weightKg,
        reps: s.reps,
        done: false,
        ...(e.sets[i]?.targetReps ? { targetReps: e.sets[i].targetReps } : {}),
      })),
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
        .map((ex) =>
          dropUndefined({
            ...ex,
            notes: ex.notes?.trim() || undefined,
            sets: ex.sets.filter((s) => s.done),
          })
        )
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
        ...(active.notes ? { notes: active.notes } : {}),
        ...dropUndefined({
          planId: active.planId,
          planName: active.planName,
          planDayIndex: active.planDayIndex,
          planDayName: active.planDayName,
          planCycle: active.planCycle,
        }),
      })
      if (saveAsRoutine) {
        await saveRoutine({
          name: active.name.trim() || defaultName(),
          exercises: exercises.map((ex) =>
            dropUndefined({
              exerciseId: ex.exerciseId,
              name: ex.name,
              muscle: ex.muscle,
              tracksWeight: ex.tracksWeight,
              targets: ex.sets.filter((s) => !s.warmup).map((s) => s.targetReps ?? ''),
              restSec: ex.restSec,
              supersetId: ex.supersetId,
            })
          ),
        })
      }
      setSaveAsRoutine(false)
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
      <div className="sticky top-0 z-20 -mx-4 flex flex-col gap-3 bg-[var(--color-canvas)]/90 px-4 pb-3 pt-2 backdrop-blur-md">
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
            {fmtDuration(elapsed)} · {setsDone} {setsDone === 1 ? 'set' : 'sets'} · {fmtVolume(volume, unit)}
          </p>
          {active.planDayName && active.planDayIndex !== undefined ? (
            <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-400">
              Day {active.planDayIndex + 1}
              {active.planCycle ? ` · Cycle ${active.planCycle}` : ''}
            </p>
          ) : null}
        </div>
        <IconButton icon="note" label="Workout notes" onClick={() => setNotesOpen(true)} />
        <IconButton
          icon="trash"
          label="Discard workout"
          onClick={() => setDiscardOpen(true)}
          className="text-rose-400 hover:bg-rose-500/15"
        />
      </header>

      <div
        role="progressbar"
        aria-label="Sets completed"
        aria-valuemin={0}
        aria-valuemax={totalSets}
        aria-valuenow={doneSets}
        className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]"
      >
        <div
          className="h-full rounded-full bg-go-500 transition-[width] duration-300"
          style={{ width: `${totalSets ? (doneSets / totalSets) * 100 : 0}%` }}
        />
      </div>

      <RestTimer onReady={onTimerReady} />
      </div>

      <Kill2Banner active={active} />

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
            const overload = last ? hitTopOfRange(ex, last.sets) : false
            return (
              <Card
                as="li"
                key={`${ex.exerciseId}-${exIndex}`}
                className={`p-3 ${ex.supersetId ? 'border-l-4 border-l-violet-500' : ''}`}
              >
                <div className="mb-2.5 flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="line-clamp-2 text-base font-semibold leading-tight">{ex.name}</h2>
                      <Badge color={MUSCLE_COLORS[ex.muscle]}>{ex.muscle}</Badge>
                      {ex.supersetId ? <Badge color="#8b5cf6">Superset</Badge> : null}
                    </div>
                    {ex.sets.some((s) => s.targetReps) ? (
                      <p className="tabular mt-0.5 truncate text-xs font-semibold text-brand-400">
                        Target {ex.sets.map((s) => s.targetReps ?? '—').join(' → ')}
                        {ex.restSec ? ` · rest ${fmtClock(ex.restSec)}` : ''}
                      </p>
                    ) : null}
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
                    {overload ? (
                      <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-go-500/15 px-1.5 py-0.5 text-xs font-bold text-go-400">
                        <Icon name="trending" size={13} />
                        Top of the range. Try +{step(unit)} {unit}
                      </p>
                    ) : null}
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
                    <Fragment key={setIndex}>
                    <SetRow
                      index={setIndex}
                      set={set}
                      tracksWeight={ex.tracksWeight}
                      placeholder={last?.sets[setIndex]}
                      targetReps={set.targetReps}
                      onChange={(setPatch) =>
                        updateExercise(exIndex, (e) => ({
                          ...e,
                          sets: e.sets.map((s, i) =>
                            i === setIndex ? dropUndefined({ ...s, ...setPatch }) : s
                          ),
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
                  {last?.sets[setIndex] && !set.warmup ? (
                      <li className="tabular -mt-0.5 pl-9 text-[11px] text-[var(--color-fg-muted)]">
                        Last: {ex.tracksWeight ? `${fmtWeight(last.sets[setIndex].weightKg, unit, false)} × ` : ''}
                        {last.sets[setIndex].reps}
                      </li>
                    ) : null}
                    </Fragment>
                  ))}
                </ul>

                {ex.notes !== undefined ? (
                  <textarea
                    rows={2}
                    value={ex.notes}
                    onChange={(e) => updateExercise(exIndex, (x) => ({ ...x, notes: e.target.value }))}
                    aria-label={`Notes for ${ex.name}`}
                    placeholder="Cues, seat height, how it felt…"
                    className="mt-2 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] p-2.5 text-sm outline-none placeholder:text-[var(--color-fg-muted)] focus:border-brand-500"
                  />
                ) : null}

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {ex.tracksWeight ? (
                    <button
                      type="button"
                      onClick={() =>
                        setPlatesFor(ex.sets.find((s) => !s.warmup)?.weightKg ?? ex.sets[0]?.weightKg ?? 0)
                      }
                      className="chip"
                    >
                      <Icon name="calculator" size={13} /> Plates
                    </button>
                  ) : null}
                  {exIndex < active.exercises.length - 1 ? (
                    <button type="button" onClick={() => toggleSuperset(exIndex)} className="chip">
                      <Icon name="link" size={13} />
                      {ex.supersetId && ex.supersetId === active.exercises[exIndex + 1].supersetId
                        ? 'Unlink superset'
                        : 'Superset with next'}
                    </button>
                  ) : null}
                  {ex.notes === undefined ? (
                    <button
                      type="button"
                      onClick={() => updateExercise(exIndex, (x) => ({ ...x, notes: '' }))}
                      className="chip"
                    >
                      <Icon name="note" size={13} /> Note
                    </button>
                  ) : null}
                </div>

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
      <PlateCalculator open={platesFor !== null} onClose={() => setPlatesFor(null)} initialKg={platesFor ?? 0} />

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
        <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={saveAsRoutine}
            onChange={(e) => setSaveAsRoutine(e.target.checked)}
            className="size-5 accent-[var(--color-brand-500)]"
          />
          Save as a routine
        </label>
        <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
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
