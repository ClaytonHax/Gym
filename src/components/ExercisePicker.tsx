import { useMemo, useState } from 'react'
import { Icon } from './Icon'
import { Badge, Button, Field, Sheet } from './ui'
import { useExercises } from '../hooks/useExercises'
import { useToast } from '../contexts/ToastContext'
import { MUSCLE_COLORS, MUSCLE_GROUPS } from '../data/exercises'
import type { Exercise, MuscleGroup } from '../types'

/**
 * Searchable exercise library with a create-your-own fallback.
 * Multi-select so you can queue a whole superset in one visit.
 */
export function ExercisePicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (exercises: Exercise[]) => void
}) {
  const { exercises, addExercise } = useExercises()
  const toast = useToast()

  const [search, setSearch] = useState('')
  const [muscle, setMuscle] = useState<MuscleGroup | 'All'>('All')
  const [selected, setSelected] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newMuscle, setNewMuscle] = useState<MuscleGroup>('Chest')
  const [newEquipment, setNewEquipment] = useState('Barbell')
  const [newTracksWeight, setNewTracksWeight] = useState(true)
  const [saving, setSaving] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return exercises.filter((e) => {
      if (muscle !== 'All' && e.muscle !== muscle) return false
      if (!q) return true
      return (
        e.name.toLowerCase().includes(q) ||
        e.muscle.toLowerCase().includes(q) ||
        (e.equipment ?? '').toLowerCase().includes(q)
      )
    })
  }, [exercises, search, muscle])

  function reset() {
    setSearch('')
    setMuscle('All')
    setSelected([])
    setCreating(false)
    setNewName('')
  }

  function close() {
    reset()
    onClose()
  }

  function confirm() {
    const picked = selected
      .map((id) => exercises.find((e) => e.id === id))
      .filter((e): e is Exercise => Boolean(e))
    if (picked.length === 0) return
    onPick(picked)
    close()
  }

  async function createExercise(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setSaving(true)
    try {
      const id = await addExercise({
        name,
        muscle: newMuscle,
        equipment: newEquipment.trim() || 'Other',
        tracksWeight: newTracksWeight,
      })
      toast(`${name} added to your library.`)
      setSelected((prev) => [...prev, id])
      setCreating(false)
      setNewName('')
    } catch {
      toast('Could not save that exercise. Try again.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title={creating ? 'New exercise' : 'Add exercises'}
      footer={
        creating ? undefined : (
          <Button full size="lg" onClick={confirm} disabled={selected.length === 0}>
            {selected.length === 0
              ? 'Select exercises'
              : `Add ${selected.length} exercise${selected.length > 1 ? 's' : ''}`}
          </Button>
        )
      }
    >
      {creating ? (
        <form onSubmit={createExercise} className="flex flex-col gap-4">
          <Field
            label="Exercise name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Trap Bar Deadlift"
            required
          />
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="new-muscle"
              className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-fg-muted)]"
            >
              Muscle group
            </label>
            <select
              id="new-muscle"
              value={newMuscle}
              onChange={(e) => setNewMuscle(e.target.value as MuscleGroup)}
              className="min-h-12 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3.5 text-[var(--color-fg)] outline-none focus:border-brand-500"
            >
              {MUSCLE_GROUPS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <Field
            label="Equipment"
            value={newEquipment}
            onChange={(e) => setNewEquipment(e.target.value)}
            placeholder="Barbell, Dumbbell, Machine…"
          />
          <label className="flex items-center gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3.5 py-3">
            <input
              type="checkbox"
              checked={newTracksWeight}
              onChange={(e) => setNewTracksWeight(e.target.checked)}
              className="size-5 accent-[var(--color-brand-500)]"
            />
            <span className="text-sm">
              Tracks weight
              <span className="block text-xs text-[var(--color-fg-muted)]">
                Turn off for bodyweight or cardio work (reps only).
              </span>
            </span>
          </label>
          <div className="flex gap-3">
            <Button type="button" variant="secondary" full onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button type="submit" full loading={saving}>
              Save exercise
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Icon
              name="search"
              size={18}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-fg-muted)]"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search exercises"
              aria-label="Search exercises"
              className="min-h-12 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] pl-11 pr-3.5 text-[var(--color-fg)] placeholder:text-[var(--color-fg-muted)] outline-none focus:border-brand-500"
            />
          </div>

          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
            {(['All', ...MUSCLE_GROUPS] as Array<MuscleGroup | 'All'>).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMuscle(m)}
                aria-pressed={muscle === m}
                className={`min-h-9 shrink-0 rounded-full border px-3 text-xs font-semibold
                  uppercase tracking-wider transition-colors duration-200 ${
                    muscle === m
                      ? 'border-brand-500 bg-brand-500 text-white'
                      : 'border-[var(--color-line)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'
                  }`}
              >
                {m}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--color-fg-muted)]">
              No exercises match “{search}”.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {filtered.map((ex) => {
                const isSelected = selected.includes(ex.id)
                return (
                  <li key={ex.id}>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() =>
                        setSelected((prev) =>
                          isSelected ? prev.filter((id) => id !== ex.id) : [...prev, ex.id]
                        )
                      }
                      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left
                        transition-colors duration-200 ${
                          isSelected
                            ? 'border-brand-500 bg-brand-500/10'
                            : 'border-[var(--color-line)] hover:border-brand-500/50'
                        }`}
                    >
                      <span
                        className={`grid size-6 shrink-0 place-items-center rounded-md border-2
                          ${isSelected ? 'border-brand-500 bg-brand-500 text-white' : 'border-[var(--color-line)]'}`}
                      >
                        {isSelected ? <Icon name="check" size={14} /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{ex.name}</span>
                        <span className="block text-xs text-[var(--color-fg-muted)]">
                          {ex.equipment}
                          {ex.custom ? ' · Custom' : ''}
                          {!ex.tracksWeight ? ' · Reps only' : ''}
                        </span>
                      </span>
                      <Badge color={MUSCLE_COLORS[ex.muscle]}>{ex.muscle}</Badge>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          <Button variant="secondary" icon="plus" full onClick={() => setCreating(true)}>
            Create custom exercise
          </Button>
        </div>
      )}
    </Sheet>
  )
}
