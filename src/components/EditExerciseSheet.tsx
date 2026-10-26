import { useEffect, useState } from 'react'
import { Button, Field, Sheet } from './ui'
import { useExercises } from '../hooks/useExercises'
import { useToast } from '../contexts/ToastContext'
import { EQUIPMENT, MUSCLE_GROUPS } from '../data/exercises'
import type { CardioField, Exercise, MuscleGroup } from '../types'

const CARDIO_FIELD_OPTIONS: Array<{ field: CardioField; label: string }> = [
  { field: 'speed', label: 'Speed' },
  { field: 'incline', label: 'Incline' },
  { field: 'level', label: 'Level (resistance)' },
  { field: 'distance', label: 'Distance' },
]

/** Edit a custom exercise's name, muscle, equipment and tracking. Past workouts keep their old name. */
export function EditExerciseSheet({ exercise, onClose }: { exercise: Exercise | null; onClose: () => void }) {
  const { updateExercise } = useExercises()
  const toast = useToast()
  const [name, setName] = useState('')
  const [muscle, setMuscle] = useState<MuscleGroup>('Other')
  const [equipment, setEquipment] = useState('')
  const [tracksWeight, setTracksWeight] = useState(true)
  const [fields, setFields] = useState<CardioField[]>([])
  const [saving, setSaving] = useState(false)
  const timed = exercise?.logBy === 'time'

  useEffect(() => {
    if (!exercise) return
    setName(exercise.name)
    setMuscle(exercise.muscle)
    setEquipment(exercise.equipment ?? '')
    setTracksWeight(exercise.tracksWeight)
    setFields(exercise.cardioFields ?? [])
  }, [exercise])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!exercise || !name.trim()) return
    setSaving(true)
    try {
      await updateExercise(exercise.id, {
        name: name.trim(),
        muscle,
        equipment: equipment.trim() || 'Other',
        tracksWeight: timed ? false : tracksWeight,
        ...(timed ? { logBy: 'time' as const, ...(fields.length ? { cardioFields: fields } : {}) } : {}),
        ...(exercise.aliases ? { aliases: exercise.aliases } : {}),
      })
      toast('Exercise updated.')
      onClose()
    } catch {
      toast('Could not save that exercise. Try again.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={exercise !== null} onClose={onClose} title="Edit exercise">
      <form onSubmit={save} className="flex flex-col gap-4">
        <Field label="Exercise name" value={name} onChange={(e) => setName(e.target.value)} required />
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="edit-muscle"
            className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-fg-muted)]"
          >
            Muscle group
          </label>
          <select
            id="edit-muscle"
            value={muscle}
            onChange={(e) => setMuscle(e.target.value as MuscleGroup)}
            className="min-h-12 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3.5 outline-none focus:border-brand-500"
          >
            {MUSCLE_GROUPS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        {timed ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Also record</legend>
            {CARDIO_FIELD_OPTIONS.map((o) => (
              <label
                key={o.field}
                className="flex min-h-12 items-center gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3.5"
              >
                <input
                  type="checkbox"
                  checked={fields.includes(o.field)}
                  onChange={(e) =>
                    setFields((prev) => (e.target.checked ? [...prev, o.field] : prev.filter((f) => f !== o.field)))
                  }
                  className="size-5 accent-[var(--color-brand-500)]"
                />
                <span className="text-sm">{o.label}</span>
              </label>
            ))}
          </fieldset>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {EQUIPMENT.map((eq) => (
                <button
                  key={eq}
                  type="button"
                  aria-pressed={equipment === eq}
                  onClick={() => setEquipment(eq)}
                  className={`min-h-11 rounded-full border px-3.5 text-sm font-medium ${
                    equipment === eq
                      ? 'border-brand-500 bg-brand-500/15'
                      : 'border-[var(--color-line)] bg-[var(--color-surface-2)] text-[var(--color-fg-muted)]'
                  }`}
                >
                  {eq}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3.5 py-3">
              <input
                type="checkbox"
                checked={tracksWeight}
                onChange={(e) => setTracksWeight(e.target.checked)}
                className="size-5 accent-[var(--color-brand-500)]"
              />
              <span className="text-sm">I use weights</span>
            </label>
          </>
        )}
        <div className="flex gap-3">
          <Button type="button" variant="secondary" full onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" full loading={saving}>
            Save changes
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
