import { useEffect, useState } from 'react'
import { ExerciseListEditor } from './ExerciseListEditor'
import { Button, Sheet } from './ui'
import { useRoutines } from '../hooks/useRoutines'
import { useToast } from '../contexts/ToastContext'
import type { PlanExercise, Routine } from '../types'

/** Create or edit a custom routine: exercises, sets, rep ranges and rest. */
export function RoutineBuilder({
  open,
  onClose,
  routine,
}: {
  open: boolean
  onClose: () => void
  /** Pass an existing routine to edit it; omit to create. */
  routine?: Routine | null
}) {
  const { saveRoutine, updateRoutine } = useRoutines()
  const toast = useToast()
  const [name, setName] = useState('')
  const [items, setItems] = useState<PlanExercise[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(routine?.name ?? '')
    setItems(
      routine?.exercises.map((e) => ({
        ...e,
        targets: e.targets ?? Array.from({ length: e.sets ?? 3 }, () => ''),
      })) ?? []
    )
  }, [open, routine])

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) return toast('Give the routine a name.', 'error')
    if (items.length === 0) return toast('Add at least one exercise.', 'error')
    setSaving(true)
    try {
      // Firestore rejects undefined, so optional keys are dropped rather than nulled.
      const exercises = items.map(({ sets: _legacy, ...it }) =>
        Object.fromEntries(Object.entries(it).filter(([, v]) => v !== undefined))
      ) as unknown as PlanExercise[]
      if (routine) await updateRoutine(routine.id, { name: trimmed, exercises })
      else await saveRoutine({ name: trimmed, exercises })
      toast(routine ? 'Routine updated.' : 'Routine saved.')
      onClose()
    } catch {
      toast('Could not save the routine.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={routine ? 'Edit routine' : 'New routine'}
        footer={
          <Button full variant="go" loading={saving} onClick={save}>
            Save routine
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Name
            <input
              enterKeyHint="done"
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Arms & Abs"
              className="min-h-12 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 outline-none focus:border-brand-500"
            />
          </label>

          <ExerciseListEditor items={items} onChange={setItems} />
        </div>
      </Sheet>

    </>
  )
}
