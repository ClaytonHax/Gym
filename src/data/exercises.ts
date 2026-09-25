import type { Exercise, MuscleGroup } from '../types'

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
  tracksWeight = true
): Exercise {
  return { id, name, muscle, equipment, tracksWeight }
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
  ex('plank', 'Plank', 'Core', 'Bodyweight', false),
  ex('hanging-leg-raise', 'Hanging Leg Raise', 'Core', 'Bodyweight', false),
  ex('cable-crunch', 'Cable Crunch', 'Core', 'Cable'),
  ex('russian-twist', 'Russian Twist', 'Core', 'Dumbbell'),
  ex('ab-wheel', 'Ab Wheel Rollout', 'Core', 'Other', false),
  ex('sit-up', 'Sit-Up', 'Core', 'Bodyweight', false),

  // Cardio
  ex('treadmill', 'Treadmill', 'Cardio', 'Machine', false),
  ex('cycling', 'Cycling', 'Cardio', 'Machine', false),
  ex('rowing', 'Rowing Machine', 'Cardio', 'Machine', false),
  ex('stair-climber', 'Stair Climber', 'Cardio', 'Machine', false),
  ex('jump-rope', 'Jump Rope', 'Cardio', 'Other', false),
]

/** Starting-point split templates so day one isn't an empty screen. */
export interface Template {
  id: string
  name: string
  focus: string
  exerciseIds: string[]
}

export const TEMPLATES: Template[] = [
  {
    id: 'push',
    name: 'Push Day',
    focus: 'Chest · Shoulders · Triceps',
    exerciseIds: [
      'bench-press',
      'incline-dumbbell-press',
      'overhead-press',
      'lateral-raise',
      'tricep-pushdown',
    ],
  },
  {
    id: 'pull',
    name: 'Pull Day',
    focus: 'Back · Biceps',
    exerciseIds: ['deadlift', 'lat-pulldown', 'barbell-row', 'face-pull', 'dumbbell-curl'],
  },
  {
    id: 'legs',
    name: 'Leg Day',
    focus: 'Quads · Hamstrings · Glutes',
    exerciseIds: ['squat', 'romanian-deadlift', 'leg-press', 'leg-curl', 'calf-raise'],
  },
  {
    id: 'upper',
    name: 'Upper Body',
    focus: 'Full upper split',
    exerciseIds: ['bench-press', 'barbell-row', 'overhead-press', 'lat-pulldown', 'hammer-curl'],
  },
  {
    id: 'lower',
    name: 'Lower Body',
    focus: 'Legs · Glutes · Core',
    exerciseIds: ['squat', 'hip-thrust', 'lunge', 'leg-extension', 'hanging-leg-raise'],
  },
  {
    id: 'full',
    name: 'Full Body',
    focus: 'Compound circuit',
    exerciseIds: ['squat', 'bench-press', 'barbell-row', 'overhead-press', 'plank'],
  },
]
