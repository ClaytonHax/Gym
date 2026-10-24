import type { PlanExercise, Program, ProgramGroup, Routine, WorkoutExercise } from '../types'
import { BUILTIN_EXERCISES } from './exercises'

const BY_ID = new Map(BUILTIN_EXERCISES.map((e) => [e.id, e]))

/** Rest times on the sheet are ranges ("3 to 4 min"); we use the midpoint. */
const MIN = 60

/** `n` sets of the same range, e.g. rx('leg-press', 3, '10-15', 3 * MIN). */
function rx(exerciseId: string, count: number | string[], range: string, restSec: number): PlanExercise {
  const base = BY_ID.get(exerciseId)
  if (!base) throw new Error(`Unknown exercise in program: ${exerciseId}`)
  return {
    exerciseId,
    name: base.name,
    muscle: base.muscle,
    tracksWeight: base.tracksWeight,
    targets: Array.isArray(count) ? count : Array.from({ length: count }, () => range),
    restSec,
  }
}

const ABS = (): PlanExercise[] => [
  rx('reverse-crunch', 3, '15-20', 1 * MIN),
  rx('woodchopper', 3, '10-15', 1 * MIN),
  rx('weighted-crunch', 3, '10-15', 1 * MIN),
  rx('serratus-jab', 3, '10-15', 1 * MIN),
]

/**
 * The six set workouts from the training sheet. Rep ranges, set counts and
 * rest are transcribed from a photo — tweak any of them by saving your own
 * routine from a finished session.
 */
export const PROGRAMS: Program[] = [
  {
    id: 'push-1',
    name: 'Push 1',
    group: 'Push',
    focus: 'Chest · Shoulders · Triceps',
    exercises: [
      rx('incline-dumbbell-press', ['5-9', '10-15'], '', 3.5 * MIN),
      rx('chest-press-machine', 3, '10-15', 2.5 * MIN),
      rx('chest-fly', 3, '10-15', 2 * MIN),
      rx('push-up', 1, 'failure', 2 * MIN),
      rx('cable-lateral-raise', 3, '10-15', 2 * MIN),
      rx('lateral-raise', 1, 'failure', 2 * MIN),
      rx('overhead-extension', 3, '8-15', 2 * MIN),
      rx('tricep-pushdown', 2, '8-15', 2 * MIN),
    ],
  },
  {
    id: 'push-2',
    name: 'Push 2',
    group: 'Push',
    focus: 'Shoulders · Chest · Triceps',
    exercises: [
      rx('dips', ['5-9', '5-9'], '', 3.5 * MIN),
      rx('dumbbell-shoulder-press', ['5-9', '5-9'], '', 3.5 * MIN),
      rx('cable-lateral-raise', 3, '10-15', 2 * MIN),
      rx('lateral-raise', 3, '8-15', 2 * MIN),
      rx('chest-press-machine', 2, '10-15', 2 * MIN),
      rx('chest-fly', 3, '10-15', 2 * MIN),
      rx('tricep-pushdown', 3, '8-15', 2 * MIN),
      rx('overhead-extension', 2, '8-15', 2 * MIN),
    ],
  },
  {
    id: 'pull-1',
    name: 'Pull 1',
    group: 'Pull',
    focus: 'Back · Rear delts · Biceps',
    exercises: [
      rx('barbell-row', ['5-9', '10-15'], '', 3.5 * MIN),
      rx('lat-pulldown', 3, '10-15', 2.5 * MIN),
      rx('single-arm-cable-pulldown', 3, '10-15', 2 * MIN),
      rx('single-arm-cable-row', 3, '8-15', 2 * MIN),
      rx('cable-pullover', 2, '10-15', 2 * MIN),
      rx('rear-delt-fly', 2, '10-15', 2 * MIN),
      rx('straight-bar-cable-curl', 3, '8-15', 2 * MIN),
      rx('hammer-curl', 2, '8-15', 2 * MIN),
    ],
  },
  {
    id: 'pull-2',
    name: 'Pull 2',
    group: 'Pull',
    focus: 'Lats · Rear delts · Biceps',
    exercises: [
      rx('weighted-pull-up', ['5-9', '5-9'], '', 3.5 * MIN),
      rx('seated-cable-row', 3, '10-15', 3 * MIN),
      rx('single-arm-cable-pulldown', 3, '10-15', 2 * MIN),
      rx('straight-arm-pulldown', 3, '8-15', 2 * MIN),
      rx('lat-pulldown', 2, '10-15', 2.5 * MIN),
      rx('cable-pullover', 2, '10-15', 2 * MIN),
      rx('rear-delt-fly', 2, '10-15', 2 * MIN),
      rx('rope-curl', 3, '8-15', 2 * MIN),
      rx('ez-bar-curl', 2, '8-15', 2 * MIN),
    ],
  },
  {
    id: 'legs-1',
    name: 'Legs 1',
    group: 'Legs',
    focus: 'Abs · Quads · Hamstrings · Calves',
    exercises: [
      ...ABS(),
      rx('squat', ['5-9', '10-15'], '', 4 * MIN),
      rx('leg-press', 3, '10-15', 3 * MIN),
      rx('lunge', 3, '12 each', 2 * MIN),
      rx('leg-curl', 3, '10-15', 2 * MIN),
      rx('leg-extension', 2, '10-15', 2 * MIN),
      rx('calf-raise', 2, 'failure', 2 * MIN),
    ],
  },
  {
    id: 'legs-2',
    name: 'Legs 2',
    group: 'Legs',
    focus: 'Abs · Hamstrings · Quads · Glutes',
    exercises: [
      ...ABS(),
      rx('stiff-leg-deadlift', ['5-9', '10-15'], '', 4 * MIN),
      rx('hack-squat', 3, '10-15', 3 * MIN),
      rx('leg-curl', 3, '10-15', 2 * MIN),
      rx('leg-extension', 3, '10-15', 2 * MIN),
      rx('hip-thrust', 2, '10-15', 2 * MIN),
      rx('calf-raise', 2, 'failure', 2 * MIN),
    ],
  },
]

export const PROGRAM_GROUPS: ProgramGroup[] = ['Push', 'Pull', 'Legs']

/** The rotation the sheet implies: Push 1 → Pull 1 → Legs 1 → Push 2 → Pull 2 → Legs 2. */
const ROTATION = ['push-1', 'pull-1', 'legs-1', 'push-2', 'pull-2', 'legs-2']

/** Next program after the most recent finished session named like one; Push 1 to begin. */
export function nextProgram(workoutsNewestFirst: Array<{ name: string }>): Program {
  for (const w of workoutsNewestFirst) {
    const i = ROTATION.findIndex((id) => PROGRAMS.find((p) => p.id === id)?.name === w.name)
    if (i >= 0) return PROGRAMS.find((p) => p.id === ROTATION[(i + 1) % ROTATION.length])!
  }
  return PROGRAMS[0]
}

/** Turn a plan into fresh, un-ticked workout exercises with targets pre-filled. */
export function planToExercises(plan: PlanExercise[]): WorkoutExercise[] {
  return plan.map((p) => {
    const targets = p.targets ?? Array.from({ length: p.sets ?? 3 }, () => '')
    return {
      exerciseId: p.exerciseId,
      name: p.name,
      muscle: p.muscle,
      tracksWeight: p.tracksWeight,
      ...(p.restSec ? { restSec: p.restSec } : {}),
      ...(p.supersetId ? { supersetId: p.supersetId } : {}),
      sets: targets.map((t) => ({
        weightKg: 0,
        reps: 0,
        done: false,
        ...(t ? { targetReps: t } : {}),
      })),
    }
  })
}

export function routineToExercises(r: Routine): WorkoutExercise[] {
  return planToExercises(r.exercises)
}
