import type {
  PlanDay,
  PlanExercise,
  PlanTemplate,
  Routine,
  WorkoutExercise,
} from '../types'
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

const SPLIT = ['5-9', '10-15']

function day(id: string, name: string, focus: string, exercises: PlanExercise[]): PlanDay {
  return { id, kind: 'workout', name, focus, exercises }
}

function rest(id: string): PlanDay {
  return { id, kind: 'rest', name: 'Rest', exercises: [] }
}

/**
 * The 8-day PPL cycle from the training sheet. Rep ranges, set counts and rest
 * are transcribed from a photo; rest ranges use the midpoint (3-4 min = 210s).
 * Day ids are fixed here and replaced with fresh ones when a template is cloned.
 */
const PPL_DAYS: PlanDay[] = [
  day('ppl-push-1', 'Push 1', 'Chest · Shoulders · Triceps', [
    rx('incline-dumbbell-press', SPLIT, '', 3.5 * MIN),
    rx('chest-press-machine', 3, '10-15', 2.5 * MIN),
    rx('chest-fly', 3, '10-15', 2 * MIN),
    rx('push-up', 1, 'failure', 2 * MIN),
    rx('cable-lateral-raise', 1, 'failure', 2 * MIN),
    rx('lateral-raise', 3, '8-15', 2 * MIN),
    rx('overhead-extension', 3, '8-15', 2 * MIN),
    rx('tricep-pushdown', 2, '8-15', 2 * MIN),
  ]),
  day('ppl-pull-1', 'Pull 1', 'Back · Rear delts · Biceps', [
    rx('barbell-row', SPLIT, '', 3.5 * MIN),
    rx('lat-pulldown', 3, '10-15', 2.5 * MIN),
    rx('single-arm-cable-pulldown', 3, '10-15', 2 * MIN),
    rx('straight-arm-pulldown', 3, '8-15', 2 * MIN),
    rx('single-arm-cable-row', 2, '10-15', 2 * MIN),
    rx('cable-pullover', 2, '10-15', 2 * MIN),
    rx('rear-delt-fly', 2, '10-15', 2 * MIN),
    rx('straight-bar-cable-curl', 3, '8-15', 2 * MIN),
    rx('hammer-curl', 2, '8-15', 2 * MIN),
  ]),
  day('ppl-legs-1', 'Legs 1', 'Abs · Quads · Hamstrings · Calves', [
    ...ABS(),
    rx('squat', SPLIT, '', 4 * MIN),
    rx('leg-press', 3, '10-15', 3 * MIN),
    rx('lunge', 2, '12 each', 2 * MIN),
    rx('leg-curl', 3, '10-15', 2 * MIN),
    rx('leg-extension', 2, '10-15', 2 * MIN),
    rx('calf-raise', 2, 'failure', 2 * MIN),
  ]),
  rest('ppl-rest-1'),
  day('ppl-push-2', 'Push 2', 'Shoulders · Chest · Triceps', [
    rx('dips', SPLIT, '', 3.5 * MIN),
    rx('dumbbell-shoulder-press', SPLIT, '', 3.5 * MIN),
    rx('cable-lateral-raise', 3, '10-15', 2 * MIN),
    rx('lateral-raise', 3, '8-15', 2 * MIN),
    rx('chest-press-machine', 2, '10-15', 2 * MIN),
    rx('chest-fly', 2, '10-15', 2 * MIN),
    rx('tricep-pushdown', 3, '8-15', 2 * MIN),
    rx('overhead-extension', 2, '8-15', 2 * MIN),
  ]),
  day('ppl-pull-2', 'Pull 2', 'Lats · Rear delts · Biceps', [
    rx('weighted-pull-up', SPLIT, '', 3.5 * MIN),
    rx('t-bar-row', 3, '10-15', 3 * MIN),
    rx('single-arm-cable-pulldown', 3, '10-15', 2 * MIN),
    rx('straight-arm-pulldown', 3, '8-15', 2 * MIN),
    rx('lat-pulldown', 3, '10-15', 2.5 * MIN),
    rx('cable-pullover', 2, '10-15', 2 * MIN),
    rx('rear-delt-fly', 2, '10-15', 2 * MIN),
    rx('rope-curl', 3, '8-15', 2 * MIN),
    rx('ez-bar-curl', 2, '8-15', 2 * MIN),
  ]),
  day('ppl-legs-2', 'Legs 2', 'Abs · Hamstrings · Quads · Glutes', [
    ...ABS(),
    rx('stiff-leg-deadlift', SPLIT, '', 4 * MIN),
    rx('hack-squat', 3, '10-15', 3 * MIN),
    rx('leg-curl', 3, '10-15', 2 * MIN),
    rx('leg-extension', 3, '10-15', 2 * MIN),
    rx('hip-thrust', 3, '10-15', 2 * MIN),
    rx('calf-raise', 2, 'failure', 2 * MIN),
  ]),
  rest('ppl-rest-2'),
]

export const PPL_TEMPLATE_ID = 'ppl-8'

/** The built-in PPL plan lives in the public library under this id, authored by the owner. */
export const PPL_PUBLIC_ID = 'ppl-8day'
/** @ClaytonHax — firestore.rules only lets this uid create PPL_PUBLIC_ID. */
export const OWNER_UID = 't2MZUOISXMcg4fZuoX5ZeqgTK2x2'

export const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    id: PPL_TEMPLATE_ID,
    name: 'Push / Pull / Legs',
    description: 'Two rounds of push, pull and legs, each followed by a rest day.',
    tagline: '8-day cycle · 6 workouts · 2 rest',
    days: PPL_DAYS,
  },
]

export function getTemplate(id: string): PlanTemplate | undefined {
  return PLAN_TEMPLATES.find((t) => t.id === id)
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
