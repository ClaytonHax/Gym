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
import { PhotoCapture } from '../components/proofs'
import { PlateCalculator } from '../components/PlateCalculator'
import { StartScreen } from './StartScreen'
import { RestTimer, type RestTimerHandle } from '../components/RestTimer'
import { SetRow } from '../components/SetRow'
import { TimedSetRow } from '../components/TimedSetRow'
import { LogModeToggle } from '../components/LogModeToggle'
import { ExerciseGuide } from '../components/ExerciseGuide'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useSocial } from '../contexts/SocialContext'
import { useToast } from '../contexts/ToastContext'
import { useActiveWorkout } from '../hooks/useActiveWorkout'
import { useBodyLog } from '../hooks/useBodyLog'
import { useRoutines } from '../hooks/useRoutines'
import { useWorkouts } from '../hooks/useWorkouts'
import { inBattleRange, postProof } from '../hooks/useChallengeProofs'
import { MUSCLE_COLORS, isDumbbellExercise, usesPlates } from '../data/exercises'
import { dayKey, fmtClock, fmtDuration } from '../lib/date'
import type { PhotoSvg } from '../lib/photoSvg'
import { challengeState } from '../lib/social'
import { fmtDuration as fmtStopwatch, fmtTargetDuration, isTimed, logModeOf } from '../lib/logMode'
import { fmtDistance, fmtVolume, fmtWeight, step } from '../lib/units'
import { DEFAULT_BODY_WEIGHT_KG, estimateCalories } from '../lib/calories'
import { stripUndefined } from '../lib/clean'
import {
  aimLabel,
  completeUnfinished,
  emptySet,
  fmtMinutes,
  keyOf,
  lastSetsFull,
  needsKeys,
  newKey,
  repSuggestion,
  sessionDurationSec,
  stripKeys,
  swapExercise,
  timedPlaceholders,
  toWorkoutExercise,
  unfinishedSummary,
  withKeys,
} from '../lib/workoutExercise'
import {
  bestDurationByExercise,
  completedSetCount,
  estimate1rm,
  lastPerformance,
  personalRecords,
  volumeOf,
} from '../lib/stats'
import { linkedToNext, moveItem, newSupersetId, supersetColor, toggleSupersetWithNext } from '../lib/supersets'
import { HOLD_HANDLE_CLASS, useHoldToReorder } from '../hooks/useHoldToReorder'
import type { ActiveWorkout, Exercise, LogMode, Workout, WorkoutExercise, WorkoutSet } from '../types'

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

/** Cardio and timed moves don't get an automatic rest countdown. */
const skipsRest = (ex: WorkoutExercise) => isTimed(ex) || ex.muscle === 'Cardio'

const CHIP =
  'inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[var(--color-line)] px-3.5 text-sm font-semibold text-[var(--color-fg-muted)] transition-colors duration-200 hover:border-brand-500 hover:text-brand-400'

/* -------------------------------------------------------------------------- */
/* Active screen                                                               */
/* -------------------------------------------------------------------------- */

export function WorkoutActive() {
  const navigate = useNavigate()
  const toast = useToast()
  const { profile } = useSettings()
  const unit = profile.unit
  const { active, save, hydrated } = useActiveWorkout()
  const { user } = useAuth()
  const { challenges } = useSocial()
  const { workouts, saveWorkout } = useWorkouts()
  const { saveRoutine } = useRoutines()
  const { latest: latestBody } = useBodyLog()

  const [pickerOpen, setPickerOpen] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [finishOpen, setFinishOpen] = useState(false)
  const [unfinishedOpen, setUnfinishedOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [proofPhoto, setProofPhoto] = useState<PhotoSvg | null>(null)
  const [saveAsRoutine, setSaveAsRoutine] = useState(false)
  const [platesFor, setPlatesFor] = useState<number | null>(null)
  // Exercise index awaiting a "yes, remove it" because it has logged sets.
  const [removeAsk, setRemoveAsk] = useState<number | null>(null)
  // Swap: the picker opens for that exercise's index.
  const [swapIndex, setSwapIndex] = useState<number | null>(null)
  const timerRef = useRef<RestTimerHandle | null>(null)
  const reorder = useHoldToReorder((from, to) => moveExercise(from, to))

  const onTimerReady = useCallback((handle: RestTimerHandle) => {
    timerRef.current = handle
  }, [])

  useEffect(() => {
    if (!active) return
    const tick = () => setElapsed((Date.now() - new Date(active.startedAt).getTime()) / 1000)
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [active?.startedAt]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Stable React keys for exercises and sets (older sessions and plan starts don't have them yet).
  useEffect(() => {
    if (active && needsKeys(active)) save((prev) => (prev ? withKeys(prev) : prev))
  }, [active, save])

  const records = useMemo(
    () => new Map(personalRecords(workouts).map((r) => [r.exerciseId, r.estimated1rmKg])),
    [workouts]
  )

  const bestDurations = useMemo(() => bestDurationByExercise(workouts), [workouts])

  const totalSets = active ? active.exercises.reduce((n, e) => n + e.sets.length, 0) : 0
  const doneSets = active ? active.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0) : 0

  const volume = useMemo(() => (active ? volumeOf(active.exercises) : 0), [active])
  const setsDone = useMemo(() => (active ? completedSetCount(active.exercises) : 0), [active])

  // Body weight for the calorie estimate; say so when we had to guess.
  const bodyKg = latestBody?.weightKg ?? DEFAULT_BODY_WEIGHT_KG
  const usingDefaultWeight = !latestBody?.weightKg
  const finishStats = useMemo(() => {
    if (!active || !finishOpen) return null
    const durationSec = sessionDurationSec(active.startedAt, active.exercises)
    return { durationSec, kcal: estimateCalories({ exercises: active.exercises, durationSec }, bodyKg) }
    // elapsed ticks every second so the wall-clock part stays current while the sheet is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, finishOpen, bodyKg, elapsed])

  // Always updates from the latest stored session, so two edits in one tick never clobber each other.
  const patch = useCallback(
    (updater: (draft: ActiveWorkout) => ActiveWorkout) => {
      save((prev) => (prev ? updater(prev) : prev))
    },
    [save]
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
    // New sets start empty; the previous numbers show as greyed suggestions instead of real values.
    updateExercise(index, (ex) => ({ ...ex, sets: [...ex.sets, emptySet()] }))
  }

  /** Switch an exercise between weight × reps and time, keeping only the sets that still make sense. */
  function setLogMode(exIndex: number, mode: LogMode) {
    const ex = active?.exercises[exIndex]
    if (!ex || logModeOf(ex) === mode) return
    updateExercise(exIndex, (e) => {
      let sets = e.sets.map((s) => {
        const fits = mode === 'time' ? (s.durationSec ?? 0) > 0 : s.reps > 0
        const next: WorkoutSet = { ...s, done: s.done && fits }
        if (mode === 'reps') delete next.timerStartedAt
        return next
      })
      if (mode === 'time') {
        // Timed work is open-ended: several blank placeholders collapse to one.
        const isBlank = (s: WorkoutSet) => !s.done && !s.durationSec && !s.reps && !s.weightKg
        const firstBlank = sets.findIndex(isBlank)
        sets = sets.filter((s, i) => !isBlank(s) || i === firstBlank)
        if (sets.length === 0) sets = [emptySet()]
      }
      const { logBy: _unused, ...rest } = e
      return mode === 'time' ? { ...rest, logBy: 'time' as const, sets } : { ...rest, sets }
    })
    toast(mode === 'time' ? `Logging ${ex.name} by time` : `Logging ${ex.name} by weight and reps`)
  }

  /** Tick or untick a set. `mode: 'done'` only ever ticks (used by auto-complete on a typed time). */
  function toggleSetDone(
    exIndex: number,
    setIndex: number,
    override?: Partial<WorkoutSet>,
    mode: 'toggle' | 'done' = 'toggle'
  ) {
    const ex = active?.exercises[exIndex]
    const cur = ex?.sets[setIndex]
    if (!ex || !cur) return
    if (mode === 'done' && cur.done) return
    const wasDone = cur.done
    updateExercise(exIndex, (e) => ({
      ...e,
      sets: e.sets.map((s, i) =>
        i === setIndex ? dropUndefined({ ...s, ...override, done: mode === 'done' ? true : !s.done }) : s
      ),
    }))
    const set = { ...cur, ...override }
    if (wasDone || set.warmup) return

    // Timed sets: no 1RM, no auto rest timer — just a nod when it's the longest ever.
    if (isTimed(ex)) {
      const prior = bestDurations.get(ex.exerciseId)
      if (prior && (set.durationSec ?? 0) > prior) toast(`New longest ${ex.name} session!`)
      return
    }

    // Live PR check against history — a first-ever session has nothing to beat.
    const prior = records.get(ex.exerciseId)
    if (ex.tracksWeight && prior && estimate1rm(set.weightKg, set.reps) > prior + 0.01) {
      toast(`New PR on ${ex.name}!`)
    }

    // Superset partners go back-to-back; rest only after the last exercise in the group.
    const next = active?.exercises[exIndex + 1]
    const mid = Boolean(ex.supersetId) && next?.supersetId === ex.supersetId
    if (!mid && !skipsRest(ex) && profile.restTimer === true) {
      timerRef.current?.start(profile.restFollowsPlan ? ex.restSec : undefined)
    }
  }

  function toggleSuperset(index: number) {
    patch((draft) => ({ ...draft, exercises: toggleSupersetWithNext(draft.exercises, index, newSupersetId) }))
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
      sets: last.sets.map((s, i) =>
        isTimed(e)
          ? {
              key: keyOf(e.sets[i] ?? {}, '') || newKey(),
              weightKg: 0,
              reps: 0,
              done: false,
              ...(s.durationSec !== undefined ? { durationSec: s.durationSec } : {}),
              ...(s.distanceKm !== undefined ? { distanceKm: s.distanceKm } : {}),
            }
          : {
              key: keyOf(e.sets[i] ?? {}, '') || newKey(),
              weightKg: s.weightKg,
              reps: s.reps,
              done: false,
              ...(e.sets[i]?.targetReps ? { targetReps: e.sets[i].targetReps } : {}),
            }
      ) as WorkoutSet[],
    }))
    toast('Loaded your last session’s sets.')
  }

  function moveExercise(from: number, to: number) {
    patch((draft) => ({ ...draft, exercises: moveItem(draft.exercises, from, to) }))
  }

  /** Remove with an Undo that puts it back in the same place. */
  function removeExercise(index: number) {
    const ex = active?.exercises[index]
    if (!ex) return
    patch((d) => ({ ...d, exercises: d.exercises.filter((_, i) => i !== index) }))
    toast(`Removed ${ex.name}`, 'info', {
      action: {
        label: 'Undo',
        onClick: () =>
          patch((d) => {
            const key = keyOf(ex, '')
            if (key && d.exercises.some((e) => keyOf(e, '') === key)) return d
            const next = [...d.exercises]
            next.splice(Math.min(index, next.length), 0, ex)
            return { ...d, exercises: next }
          }),
      },
    })
  }

  function askRemoveExercise(index: number) {
    const ex = active?.exercises[index]
    if (!ex) return
    if (ex.sets.some((s) => s.done)) setRemoveAsk(index)
    else removeExercise(index)
  }

  function removeSet(exIndex: number, setIndex: number) {
    const ex = active?.exercises[exIndex]
    const set = ex?.sets[setIndex]
    if (!ex || !set) return
    updateExercise(exIndex, (e) => ({ ...e, sets: e.sets.filter((_, i) => i !== setIndex) }))
    toast(`Removed set ${setIndex + 1} of ${ex.name}`, 'info', {
      action: {
        label: 'Undo',
        onClick: () =>
          updateExercise(exIndex, (e) => {
            const key = keyOf(set, '')
            if (key && e.sets.some((s) => keyOf(s, '') === key)) return e
            const sets = [...e.sets]
            sets.splice(Math.min(setIndex, sets.length), 0, set)
            return { ...e, sets }
          }),
      },
    })
  }

  function askSwap(index: number) {
    const ex = active?.exercises[index]
    if (!ex) return
    // Nothing is lost on a swap any more (done sets stay put), so no confirm needed.
    setSwapIndex(index)
  }

  /** Replace in place; extra picks (if any) slot in right after it. */
  function swapPicked(picked: Exercise[]) {
    const index = swapIndex
    const old = index !== null ? active?.exercises[index] : undefined
    setSwapIndex(null)
    if (index === null || !old || picked.length === 0) return
    const [first, ...rest] = picked
    // Machine taken mid-exercise: the sets already done stay on the old exercise and
    // the swap picks up with the sets that are left, right after it.
    const doneSets = old.sets.filter((s) => s.done)
    const kept = doneSets.length > 0 ? { ...old, sets: doneSets } : null
    const swapped = swapExercise(old, first)
    const remaining = swapped.sets.slice(doneSets.length)
    const replacement = { ...swapped, sets: remaining.length > 0 ? remaining : swapped.sets.slice(0, 1) }
    patch((d) => ({
      ...d,
      exercises: [
        ...d.exercises.slice(0, index),
        ...(kept ? [kept] : []),
        replacement,
        ...rest.map(toWorkoutExercise),
        ...d.exercises.slice(index + 1),
      ],
    }))
    toast(`Swapped ${old.name} for ${first.name}`, 'info', {
      action: {
        label: 'Undo',
        onClick: () =>
          patch((d) => ({
            ...d,
            exercises: d.exercises
              .filter((e) => !kept || keyOf(e, 'x') !== keyOf(old, 'y'))
              .map((e) => (keyOf(e, 'x') === keyOf(replacement, 'y') ? old : e)),
          })),
      },
    })
  }

  // Live photo battles this session counts toward (by the day it started).
  const proofBattles = useMemo(() => {
    if (!active || !user) return []
    const day = dayKey(new Date(active.startedAt))
    return challenges.filter(
      (c) =>
        c.verify === 'photo' &&
        c.accepted.includes(user.uid) &&
        challengeState(c) === 'active' &&
        day >= c.startDay &&
        day <= c.endDay
    )
  }, [challenges, active, user])

  const unfinished = useMemo(
    () => (active && unfinishedOpen ? unfinishedSummary(active.exercises) : []),
    [active, unfinishedOpen]
  )

  /** Finish tapped: first make sure typed-but-unticked sets aren't silently dropped. */
  function requestFinish() {
    if (!active) return
    setSaveError(null)
    if (unfinishedSummary(active.exercises).length > 0) setUnfinishedOpen(true)
    else setFinishOpen(true)
  }

  async function finish() {
    if (!active) return
    setSaving(true)
    setSaveError(null)
    try {
      // Drop unlogged sets and empty exercises so history stays clean.
      const exercises = active.exercises
        .map((ex) =>
          stripKeys(
            dropUndefined({
              ...ex,
              notes: ex.notes?.trim() || undefined,
              sets: ex.sets.filter((s) => s.done).map((s) => dropUndefined({ ...s, timerStartedAt: undefined })),
            })
          )
        )
        .filter((ex) => ex.sets.length > 0)

      if (exercises.length === 0) {
        setSaveError('Tick off at least one set before saving, or go back and log one.')
        return
      }

      const durationSec = sessionDurationSec(active.startedAt, exercises)
      const draft = stripUndefined({
        name: active.name.trim() || defaultName(),
        startedAt: active.startedAt,
        finishedAt: new Date().toISOString(),
        durationSec,
        exercises,
        caloriesKcal: estimateCalories({ exercises, durationSec }, bodyKg),
        ...(active.notes ? { notes: active.notes } : {}),
        planId: active.planId,
        planName: active.planName,
        planDayIndex: active.planDayIndex,
        planDayName: active.planDayName,
        planCycle: active.planCycle,
      })
      const id = await saveWorkout(draft)

      // The workout is safe: clear the live session right away so the "in progress" strip,
      // the timer and Resume all disappear everywhere before anything best-effort runs.
      const routineName = active.name.trim() || defaultName()
      save(null)
      setFinishOpen(false)

      // Proofs are best effort: the workout is already safe, so never block on them.
      if (proofPhoto && user && proofBattles.length > 0) {
        const saved: Workout = {
          ...draft,
          id,
          totalVolumeKg: volumeOf(exercises),
          setCount: completedSetCount(exercises),
        }
        const targets = proofBattles.filter((c) => inBattleRange(c, saved))
        Promise.allSettled(targets.map((c) => postProof(c, user.uid, saved, proofPhoto))).then((results) => {
          const failed = results.filter((r) => r.status === 'rejected').length
          if (failed > 0) {
            toast(
              `Workout saved, but ${failed === targets.length ? 'the photo' : `${failed} proof${failed === 1 ? '' : 's'}`} couldn’t be added. Add it from the battle.`,
              'error'
            )
          }
        })
      }
      setProofPhoto(null)
      if (saveAsRoutine) {
        try {
          await saveRoutine({
            name: routineName,
            exercises: exercises.map((ex) =>
              dropUndefined({
                exerciseId: ex.exerciseId,
                name: ex.name,
                muscle: ex.muscle,
                tracksWeight: ex.tracksWeight,
                ...(isTimed(ex)
                  ? {
                      logBy: 'time' as const,
                      targets: [],
                      targetDurationSec: ex.targetDurationSec,
                      cardioFields: ex.cardioFields,
                    }
                  : { targets: ex.sets.filter((s) => !s.warmup).map((s) => s.targetReps ?? '') }),
                restSec: ex.restSec,
                supersetId: ex.supersetId,
              })
            ),
          })
        } catch {
          toast('Workout saved, but we couldn’t save it as a routine. You can build one from Train.', 'error')
        }
      }
      setSaveAsRoutine(false)
      toast('Workout saved. Nice work.')
      navigate(`/history/${id}`, { replace: true })
    } catch {
      setSaveError('We couldn’t save your workout. Your sets are still here. Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!hydrated) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center text-[var(--color-fg-muted)]">
        <Spinner size={28} />
        <span className="sr-only">Loading your workout</span>
      </div>
    )
  }

  if (!active) return <StartScreen onStart={(w) => save(w)} />

  return (
    <div className="animate-rise flex flex-col gap-4 pb-8">
      <header className="flex flex-col gap-3 pt-1">
        <div className="flex items-start gap-2">
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
                aria-label={`Workout name: ${active.name}. Tap to rename`}
                className="flex items-center gap-2 text-left"
              >
                <h1 className="font-display text-2xl font-semibold tracking-wide">{active.name}</h1>
                <Icon name="pencil" size={15} className="shrink-0 text-[var(--color-fg-muted)]" />
              </button>
            )}
            <p className="tabular mt-0.5 flex items-center gap-1.5 text-sm text-[var(--color-fg-muted)]">
              <span className="size-2 animate-pulse rounded-full bg-go-500 motion-reduce:animate-none" />
              {fmtDuration(elapsed)} · {setsDone} {setsDone === 1 ? 'set' : 'sets'} · {fmtVolume(volume, unit)}
            </p>
            {active.planDayName && active.planDayIndex !== undefined ? (
              <p className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-brand-400">
                Day {active.planDayIndex + 1}
                {active.planCycle && active.planCycle > 1 ? ` · Round ${active.planCycle}` : ''}
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
        </div>

        <div
          role="progressbar"
          aria-label="Sets completed"
          aria-valuemin={0}
          aria-valuemax={totalSets}
          aria-valuenow={doneSets}
          className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]"
        >
          <div
            className="h-full rounded-full bg-go-500 transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${totalSets ? (doneSets / totalSets) * 100 : 0}%` }}
          />
        </div>
      </header>

      {/* Idle it's a normal card; while counting down it becomes one slim sticky row. */}
      {profile.restTimer === true ? <RestTimer onReady={onTimerReady} /> : null}

      <Kill2Banner active={active} />

      {active.exercises.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-8 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-brand-500/10 text-brand-400">
            <Icon name="dumbbell" size={24} />
          </span>
          <p className="font-semibold">No exercises yet</p>
          <p className="max-w-[32ch] text-sm text-[var(--color-fg-muted)]">
            Add your first exercise and start logging sets.
          </p>
          <Button icon="plus" onClick={() => setPickerOpen(true)}>
            Add exercise
          </Button>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {active.exercises.map((ex, exIndex) => {
            const last = lastPerformance(workouts, ex.exerciseId)
            const lastFull = isTimed(ex) ? lastSetsFull(workouts, ex.exerciseId) : []
            const timed = isTimed(ex)
            const dumbbell = isDumbbellExercise({ exerciseId: ex.exerciseId, name: ex.name })
            const overload = last && !timed ? hitTopOfRange(ex, last.sets) : false
            const doneTimed = ex.sets.filter((s) => s.done && !s.warmup)
            const totalSec = doneTimed.reduce((n, s) => n + (s.durationSec ?? 0), 0)
            const totalKm = doneTimed.reduce((n, s) => n + (s.distanceKm ?? 0), 0)
            const lastSet = ex.sets[ex.sets.length - 1]
            const aim = !timed ? aimLabel(ex.sets) : null
            const nextOpen = ex.sets.findIndex((s) => !s.done)
            const paired = linkedToNext(active.exercises, exIndex)
            const inSuperset = paired || linkedToNext(active.exercises, exIndex - 1)
            const ssColor = inSuperset ? supersetColor(active.exercises, paired ? exIndex : exIndex - 1) : undefined
            return (
              <Card
                as="li"
                key={keyOf(ex, `${ex.exerciseId}-${exIndex}`)}
                {...reorder.itemProps(exIndex)}
                style={inSuperset ? { borderLeftColor: ssColor } : undefined}
                className={`scroll-mt-24 p-3 ${inSuperset ? 'border-l-4' : ''}`}
              >
                <div {...reorder.handleProps(exIndex)} className={`mb-2.5 flex items-start gap-2 ${HOLD_HANDLE_CLASS}`}>
                  <Icon name="grip" size={18} className="mt-0.5 -ml-1 shrink-0 text-[var(--color-fg-muted)]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="line-clamp-2 text-base font-semibold leading-tight">{ex.name}</h2>
                      <Badge color={MUSCLE_COLORS[ex.muscle]}>{ex.muscle}</Badge>
                      {inSuperset ? <Badge color={ssColor ?? '#a78bfa'}>Superset</Badge> : null}
                    </div>
                    {timed && (ex.targetDurationSec || totalSec > 0) ? (
                      <p className="tabular mt-0.5 text-sm font-semibold text-brand-400">
                        {ex.targetDurationSec ? `Aim: ${fmtTargetDuration(ex.targetDurationSec)}` : ''}
                        {ex.targetDurationSec && totalSec > 0 ? ' · ' : ''}
                        {totalSec > 0
                          ? `Done so far: ${fmtStopwatch(totalSec)}${totalKm > 0 ? ` · ${fmtDistance(totalKm, unit)}` : ''}`
                          : ''}
                      </p>
                    ) : null}
                    {aim ? (
                      <p className="tabular mt-0.5 text-sm font-semibold text-brand-400">
                        {aim}
                        {ex.restSec && profile.restFollowsPlan && profile.restTimer === true
                          ? ` · Rest ${fmtClock(ex.restSec)}`
                          : ''}
                      </p>
                    ) : null}
                    {last ? (
                      <p className="tabular mt-0.5 text-sm text-[var(--color-fg-muted)]">
                        Last time:{' '}
                        {last.sets
                          .slice(0, 4)
                          .map((s) =>
                            timed
                              ? `${fmtStopwatch(s.durationSec ?? 0)}${s.distanceKm ? ` · ${fmtDistance(s.distanceKm, unit)}` : ''}`
                              : ex.tracksWeight
                                ? `${fmtWeight(s.weightKg, unit, false)}×${s.reps}`
                                : `${s.reps}`
                          )
                          .join(timed ? ', ' : ' · ')}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-sm text-[var(--color-fg-muted)]">
                        New for you. Start light and see how it feels.
                      </p>
                    )}
                    {overload ? (
                      <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-go-500/15 px-1.5 py-0.5 text-sm font-bold text-go-400">
                        <Icon name="trending" size={14} />
                        You hit the top of your target last time. Try adding {step(unit)} {unit}.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0">
                    <IconButton
                      icon="arrow-up"
                      label={`Move ${ex.name} up`}
                      disabled={exIndex === 0}
                      onClick={() => moveExercise(exIndex, exIndex - 1)}
                    />
                    <IconButton
                      icon="arrow-down"
                      label={`Move ${ex.name} down`}
                      disabled={exIndex === active.exercises.length - 1}
                      onClick={() => moveExercise(exIndex, exIndex + 1)}
                    />
                  </div>
                </div>

                <LogModeToggle
                  size="sm"
                  label={`Log ${ex.name} by`}
                  value={logModeOf(ex)}
                  onChange={(mode) => setLogMode(exIndex, mode)}
                />

                {!timed ? (
                  <div
                    aria-hidden="true"
                    className="mt-2.5 flex items-end gap-1.5 px-2 text-xs font-semibold leading-tight text-[var(--color-fg-muted)]"
                  >
                    <span className="w-8 shrink-0 text-center">Set</span>
                    <span className="min-w-0 flex-1 text-center">
                      {ex.tracksWeight
                        ? dumbbell
                          ? `Weight (${unit}) per dumbbell`
                          : `Weight (${unit})`
                        : `Extra weight (${unit}), optional`}
                    </span>
                    <span className="w-16 shrink-0 text-center">Reps</span>
                    <span className="w-11 shrink-0 text-center">More</span>
                    <span className="w-11 shrink-0 text-center">Done</span>
                  </div>
                ) : null}

                <ul className="mt-1.5 flex flex-col gap-1.5">
                  {ex.sets.map((set, setIndex) => {
                    const setKey = keyOf(set, `${setIndex}`)
                    return timed ? (
                      <TimedSetRow
                        key={setKey}
                        index={setIndex}
                        set={set}
                        cardioFields={ex.cardioFields}
                        placeholders={timedPlaceholders(ex, setIndex, lastFull)}
                        onChange={(setPatch) =>
                          updateExercise(exIndex, (e) => ({
                            ...e,
                            sets: e.sets.map((s, i) =>
                              i === setIndex ? dropUndefined({ ...s, ...setPatch }) : s
                            ),
                          }))
                        }
                        onStop={(durationSec) =>
                          toggleSetDone(exIndex, setIndex, { durationSec, timerStartedAt: undefined }, 'done')
                        }
                        onToggleDone={() => toggleSetDone(exIndex, setIndex)}
                        onAutoDone={() => toggleSetDone(exIndex, setIndex, undefined, 'done')}
                        onRemove={() => removeSet(exIndex, setIndex)}
                      />
                    ) : (
                      <SetRow
                        key={setKey}
                        index={setIndex}
                        set={set}
                        tracksWeight={ex.tracksWeight}
                        suggestion={repSuggestion(ex, setIndex, last?.sets)}
                        targetReps={set.targetReps}
                        showSuggestionHint={setIndex === nextOpen}
                        onChange={(setPatch) =>
                          updateExercise(exIndex, (e) => ({
                            ...e,
                            sets: e.sets.map((s, i) =>
                              i === setIndex ? dropUndefined({ ...s, ...setPatch }) : s
                            ),
                          }))
                        }
                        onToggleDone={(override) => toggleSetDone(exIndex, setIndex, override)}
                        onRemove={() => removeSet(exIndex, setIndex)}
                      />
                    )
                  })}
                </ul>

                {ex.notes !== undefined ? (
                  <>
                    <label htmlFor={`notes-${keyOf(ex, String(exIndex))}`} className="mt-2 block text-sm font-semibold">
                      Notes for {ex.name}
                    </label>
                    <textarea
                      id={`notes-${keyOf(ex, String(exIndex))}`}
                      rows={2}
                      value={ex.notes}
                      onChange={(e) => updateExercise(exIndex, (x) => ({ ...x, notes: e.target.value }))}
                      placeholder="Seat height, how it felt…"
                      className="mt-1 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] p-2.5 text-sm outline-none placeholder:text-[var(--color-fg-muted)] focus:border-brand-500"
                    />
                  </>
                ) : null}

                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => askSwap(exIndex)} className={CHIP}>
                    <Icon name="rotate" size={14} /> Swap
                  </button>
                  <ExerciseGuide exerciseId={ex.exerciseId} name={ex.name} chipClass={CHIP} />
                  {last ? (
                    <button type="button" onClick={() => copyLastTime(exIndex)} className={CHIP}>
                      <Icon name="copy" size={14} /> Copy last time
                    </button>
                  ) : null}
                  {ex.tracksWeight && !timed && usesPlates(ex) ? (
                    <button
                      type="button"
                      onClick={() =>
                        setPlatesFor(ex.sets.find((s) => !s.warmup)?.weightKg ?? ex.sets[0]?.weightKg ?? 0)
                      }
                      className={CHIP}
                    >
                      <Icon name="calculator" size={14} /> Plate math
                    </button>
                  ) : null}
                  {exIndex < active.exercises.length - 1 ? (
                    <button type="button" onClick={() => toggleSuperset(exIndex)} className={CHIP}>
                      <Icon name="link" size={14} />
                      {paired ? 'Split superset' : 'Superset with next'}
                    </button>
                  ) : null}
                  {ex.notes === undefined ? (
                    <button
                      type="button"
                      onClick={() => updateExercise(exIndex, (x) => ({ ...x, notes: '' }))}
                      className={CHIP}
                    >
                      <Icon name="note" size={14} /> Note
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => askRemoveExercise(exIndex)}
                    aria-label={`Remove ${ex.name}`}
                    className={`${CHIP} !text-rose-400 hover:!border-rose-500`}
                  >
                    <Icon name="trash" size={14} /> Remove
                  </button>
                </div>

                {timed && lastSet?.done ? (
                  <button
                    type="button"
                    onClick={() => addSet(exIndex)}
                    className="mt-2 flex min-h-12 w-full items-center justify-center gap-1.5 rounded-xl
                      bg-brand-500 text-sm font-bold text-ink-950 transition-colors duration-200
                      hover:bg-brand-400"
                  >
                    <Icon name="plus" size={18} />
                    Add another set
                  </button>
                ) : (
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
                )}
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

      <Button size="lg" variant="go" full icon="check" onClick={requestFinish}>
        Finish workout
      </Button>

      <ExercisePicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={addExercises} />
      <ExercisePicker
        open={swapIndex !== null}
        onClose={() => setSwapIndex(null)}
        onPick={swapPicked}
        swapFor={swapIndex !== null ? active.exercises[swapIndex]?.name : undefined}
      />
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
        open={unfinishedOpen}
        onClose={() => setUnfinishedOpen(false)}
        title="Some sets aren’t ticked"
        footer={
          <div className="flex flex-col gap-2">
            <Button
              variant="go"
              full
              onClick={() => {
                save((prev) => (prev ? { ...prev, exercises: completeUnfinished(prev.exercises) } : prev))
                setUnfinishedOpen(false)
                setFinishOpen(true)
              }}
            >
              Save them as done
            </Button>
            <Button
              variant="secondary"
              full
              onClick={() => {
                setUnfinishedOpen(false)
                setFinishOpen(true)
              }}
            >
              Leave them out
            </Button>
          </div>
        }
      >
        <p className="text-[var(--color-fg-muted)]">
          You typed numbers for these but didn’t tap the tick, so they wouldn’t be saved:
        </p>
        <ul className="mt-3 flex flex-col gap-1.5">
          {unfinished.map((u) => (
            <li key={u.name} className="flex items-center justify-between gap-3 rounded-xl bg-[var(--color-surface-2)] px-3 py-2.5">
              <span className="min-w-0 truncate font-semibold">{u.name}</span>
              <span className="tabular shrink-0 text-sm text-[var(--color-fg-muted)]">
                {u.count} {u.count === 1 ? 'set' : 'sets'}
              </span>
            </li>
          ))}
        </ul>
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
              {saveError ? 'Try again' : 'Save workout'}
            </Button>
          </div>
        }
      >
        <dl className="grid grid-cols-2 gap-3 text-center">
          {[
            { label: 'Time', value: fmtMinutes(finishStats?.durationSec ?? elapsed) },
            { label: 'Sets done', value: String(setsDone) },
            { label: 'Total lifted', value: fmtVolume(volume, unit) },
            { label: 'Energy burned', value: `~${finishStats?.kcal ?? 0} kcal (estimate)` },
          ].map((item) => (
            <div key={item.label} className="rounded-xl bg-[var(--color-surface-2)] p-3">
              <dt className="text-xs font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">
                {item.label}
              </dt>
              <dd className="tabular mt-1 font-display text-xl font-semibold leading-tight">{item.value}</dd>
            </div>
          ))}
        </dl>
        {usingDefaultWeight ? (
          <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
            Based on {DEFAULT_BODY_WEIGHT_KG} kg. Add your weight in Body for a better estimate.
          </p>
        ) : null}
        {proofBattles.length > 0 ? (
          <div className="mt-4 rounded-xl border border-[var(--color-line)] p-3">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Icon name="camera" size={16} className="text-go-400" />
              Add proof for {proofBattles.length} {proofBattles.length === 1 ? 'battle' : 'battles'}
            </p>
            <p className="mb-3 mt-0.5 text-sm text-[var(--color-fg-muted)]">
              {proofBattles.map((c) => c.title).join(' · ')}. Without a photo this workout won’t count there.
            </p>
            <PhotoCapture value={proofPhoto} onChange={setProofPhoto} />
          </div>
        ) : null}
        <label className="mt-4 flex min-h-11 cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={saveAsRoutine}
            onChange={(e) => setSaveAsRoutine(e.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-[var(--color-brand-500)]"
          />
          <span>
            <span className="block font-semibold">Save this workout to reuse later</span>
            <span className="block text-[var(--color-fg-muted)]">
              It will show up under My routines on the Train tab.
            </span>
          </span>
        </label>
        {saveError ? (
          <p role="alert" className="mt-3 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">
            {saveError}
          </p>
        ) : null}
      </Sheet>

      <ConfirmSheet
        open={removeAsk !== null}
        title="Remove this exercise?"
        message={`You’ve already logged sets for ${removeAsk !== null ? (active.exercises[removeAsk]?.name ?? 'it') : 'it'}. They’ll be removed too, but you can tap Undo right after.`}
        confirmLabel="Remove"
        onCancel={() => setRemoveAsk(null)}
        onConfirm={() => {
          if (removeAsk !== null) removeExercise(removeAsk)
          setRemoveAsk(null)
        }}
      />


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
