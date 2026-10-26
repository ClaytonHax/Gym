import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, type IconName } from '../components/Icon'
import { Button, Card, ConfirmSheet, IconButton, Sheet, Spinner, Toggle } from '../components/ui'
import { ExercisePicker } from '../components/ExercisePicker'
import { PhotoCapture } from '../components/proofs'
import { PlateCalculator } from '../components/PlateCalculator'
import { StartScreen } from './StartScreen'
import { REST_PRESETS, fmtPreset, useRestTimer } from '../components/RestTimer'
import { LogModeToggle } from '../components/LogModeToggle'
import { LessonTopBar } from '../components/train/LessonTopBar'
import { ExerciseRail } from '../components/train/ExerciseRail'
import { ExerciseFocus } from '../components/train/ExerciseFocus'
import { LogBar, type Feedback } from '../components/train/LogBar'
import { UpNext } from '../components/train/UpNext'
import { FinishFlow } from '../components/train/FinishFlow'
import { shownValues } from '../components/train/setValues'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useSocial } from '../contexts/SocialContext'
import { useToast } from '../contexts/ToastContext'
import { useActiveWorkout } from '../hooks/useActiveWorkout'
import { useBodyLog } from '../hooks/useBodyLog'
import { usePlans } from '../hooks/usePlans'
import { useRoutines } from '../hooks/useRoutines'
import { useWorkouts } from '../hooks/useWorkouts'
import { useXp } from '../hooks/useXp'
import { inBattleRange, postProof } from '../hooks/useChallengeProofs'
import { isDumbbellExercise, usesPlates } from '../data/exercises'
import { dayKey, fmtDuration } from '../lib/date'
import type { PhotoSvg } from '../lib/photoSvg'
import { challengeState } from '../lib/social'
import { fmtDuration as fmtStopwatch, isTimed, logModeOf } from '../lib/logMode'
import { fmtVolume, fmtWeight } from '../lib/units'
import { DEFAULT_BODY_WEIGHT_KG, estimateCalories } from '../lib/calories'
import { stripUndefined } from '../lib/clean'
import { haptic } from '../lib/haptics'
import { XP_RULES, exercisesXp, levelFor, setXp } from '../lib/xp'
import { dailyQuests, todayQuestStats } from '../lib/quests'
import { computeStreaks } from '../lib/streaks'
import {
  completeUnfinished,
  emptySet,
  keyOf,
  lastSetsFull,
  needsKeys,
  newKey,
  sessionDurationSec,
  stripKeys,
  swapExercise,
  toWorkoutExercise,
  unfinishedSummary,
  withKeys,
} from '../lib/workoutExercise'
import {
  bestDurationByExercise,
  completedSetCount,
  estimate1rm,
  lastPerformance,
  volumeOf,
} from '../lib/stats'
import { linkedToNext, moveItem, newSupersetId, supersetColor, toggleSupersetWithNext } from '../lib/supersets'
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

/** One exercise counts as finished once every set on it is ticked. */
const exerciseDone = (ex: WorkoutExercise) => ex.sets.length > 0 && ex.sets.every((s) => s.done)

/** Stable key for an exercise card (falls back to position for sessions saved before keys existed). */
const exKeyOf = (ex: WorkoutExercise, i: number) => keyOf(ex, `${ex.exerciseId}-${i}`)

/** Exercises whose best done working set beats the all-time record (a first-ever session has nothing to beat). */
function countSessionPrs(exercises: WorkoutExercise[], records: Map<string, number>): number {
  let n = 0
  for (const ex of exercises) {
    const prior = records.get(ex.exerciseId)
    if (!ex.tracksWeight || isTimed(ex) || !prior) continue
    const best = Math.max(0, ...ex.sets.filter((s) => s.done && !s.warmup).map((s) => estimate1rm(s.weightKg, s.reps)))
    if (best > prior + 0.01) n++
  }
  return n
}

function MenuRow({
  icon,
  label,
  onClick,
  danger,
  disabled,
}: {
  icon: IconName
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-12 w-full flex-1 items-center gap-3 rounded-xl bg-[var(--color-surface-2)] px-3.5 text-left font-semibold
        transition-colors duration-200 active:scale-[0.99] disabled:opacity-40 ${danger ? 'text-rose-400' : ''}`}
    >
      <Icon name={icon} size={18} className={danger ? '' : 'text-[var(--color-fg-muted)]'} />
      {label}
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* Active screen                                                               */
/* -------------------------------------------------------------------------- */

export function WorkoutActive() {
  const navigate = useNavigate()
  const toast = useToast()
  const { profile, update: updateProfile } = useSettings()
  const unit = profile.unit
  const { active, save, hydrated } = useActiveWorkout()
  const { user } = useAuth()
  const { challenges } = useSocial()
  const { workouts, saveWorkout } = useWorkouts()
  const { saveRoutine } = useRoutines()
  const { latest: latestBody } = useBodyLog()
  const { activeState, isRestDay } = usePlans()
  const xp = useXp()
  const records = xp.records
  const rest = useRestTimer()

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
  // Workout-level and per-exercise option sheets.
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuFor, setMenuFor] = useState<number | null>(null)
  // Focus follows the exercise's key, so reordering or removing others never moves it.
  const [focusKey, setFocusKey] = useState<string | null>(null)
  // A done set that's been reopened for editing.
  const [editing, setEditing] = useState<{ exKey: string; setKey: string } | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [confetti, setConfetti] = useState<{ key: number; intensity: 'small' | 'big' }>({ key: 0, intensity: 'small' })
  const feedbackId = useRef(0)
  const activeRef = useRef<ActiveWorkout | null>(null)
  const focusKeyRef = useRef<string | null>(null)
  const advanceTimer = useRef<number | undefined>(undefined)
  const repsRef = useRef<HTMLDivElement>(null)
  const scrolledFor = useRef<string | null>(null)
  activeRef.current = active ?? null

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

  useEffect(() => () => window.clearTimeout(advanceTimer.current), [])

  const bestDurations = useMemo(() => bestDurationByExercise(workouts), [workouts])

  const exs = active?.exercises ?? []
  const totalSets = exs.reduce((n, e) => n + e.sets.length, 0)
  const doneSets = exs.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0)
  const volume = useMemo(() => (active ? volumeOf(active.exercises) : 0), [active])
  const setsDone = useMemo(() => (active ? completedSetCount(active.exercises) : 0), [active])

  // Where the lesson is: the focused exercise, defaulting to the first one not finished.
  const firstOpen = exs.findIndex((e) => !exerciseDone(e))
  const byKey = focusKey ? exs.findIndex((e, i) => exKeyOf(e, i) === focusKey) : -1
  const focusIdx = byKey >= 0 ? byKey : firstOpen >= 0 ? firstOpen : Math.max(0, exs.length - 1)
  const ex: WorkoutExercise | undefined = exs[focusIdx]
  const focusedKey = ex ? exKeyOf(ex, focusIdx) : null
  focusKeyRef.current = focusedKey

  // Pin the default so finishing an exercise doesn't yank focus before the celebration.
  useEffect(() => {
    if (focusedKey && focusedKey !== focusKey) setFocusKey(focusedKey)
  }, [focusedKey, focusKey])

  // Glide the focus card into view when focus moves (not on first paint).
  useEffect(() => {
    if (!focusedKey) return
    const first = scrolledFor.current === null
    scrolledFor.current = focusedKey
    if (first) return
    const card = document.querySelector('[data-focus-card]')
    if (!card) return
    const top = card.getBoundingClientRect().top
    if (top > 80 && top < window.innerHeight * 0.5) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }, [focusedKey])

  const focusedId = ex?.exerciseId
  const last = useMemo(() => (focusedId ? lastPerformance(workouts, focusedId) : null), [workouts, focusedId])
  const lastFull = useMemo(
    () => (focusedId && ex && isTimed(ex) ? lastSetsFull(workouts, focusedId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workouts, focusedId, ex && isTimed(ex)]
  )

  // Session XP shown live in the top bar (the finish bonus is added on the lesson-complete screen).
  const prsThisSession = useMemo(() => (active ? countSessionPrs(active.exercises, records) : 0), [active, records])
  const sessionXp = useMemo(
    () => (active ? exercisesXp(active.exercises, prsThisSession) : 0),
    [active, prsThisSession]
  )

  // Body weight for the calorie estimate; say so when we had to guess.
  const bodyKg = latestBody?.weightKg ?? DEFAULT_BODY_WEIGHT_KG
  const usingDefaultWeight = !latestBody?.weightKg
  const finishStats = useMemo(() => {
    if (!active || !finishOpen) return null
    const durationSec = sessionDurationSec(active.startedAt, active.exercises)
    return { durationSec, kcal: estimateCalories({ exercises: active.exercises, durationSec }, bodyKg) }
    // elapsed ticks every second so the wall-clock part stays current while the screen is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, finishOpen, bodyKg, elapsed])

  const streakStats = useMemo(
    () =>
      computeStreaks(workouts, {
        isRestDay,
        planStartDate: activeState?.startDate,
        weeklyGoal: profile.weeklyGoal,
      }),
    [workouts, isRestDay, activeState?.startDate, profile.weeklyGoal]
  )

  // Quests as they'll stand once this workout is saved, so "Finish a workout" shows as done.
  const finishQuests = useMemo(() => {
    if (!active || !finishOpen) return []
    const stats = todayQuestStats(workouts, xp.byWorkout, xp.prsByWorkout, {
      exercises: active.exercises,
      startedAt: active.startedAt,
      xp: sessionXp + XP_RULES.finish,
    })
    return dailyQuests(dayKey(), { ...stats, workouts: stats.workouts + 1, prs: stats.prs + prsThisSession })
  }, [active, finishOpen, workouts, xp.byWorkout, xp.prsByWorkout, sessionXp, prsThisSession])

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

  function focusExercise(index: number) {
    const target = activeRef.current?.exercises[index]
    if (!target) return
    window.clearTimeout(advanceTimer.current)
    setEditing(null)
    setFocusKey(exKeyOf(target, index))
  }

  /** Next exercise with sets left, looking forward from `from` and wrapping around. */
  function nextOpenAfter(list: WorkoutExercise[], from: number): number {
    for (let k = 1; k < list.length; k++) {
      const i = (from + k) % list.length
      if (!exerciseDone(list[i])) return i
    }
    return -1
  }

  function addExercises(picked: Exercise[]) {
    patch((draft) => ({
      ...draft,
      exercises: [...draft.exercises, ...picked.map(toWorkoutExercise)],
    }))
  }

  function addSet(index: number) {
    // New sets start empty; the previous numbers show as greyed suggestions instead of real values.
    updateExercise(index, (ex) => ({ ...ex, sets: [...ex.sets, emptySet()] }))
    setEditing(null)
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
    setEditing(null)
    toast(mode === 'time' ? `Logging ${ex.name} by time` : `Logging ${ex.name} by weight and reps`)
  }

  function showFeedback(text: string, tone: Feedback['tone'], icon: IconName) {
    feedbackId.current += 1
    setFeedback({ id: feedbackId.current, text, tone, icon })
  }

  function burst(intensity: 'small' | 'big') {
    setConfetti((c) => ({ key: c.key + 1, intensity }))
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
    if (!active || !ex || !cur) return
    if (mode === 'done' && cur.done) return
    const wasDone = cur.done
    updateExercise(exIndex, (e) => ({
      ...e,
      sets: e.sets.map((s, i) =>
        i === setIndex ? dropUndefined({ ...s, ...override, done: mode === 'done' ? true : !s.done }) : s
      ),
    }))
    if (wasDone) return

    const set = { ...cur, ...override }
    haptic(15)
    const completes = ex.sets.every((s, i) => i === setIndex || s.done)
    let earned = setXp({ done: true, warmup: set.warmup })
    let pr = false

    if (!set.warmup && isTimed(ex)) {
      // Timed sets: no 1RM — just a nod when it's the longest ever.
      const prior = bestDurations.get(ex.exerciseId)
      if (prior && (set.durationSec ?? 0) > prior) toast(`New longest ${ex.name} session!`)
    } else if (!set.warmup) {
      // Live PR check against history — a first-ever session has nothing to beat. One PR per exercise.
      const prior = records.get(ex.exerciseId)
      const beats = (w: number, r: number) => estimate1rm(w, r) > (prior ?? 0) + 0.01
      pr =
        ex.tracksWeight &&
        Boolean(prior) &&
        beats(set.weightKg, set.reps) &&
        !ex.sets.some((s, i) => i !== setIndex && s.done && !s.warmup && beats(s.weightKg, s.reps))
    }
    if (pr) earned += XP_RULES.pr
    if (completes) earned += XP_RULES.exercise

    if (pr) {
      showFeedback(`New PR on ${ex.name}! +${earned} XP`, 'xp', 'trophy')
      burst('big')
    } else if (completes) {
      showFeedback(`Exercise complete! +${earned} XP`, 'go', 'check')
      burst('small')
    } else {
      showFeedback(set.warmup ? `Warm-up done +${earned} XP` : `Nice set! +${earned} XP`, 'go', 'zap')
    }

    // Supersets alternate: hop to the partner while it has sets left. Otherwise a finished
    // exercise celebrates, then focus moves on.
    const list = active.exercises
    const group = ex.supersetId ? list.map((e, i) => (e.supersetId === ex.supersetId ? i : -1)).filter((i) => i >= 0) : []
    const partner = group.length > 1
      ? [...group.slice(group.indexOf(exIndex) + 1), ...group.slice(0, group.indexOf(exIndex))].find((i) =>
          list[i].sets.some((s) => !s.done)
        )
      : undefined
    const myKey = exKeyOf(ex, exIndex)
    if (partner !== undefined) {
      focusExercise(partner)
    } else if (completes) {
      setEditing(null)
      window.clearTimeout(advanceTimer.current)
      advanceTimer.current = window.setTimeout(() => {
        const latest = activeRef.current?.exercises ?? []
        if (focusKeyRef.current !== myKey) return
        const from = latest.findIndex((e, i) => exKeyOf(e, i) === myKey)
        const next = from >= 0 ? nextOpenAfter(latest, from) : -1
        if (next >= 0) focusExercise(next)
      }, 700)
    }

    if (set.warmup) return

    // Superset partners go back-to-back; rest only after the last exercise in the group.
    const next = list[exIndex + 1]
    const mid = Boolean(ex.supersetId) && next?.supersetId === ex.supersetId
    if (!mid && !skipsRest(ex) && profile.restTimer === true) {
      rest.start(profile.restFollowsPlan ? ex.restSec : undefined)
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
    setEditing(null)
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
    setEditing(null)
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

  const allDone = exs.length > 0 && firstOpen === -1
  const menuEx = menuFor !== null ? exs[menuFor] : undefined
  const timed = ex ? isTimed(ex) : false
  const complete = ex ? exerciseDone(ex) : false

  // Which set the big panel is on: a done set being edited, else the first one left.
  const editIdx =
    ex && editing && editing.exKey === focusedKey
      ? ex.sets.findIndex((s, i) => s.done && keyOf(s, String(i)) === editing.setKey)
      : -1
  const openIdx = ex ? ex.sets.findIndex((s) => !s.done) : -1
  const panelIdx = !ex || timed ? -1 : editIdx >= 0 ? editIdx : openIdx
  const isEditing = editIdx >= 0 && !timed

  const next = ex ? nextOpenAfter(exs, focusIdx) : -1
  const nextEx = next >= 0 ? exs[next] : undefined

  const paired = ex ? linkedToNext(exs, focusIdx) : false
  const inSuperset = ex ? paired || linkedToNext(exs, focusIdx - 1) : false
  const ssColor = inSuperset ? supersetColor(exs, paired ? focusIdx : focusIdx - 1) : undefined
  const overload = ex && last && !timed ? hitTopOfRange(ex, last.sets) : false

  function focusRepsField() {
    repsRef.current?.querySelector<HTMLButtonElement>('button[aria-label$="tap to type"]')?.click()
  }

  /** The one big button: whatever the next sensible action is. */
  function logBar(): { label: string; tone: 'go' | 'brand' | 'xp'; onPress: () => void } {
    if (!ex) return { label: 'Add exercise', tone: 'brand', onPress: () => setPickerOpen(true) }
    if (!isEditing && allDone) return { label: 'Finish workout 🏆', tone: 'xp', onPress: requestFinish }
    if (ex.sets.length === 0) return { label: 'Add a set', tone: 'brand', onPress: () => addSet(focusIdx) }
    if (!isEditing && complete) {
      return { label: 'Next exercise →', tone: 'brand', onPress: () => (next >= 0 ? focusExercise(next) : undefined) }
    }

    if (timed) {
      const set = ex.sets[openIdx]
      if (set.timerStartedAt) {
        return {
          label: 'Stop & log',
          tone: 'go',
          onPress: () => {
            const secs = Math.max(0, Math.floor((Date.now() - new Date(set.timerStartedAt as string).getTime()) / 1000))
            toggleSetDone(focusIdx, openIdx, { durationSec: secs, timerStartedAt: undefined }, 'done')
          },
        }
      }
      if ((set.durationSec ?? 0) > 0) {
        return {
          label: `Log ${fmtStopwatch(set.durationSec ?? 0)}`,
          tone: 'go',
          onPress: () => toggleSetDone(focusIdx, openIdx, undefined, 'done'),
        }
      }
      return {
        label: 'Start timer',
        tone: 'go',
        onPress: () =>
          updateExercise(focusIdx, (e) => ({
            ...e,
            sets: e.sets.map((s, i) =>
              i === openIdx ? { ...s, timerStartedAt: new Date(Date.now() - (s.durationSec ?? 0) * 1000).toISOString() } : s
            ),
          })),
      }
    }

    const v = shownValues(ex, panelIdx, last?.sets)
    if (isEditing) {
      return {
        label: `Update set ${panelIdx + 1}`,
        tone: 'go',
        onPress: () => {
          setEditing(null)
          showFeedback(`Set ${panelIdx + 1} updated`, 'go', 'check')
        },
      }
    }
    if (v.reps <= 0) return { label: 'Set your reps', tone: 'go', onPress: focusRepsField }
    const w = fmtWeight(v.weightKg, unit)
    const what = ex.tracksWeight
      ? `${w} × ${v.reps}`
      : v.weightKg > 0
        ? `+${w} × ${v.reps}`
        : `${v.reps} ${v.reps === 1 ? 'rep' : 'reps'}`
    const prefix = ex.sets[panelIdx].warmup ? 'Log warm-up' : `Log set ${panelIdx + 1}`
    return {
      label: ex.tracksWeight || v.weightKg > 0 ? `${prefix} · ${what}` : `Log ${what}`,
      tone: 'go',
      onPress: () => toggleSetDone(focusIdx, panelIdx, { reps: v.reps, weightKg: v.weightKg }),
    }
  }

  const bar = logBar()
  const planDay =
    active.planDayName && active.planDayIndex !== undefined
      ? `Day ${active.planDayIndex + 1}${active.planCycle && active.planCycle > 1 ? ` · Round ${active.planCycle}` : ''}`
      : undefined

  const finishDuration = finishStats?.durationSec ?? elapsed
  const levelAfter = levelFor(xp.total + sessionXp + XP_RULES.finish)
  const streakExtends = !streakStats.todayDone
  // A planned rest day already counts toward a plan streak, so training on one doesn't grow it.
  const planExtends = streakExtends && !isRestDay?.(dayKey())
  const streakNow =
    streakStats.mode === 'plan'
      ? { current: streakStats.current + (planExtends ? 1 : 0), extends: planExtends }
      : {
          // Weekly mode only grows on the workout that reaches the goal.
          current: streakStats.current + (streakExtends && streakStats.workoutsThisWeek + 1 === streakStats.weeklyGoal ? 1 : 0),
          extends: streakExtends && streakStats.workoutsThisWeek + 1 === streakStats.weeklyGoal,
        }

  return (
    <>
      <div className="animate-rise flex flex-col gap-4 pb-48">
        <LessonTopBar
          name={active.name}
          renaming={renaming}
          onNameChange={(name) => patch((d) => ({ ...d, name }))}
          onRenameStart={() => setRenaming(true)}
          onRenameEnd={() => setRenaming(false)}
          dayLabel={planDay}
          doneSets={doneSets}
          totalSets={totalSets}
          sessionXp={sessionXp}
          stats={`${fmtDuration(elapsed)} · ${setsDone} ${setsDone === 1 ? 'set' : 'sets'} · ${fmtVolume(volume, unit)}`}
          onLeave={() => navigate('/')}
          onMenu={() => setMenuOpen(true)}
        />

        <Kill2Banner active={active} />

        {exs.length > 0 ? (
          <ExerciseRail exercises={exs} focusIdx={focusIdx} onFocus={focusExercise} onAdd={() => setPickerOpen(true)} />
        ) : null}

        {ex ? (
          <ExerciseFocus
            key={focusedKey ?? undefined}
            ex={ex}
            unit={unit}
            dumbbell={isDumbbellExercise({ exerciseId: ex.exerciseId, name: ex.name })}
            last={last ?? undefined}
            lastFull={lastFull}
            timed={timed}
            overload={overload}
            showPlanRest={Boolean(profile.restFollowsPlan) && profile.restTimer === true}
            superset={inSuperset ? { color: ssColor } : undefined}
            panelIndex={panelIdx}
            editing={isEditing}
            repsRef={repsRef}
            onMenu={() => setMenuFor(focusIdx)}
            onSetChange={(setIndex, p) =>
              updateExercise(focusIdx, (e) => ({
                ...e,
                sets: e.sets.map((s, i) => (i === setIndex ? dropUndefined({ ...s, ...p }) : s)),
              }))
            }
            onEditSet={(setIndex) =>
              setEditing({ exKey: focusedKey ?? '', setKey: keyOf(ex.sets[setIndex], String(setIndex)) })
            }
            onUnlog={(setIndex) => {
              toggleSetDone(focusIdx, setIndex)
              setEditing(null)
            }}
            onRemoveSet={(setIndex) => removeSet(focusIdx, setIndex)}
            onAddSet={() => addSet(focusIdx)}
            onNotes={(text) => updateExercise(focusIdx, (x) => ({ ...x, notes: text }))}
            onToggleDone={(setIndex, override, mode) => toggleSetDone(focusIdx, setIndex, override, mode)}
          />
        ) : (
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
        )}

        {ex ? (
          <UpNext
            next={nextEx ? { ex: nextEx, index: next } : undefined}
            onFocusNext={() => focusExercise(next)}
            onAdd={() => setPickerOpen(true)}
            notes={active.notes}
          />
        ) : null}

        <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Workout">
          <div className="flex flex-col gap-1.5">
            <MenuRow
              icon="pencil"
              label="Rename workout"
              onClick={() => {
                setMenuOpen(false)
                setRenaming(true)
              }}
            />
            <MenuRow
              icon="note"
              label="Workout notes"
              onClick={() => {
                setMenuOpen(false)
                setNotesOpen(true)
              }}
            />

            <div className="my-1.5 rounded-xl bg-[var(--color-surface-2)] p-3.5">
              <Toggle
                checked={profile.restTimer === true}
                onChange={(on) => {
                  void updateProfile({ restTimer: on })
                  if (!on) rest.stop()
                }}
                label="Rest timer"
                description="Starts by itself after each strength set."
              />
              {profile.restTimer === true ? (
                <>
                  <div role="group" aria-label="Rest length" className="mt-3 grid grid-cols-4 gap-1.5">
                    {REST_PRESETS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => rest.choose(p)}
                        aria-pressed={rest.duration === p}
                        className={`tabular min-h-11 rounded-lg text-sm font-bold transition-colors duration-200 ${
                          rest.duration === p
                            ? 'bg-brand-500 text-ink-950'
                            : 'bg-[var(--color-surface)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'
                        }`}
                      >
                        {fmtPreset(p)}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      rest.start()
                      setMenuOpen(false)
                    }}
                    className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-surface)] text-sm font-bold hover:text-brand-400"
                  >
                    <Icon name="clock" size={16} />
                    Start rest now
                  </button>
                </>
              ) : null}
            </div>

            <MenuRow
              icon="check"
              label="Finish workout"
              onClick={() => {
                setMenuOpen(false)
                requestFinish()
              }}
            />
            <MenuRow
              icon="trash"
              label="Discard workout"
              danger
              onClick={() => {
                setMenuOpen(false)
                setDiscardOpen(true)
              }}
            />
          </div>
        </Sheet>

      <Sheet open={menuFor !== null} onClose={() => setMenuFor(null)} title={menuEx?.name ?? 'Exercise'}>
        {menuEx && menuFor !== null ? (
          <div className="flex flex-col gap-3">
            <div>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">Log by</p>
              <LogModeToggle
                size="sm"
                label={`Log ${menuEx.name} by`}
                value={logModeOf(menuEx)}
                onChange={(mode) => setLogMode(menuFor, mode)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <MenuRow
                icon="rotate"
                label="Swap exercise"
                onClick={() => {
                  const i = menuFor
                  setMenuFor(null)
                  askSwap(i)
                }}
              />
              {lastPerformance(workouts, menuEx.exerciseId) ? (
                <MenuRow
                  icon="copy"
                  label="Copy last time"
                  onClick={() => {
                    copyLastTime(menuFor)
                    setMenuFor(null)
                  }}
                />
              ) : null}
              {menuEx.tracksWeight && !isTimed(menuEx) && usesPlates(menuEx) ? (
                <MenuRow
                  icon="calculator"
                  label="Plate math"
                  onClick={() => {
                    setPlatesFor(menuEx.sets.find((s) => !s.warmup)?.weightKg ?? menuEx.sets[0]?.weightKg ?? 0)
                    setMenuFor(null)
                  }}
                />
              ) : null}
              {menuFor < active.exercises.length - 1 ? (
                <MenuRow
                  icon="link"
                  label={linkedToNext(active.exercises, menuFor) ? 'Split superset' : 'Superset with next'}
                  onClick={() => {
                    toggleSuperset(menuFor)
                    setMenuFor(null)
                  }}
                />
              ) : null}
              {menuEx.notes === undefined ? (
                <MenuRow
                  icon="note"
                  label="Add a note for today"
                  onClick={() => {
                    updateExercise(menuFor, (x) => ({ ...x, notes: '' }))
                    setMenuFor(null)
                  }}
                />
              ) : null}
              <div className="flex gap-1.5">
                <MenuRow
                  icon="arrow-up"
                  label="Move up"
                  disabled={menuFor === 0}
                  onClick={() => {
                    moveExercise(menuFor, menuFor - 1)
                    setMenuFor(menuFor - 1)
                  }}
                />
                <MenuRow
                  icon="arrow-down"
                  label="Move down"
                  disabled={menuFor === active.exercises.length - 1}
                  onClick={() => {
                    moveExercise(menuFor, menuFor + 1)
                    setMenuFor(menuFor + 1)
                  }}
                />
              </div>
              <MenuRow
                icon="trash"
                label="Remove exercise"
                danger
                onClick={() => {
                  const i = menuFor
                  setMenuFor(null)
                  askRemoveExercise(i)
                }}
              />
            </div>
          </div>
        ) : null}
      </Sheet>

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

      <FinishFlow
        open={finishOpen}
        onClose={() => setFinishOpen(false)}
        onSave={finish}
        saving={saving}
        saveError={saveError}
        stats={{
          durationSec: finishDuration,
          sets: setsDone,
          volumeLabel: fmtVolume(volume, unit),
          kcal: finishStats?.kcal ?? 0,
          usingDefaultWeight,
          defaultWeightKg: DEFAULT_BODY_WEIGHT_KG,
        }}
        xp={{
          session: sessionXp + XP_RULES.finish,
          prs: prsThisSession,
          levelBefore: xp.level,
          levelAfter,
        }}
        streak={{ current: streakNow.current, unit: streakStats.mode === 'plan' ? 'day' : 'week', extends: streakNow.extends }}
        quests={finishQuests}
        proofBattles={proofBattles.map((c) => ({ id: c.id, title: c.title }))}
        proofSlot={<PhotoCapture value={proofPhoto} onChange={setProofPhoto} />}
        saveAsRoutine={saveAsRoutine}
        onSaveAsRoutine={setSaveAsRoutine}
      />

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

      <LogBar
        label={bar.label}
        tone={bar.tone}
        onPress={bar.onPress}
        feedback={feedback}
        confetti={confetti}
        rest={{
          running: rest.running,
          remaining: rest.remaining,
          total: rest.total,
          onAddThirty: rest.addThirty,
          onSkip: rest.stop,
        }}
      />
    </>
  )
}
