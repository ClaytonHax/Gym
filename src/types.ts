export type Unit = 'kg' | 'lb'

/** How an exercise is logged: weight × reps (missing = 'reps') or by duration. */
export type LogMode = 'reps' | 'time'

/** Optional extra numbers a timed (cardio) exercise records per set. */
export type CardioField = 'distance' | 'speed' | 'incline' | 'level'

export type MuscleGroup =
  | 'Chest'
  | 'Back'
  | 'Shoulders'
  | 'Biceps'
  | 'Triceps'
  | 'Legs'
  | 'Glutes'
  | 'Core'
  | 'Cardio'
  | 'Other'

export interface Exercise {
  id: string
  name: string
  muscle: MuscleGroup
  equipment?: string
  /** Bodyweight / cardio moves are logged as reps or time only. */
  tracksWeight: boolean
  /** Default log mode when added to a session; cardio defaults to 'time'. */
  logBy?: LogMode
  /** Timed exercises: which extra fields to show per set (e.g. treadmill: speed + incline). */
  cardioFields?: CardioField[]
  /** Extra search terms, e.g. "cross trainer" for Elliptical. */
  aliases?: string[]
  custom?: boolean
}

export interface WorkoutSet {
  /** Always stored in kilograms; converted at the edges for display. */
  weightKg: number
  reps: number
  done: boolean
  /** Prescribed rep range for this set, e.g. "5-9" or "failure". Shown as a hint. */
  targetReps?: string
  /** Rate of perceived exertion, 6–10. */
  rpe?: number
  warmup?: boolean
  /** Timed sets only. */
  durationSec?: number
  /** Timed sets only; always stored in km, converted at the edges like weight. */
  distanceKm?: number
  /** ISO start of a running stopwatch on this set; cleared when it stops. */
  timerStartedAt?: string
  /** Timed sets only: machine resistance / level setting, e.g. bike level 8. */
  level?: number
  /** Timed sets only: average speed in km/h. */
  speedKmh?: number
  /** Timed sets only: incline in %. */
  inclinePct?: number
}

export interface WorkoutExercise {
  exerciseId: string
  name: string
  muscle: MuscleGroup
  tracksWeight: boolean
  logBy?: LogMode
  /** Per-set duration target carried from a plan (timed exercises); shown as a placeholder. */
  targetDurationSec?: number
  cardioFields?: CardioField[]
  sets: WorkoutSet[]
  notes?: string
  /** Prescribed rest after a working set; overrides the global rest preset. */
  restSec?: number
  /** Exercises sharing an id are a superset — done back-to-back with no rest between. */
  supersetId?: string
}

export interface Workout extends PlanTag {
  id: string
  name: string
  /** ISO timestamps — sortable as strings and safe to cache offline. */
  startedAt: string
  finishedAt?: string
  durationSec: number
  exercises: WorkoutExercise[]
  notes?: string
  /** Denormalised so history and charts never have to re-reduce every set. */
  totalVolumeKg: number
  setCount: number
  /** Estimated energy burned (lib/calories.ts); missing on older sessions. */
  caloriesKcal?: number
}

/** A workout still being performed — one per user, kept in Firestore + localStorage. */
export interface ActiveWorkout extends PlanTag {
  name: string
  startedAt: string
  exercises: WorkoutExercise[]
  notes?: string
}

export interface BodyEntry {
  id: string
  /** yyyy-mm-dd, one entry per day. */
  date: string
  weightKg: number
  bodyFatPct?: number
  notes?: string
}

export interface Profile {
  displayName: string
  unit: Unit
  theme: 'dark' | 'light' | 'system'
  heightCm?: number
  goalWeightKg?: number
  weeklyGoal: number
  /** Weekdays that are always rest (gym closed), 0 = Monday .. 6 = Sunday. */
  restWeekdays?: number[]
  /** Auto rest countdown after strength sets. Missing means on. */
  restTimer?: boolean
  /** Default rest length in seconds. */
  restSec?: number
  /** Let a plan's per-exercise rest replace `restSec`. Missing means off. */
  restFollowsPlan?: boolean
}

export interface PersonalRecord {
  exerciseId: string
  name: string
  muscle: MuscleGroup
  bestWeightKg: number
  bestReps: number
  estimated1rmKg: number
  date: string
}

/** One prescribed exercise in a program or routine. */
export interface PlanExercise {
  exerciseId: string
  name: string
  muscle: MuscleGroup
  tracksWeight: boolean
  logBy?: LogMode
  /** One rep-range target per set — its length is the set count. Empty for timed exercises (sets are open-ended). */
  targets: string[]
  /** Timed exercises: target duration per set. */
  targetDurationSec?: number
  cardioFields?: CardioField[]
  restSec?: number
  supersetId?: string
  /** Legacy routines saved before targets existed. */
  sets?: number
}

/** A reusable workout the user built or saved. */
export interface Routine {
  id: string
  name: string
  exercises: PlanExercise[]
  createdAt: string
}

/** yyyy-mm-dd local-day key (see lib/date.ts dayKey). */
export type DayKey = string

export type PlanDayKind = 'workout' | 'rest'

export interface PlanDay {
  /** Stable within the plan; React key, survives reordering. */
  id: string
  kind: PlanDayKind
  /** "Push 1"; "Rest" for rest days. */
  name: string
  focus?: string
  /** Empty for rest days. */
  exercises: PlanExercise[]
}

/** users/{uid}/plans/{id} */
export interface Plan {
  id: string
  name: string
  templateId?: string
  /** Id of this plan's copy in the public library (publicPlans/{id}), once published. */
  publishedId?: string
  /**
   * Set when the plan was copied from someone's published plan. `syncedAt` is the
   * source's updatedAt (ISO) this copy matches (missing on copies made before sync
   * existed); `customized` stops automatic updates once the user edits their copy.
   */
  sharedFrom?: { authorUid: string; publicPlanId: string; syncedAt?: string; customized?: boolean }
  days: PlanDay[]
  createdAt: string
  updatedAt: string
}

/** The slice of a Firestore Timestamp we read; null while a server timestamp is pending. */
export type FirestoreTime = { toMillis(): number } | null

/**
 * publicPlans/{id}. Authors are identified by uid only — usernames are always
 * resolved live from the profile. `starred`/`starOrder` are set by hand in the console.
 */
export interface PublicPlan {
  id: string
  authorUid: string
  name: string
  description?: string
  tagline?: string
  days: PlanDay[]
  createdAt: FirestoreTime
  updatedAt: FirestoreTime
  /** uid -> true for everyone who added it to their plans. */
  usedBy: Record<string, true>
  starred?: boolean
  starOrder?: number
}

/** A built-in, read-only plan the user copies and customises. */
export interface PlanTemplate {
  id: string
  name: string
  description: string
  /** "8-day cycle · 6 workouts · 2 rest" */
  tagline: string
  days: PlanDay[]
}

/**
 * A one-off change to a single date. 'delay' forces rest that day and pushes the
 * rest of the schedule back a day; 'skip' forces rest that day and drops its
 * workout without moving anything after it.
 */
export interface ScheduleAdjustment {
  date: DayKey
  type: 'delay' | 'skip'
}

/** users/{uid}/state/activePlan */
export interface ActivePlanState {
  planId: string
  /** Date of cycle day 1. */
  startDate: DayKey
  adjustments: ScheduleAdjustment[]
}

/** What the plan says about one calendar date. */
export interface ScheduleSlot {
  date: DayKey
  /** null before startDate. */
  dayIndex: number | null
  day: PlanDay | null
  /** 1-based; 0 before start. */
  cycle: number
  /** 1-based; 0 before start. */
  dayNumber: number
  cycleLength: number
  /** Plan rest day or adjusted date. */
  isRest: boolean
  adjusted?: 'delay' | 'skip'
  isFuture: boolean
  isToday: boolean
}

/** Links a session back to the plan day it came from. */
export interface PlanTag {
  planId?: string
  planName?: string
  planDayIndex?: number
  planDayName?: string
  planCycle?: number
}
