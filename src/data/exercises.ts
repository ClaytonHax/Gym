import type { CardioField, Exercise, LogMode, MuscleGroup } from '../types'

export const MUSCLE_GROUPS: MuscleGroup[] = [
  'Chest',
  'Back',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Legs',
  'Glutes',
  'Core',
  'Cardio',
  'Other',
]

/** Choices offered when creating a custom exercise. */
export const EQUIPMENT = [
  'Barbell',
  'Dumbbell',
  'Machine',
  'Cable',
  'Bodyweight',
  'Kettlebell',
  'Smith machine',
  'EZ bar',
  'Resistance band',
  'Other',
]

/** Accent per muscle group so history and charts stay colour-consistent. */
export const MUSCLE_COLORS: Record<MuscleGroup, string> = {
  Chest: '#f97316',
  Back: '#38bdf8',
  Shoulders: '#a78bfa',
  Biceps: '#fb7185',
  Triceps: '#fbbf24',
  Legs: '#22c55e',
  Glutes: '#2dd4bf',
  Core: '#e879f9',
  Cardio: '#f43f5e',
  Other: '#94a3b8',
}

function ex(
  id: string,
  name: string,
  muscle: MuscleGroup,
  equipment: string,
  tracksWeight = true,
  logBy?: LogMode,
  cardioFields?: CardioField[],
  aliases?: string[]
): Exercise {
  return {
    id,
    name,
    muscle,
    equipment,
    tracksWeight,
    ...(logBy ? { logBy } : {}),
    ...(cardioFields ? { cardioFields } : {}),
    ...(aliases ? { aliases } : {}),
  }
}

/** Lowercase, punctuation stripped, so "Cross-Trainer" matches "cross trainer". */
export function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** True when every word typed appears in the name, aliases, muscle or equipment. */
export function matchesExercise(e: Exercise, query: string): boolean {
  const q = normalizeSearch(query)
  if (!q) return true
  const hay = normalizeSearch(
    [e.name, ...(e.aliases ?? []), e.muscle, e.equipment ?? ''].join(' ')
  )
  return q.split(' ').every((w) => hay.includes(w))
}

/** Built-in library. Custom exercises live in Firestore and are merged on top. */
export const BUILTIN_EXERCISES: Exercise[] = [
  // Chest
  ex('bench-press', 'Bench Press', 'Chest', 'Barbell'),
  ex('incline-bench-press', 'Incline Bench Press', 'Chest', 'Barbell'),
  ex('dumbbell-bench-press', 'Dumbbell Bench Press', 'Chest', 'Dumbbell'),
  ex('incline-dumbbell-press', 'Incline Dumbbell Press', 'Chest', 'Dumbbell'),
  ex('chest-fly', 'Cable Chest Fly', 'Chest', 'Cable'),
  ex('chest-press-machine', 'Chest Press Machine', 'Chest', 'Machine'),
  ex('push-up', 'Push-Up', 'Chest', 'Bodyweight', false),
  ex('dips', 'Chest Dips', 'Chest', 'Bodyweight', false),

  // Back
  ex('deadlift', 'Deadlift', 'Back', 'Barbell'),
  ex('barbell-row', 'Barbell Row', 'Back', 'Barbell'),
  ex('pendlay-row', 'Pendlay Row', 'Back', 'Barbell'),
  ex('dumbbell-row', 'Dumbbell Row', 'Back', 'Dumbbell'),
  ex('lat-pulldown', 'Lat Pulldown', 'Back', 'Cable'),
  ex('seated-cable-row', 'Seated Cable Row', 'Back', 'Cable'),
  ex('pull-up', 'Pull-Up', 'Back', 'Bodyweight', false),
  ex('chin-up', 'Chin-Up', 'Back', 'Bodyweight', false),
  ex('face-pull', 'Face Pull', 'Back', 'Cable'),
  ex('shrug', 'Barbell Shrug', 'Back', 'Barbell'),

  // Shoulders
  ex('overhead-press', 'Overhead Press', 'Shoulders', 'Barbell'),
  ex('dumbbell-shoulder-press', 'Dumbbell Shoulder Press', 'Shoulders', 'Dumbbell'),
  ex('arnold-press', 'Arnold Press', 'Shoulders', 'Dumbbell'),
  ex('lateral-raise', 'Lateral Raise', 'Shoulders', 'Dumbbell'),
  ex('rear-delt-fly', 'Rear Delt Fly', 'Shoulders', 'Dumbbell'),
  ex('front-raise', 'Front Raise', 'Shoulders', 'Dumbbell'),
  ex('upright-row', 'Upright Row', 'Shoulders', 'Barbell'),

  // Biceps
  ex('barbell-curl', 'Barbell Curl', 'Biceps', 'Barbell'),
  ex('dumbbell-curl', 'Dumbbell Curl', 'Biceps', 'Dumbbell'),
  ex('hammer-curl', 'Hammer Curl', 'Biceps', 'Dumbbell'),
  ex('preacher-curl', 'Preacher Curl', 'Biceps', 'Machine'),
  ex('cable-curl', 'Cable Curl', 'Biceps', 'Cable'),
  ex('incline-curl', 'Incline Dumbbell Curl', 'Biceps', 'Dumbbell'),

  // Triceps
  ex('close-grip-bench', 'Close-Grip Bench Press', 'Triceps', 'Barbell'),
  ex('tricep-pushdown', 'Tricep Pushdown', 'Triceps', 'Cable'),
  ex('overhead-extension', 'Overhead Tricep Extension', 'Triceps', 'Dumbbell'),
  ex('skull-crusher', 'Skull Crusher', 'Triceps', 'Barbell'),
  ex('tricep-dips', 'Tricep Dips', 'Triceps', 'Bodyweight', false),
  ex('rope-pushdown', 'Rope Pushdown', 'Triceps', 'Cable'),

  // Legs
  ex('squat', 'Back Squat', 'Legs', 'Barbell'),
  ex('front-squat', 'Front Squat', 'Legs', 'Barbell'),
  ex('leg-press', 'Leg Press', 'Legs', 'Machine'),
  ex('romanian-deadlift', 'Romanian Deadlift', 'Legs', 'Barbell'),
  ex('lunge', 'Walking Lunge', 'Legs', 'Dumbbell'),
  ex('bulgarian-split-squat', 'Bulgarian Split Squat', 'Legs', 'Dumbbell'),
  ex('leg-extension', 'Leg Extension', 'Legs', 'Machine'),
  ex('leg-curl', 'Leg Curl', 'Legs', 'Machine'),
  ex('calf-raise', 'Standing Calf Raise', 'Legs', 'Machine'),
  ex('goblet-squat', 'Goblet Squat', 'Legs', 'Dumbbell'),

  // Glutes
  ex('hip-thrust', 'Barbell Hip Thrust', 'Glutes', 'Barbell'),
  ex('glute-bridge', 'Glute Bridge', 'Glutes', 'Bodyweight', false),
  ex('cable-kickback', 'Cable Kickback', 'Glutes', 'Cable'),
  ex('hip-abduction', 'Hip Abduction', 'Glutes', 'Machine'),

  // Core
  ex('plank', 'Plank', 'Core', 'Bodyweight', false, 'time'),
  ex('hanging-leg-raise', 'Hanging Leg Raise', 'Core', 'Bodyweight', false),
  ex('cable-crunch', 'Cable Crunch', 'Core', 'Cable'),
  ex('russian-twist', 'Russian Twist', 'Core', 'Dumbbell'),
  ex('ab-wheel', 'Ab Wheel Rollout', 'Core', 'Other', false),
  ex('sit-up', 'Sit-Up', 'Core', 'Bodyweight', false),

  // Added for the Push / Pull / Legs programs
  ex('cable-lateral-raise', 'Cable Lateral Raise', 'Shoulders', 'Cable'),
  ex('t-bar-row', 'T-Bar Row', 'Back', 'Machine'),
  ex('single-arm-cable-pulldown', 'Single Arm Cable Pulldown', 'Back', 'Cable'),
  ex('single-arm-cable-row', 'Single Arm Cable Row', 'Back', 'Cable'),
  ex('cable-pullover', 'Cable Pullover', 'Back', 'Cable'),
  ex('straight-arm-pulldown', 'Straight Arm Pulldown', 'Back', 'Cable'),
  ex('weighted-pull-up', 'Weighted Pull-Up', 'Back', 'Bodyweight'),
  ex('straight-bar-cable-curl', 'Straight Bar Cable Curl', 'Biceps', 'Cable'),
  ex('rope-curl', 'Rope Curl', 'Biceps', 'Cable'),
  ex('ez-bar-curl', 'EZ Bar Curl', 'Biceps', 'Barbell'),
  ex('reverse-crunch', 'Reverse Crunch', 'Core', 'Bodyweight', false),
  ex('woodchopper', 'High to Low Woodchopper', 'Core', 'Cable'),
  ex('weighted-crunch', 'Weighted Crunch', 'Core', 'Other'),
  ex('serratus-jab', 'Serratus Jab', 'Core', 'Dumbbell'),
  ex('stiff-leg-deadlift', 'Stiff Leg Deadlift', 'Legs', 'Barbell'),
  ex('hack-squat', 'Hack Squat', 'Legs', 'Machine'),

  // Cardio
  ex('treadmill', 'Treadmill', 'Cardio', 'Machine', false, 'time', ['speed', 'incline', 'distance'], ['walk', 'walking', 'running machine', 'jog']),
  ex('incline-walk', 'Incline Walk (Treadmill)', 'Cardio', 'Machine', false, 'time', ['speed', 'incline'], ['walk', 'walking', 'treadmill', 'hill walk']),
  ex('outdoor-walk', 'Outdoor Walk', 'Cardio', 'Other', false, 'time', ['distance'], ['walk', 'walking', 'stroll', 'hike']),
  ex('running', 'Running', 'Cardio', 'Other', false, 'time', ['distance', 'speed'], ['run', 'jog', 'jogging']),
  ex('cycling', 'Exercise Bike', 'Cardio', 'Machine', false, 'time', ['level', 'distance'], ['bike', 'bicycle', 'cycle', 'cycling', 'stationary bike', 'weighted bike', 'upright bike']),
  ex('spin-bike', 'Spin Bike', 'Cardio', 'Machine', false, 'time', ['level', 'distance'], ['bike', 'spinning', 'indoor cycling']),
  ex('air-bike', 'Air Bike / Assault Bike', 'Cardio', 'Machine', false, 'time', ['level', 'distance'], ['assault', 'assault bike', 'fan bike', 'echo bike', 'bike']),
  ex('rowing', 'Rowing Machine', 'Cardio', 'Machine', false, 'time', ['level', 'distance'], ['rower', 'erg', 'row']),
  ex('elliptical', 'Elliptical / Cross Trainer', 'Cardio', 'Machine', false, 'time', ['level', 'incline'], ['cross trainer', 'crosstrainer', 'elliptical trainer']),
  ex('stair-climber', 'Stair Climber', 'Cardio', 'Machine', false, 'time', ['level'], ['stairs', 'stair master', 'stairmaster', 'step mill']),
  ex('ski-erg', 'Ski Erg', 'Cardio', 'Machine', false, 'time', ['level', 'distance'], ['ski', 'skierg']),
  ex('swimming', 'Swimming', 'Cardio', 'Other', false, 'time', ['distance'], ['swim', 'laps', 'pool']),
  ex('jump-rope', 'Jump Rope', 'Cardio', 'Other', false, 'time', undefined, ['skipping', 'skip rope']),
]

/** Dumbbell moves are logged per hand; history and charts say so. */
export function isDumbbellExercise(
  e: { exerciseId?: string; name: string },
  equipmentById?: (id: string) => string | undefined
): boolean {
  const equipment =
    (e.exerciseId && equipmentById?.(e.exerciseId)) ||
    BUILTIN_EXERCISES.find((b) => b.id === e.exerciseId)?.equipment
  return equipment === 'Dumbbell' || /dumbbell/i.test(e.name)
}

/**
 * Plate math only makes sense when plates go on a bar: built-in barbell lifts, or a
 * custom exercise marked Barbell / named like one. Dumbbells, machines and cables are out.
 */
export function usesPlates(
  e: { exerciseId?: string; name: string },
  equipmentById?: (id: string) => string | undefined
): boolean {
  const equipment =
    (e.exerciseId && equipmentById?.(e.exerciseId)) ||
    BUILTIN_EXERCISES.find((b) => b.id === e.exerciseId)?.equipment
  if (equipment) return equipment === 'Barbell'
  return /barbell|squat|deadlift|bench press|overhead press/i.test(e.name) && !/dumbbell|machine|cable|smith/i.test(e.name)
}
