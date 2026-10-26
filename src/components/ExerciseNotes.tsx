import { useEffect, useState } from 'react'
import { deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { Icon } from './Icon'
import { Button, Sheet } from './ui'

const CHIP =
  'inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[var(--color-surface-2)] px-2.5 text-sm font-semibold text-[var(--color-fg-muted)] active:scale-95'

/** Bullet-point form notes the person keeps for an exercise, saved to their account across workouts. */
export function ExerciseNotes({
  exerciseId,
  name,
  chipClass = CHIP,
}: {
  exerciseId: string
  name: string
  chipClass?: string
}) {
  const { user } = useAuth()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [bullets, setBullets] = useState<string[]>([])
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (!user) return
    return onSnapshot(doc(db, 'users', user.uid, 'exerciseNotes', exerciseId), (snap) => {
      const list = snap.data()?.bullets
      setBullets(Array.isArray(list) ? list.filter((b): b is string => typeof b === 'string') : [])
    })
  }, [user, exerciseId])

  async function save(next: string[]) {
    if (!user) return
    const ref = doc(db, 'users', user.uid, 'exerciseNotes', exerciseId)
    try {
      if (next.length === 0) await deleteDoc(ref)
      else await setDoc(ref, { bullets: next })
    } catch {
      toast('Could not save that note.', 'error')
    }
  }

  function add(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    setDraft('')
    save([...bullets, text])
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={chipClass}>
        <Icon name="note" size={14} /> Form notes{bullets.length > 0 ? ` (${bullets.length})` : ''}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={`${name} notes`}>
        <div className="flex flex-col gap-3">
          {bullets.length === 0 ? (
            <p className="text-sm text-[var(--color-fg-muted)]">
              Add reminders for form, seat settings, cues — they show up every time you do this exercise.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {bullets.map((b, i) => (
                <li
                  key={`${i}-${b}`}
                  className="flex items-start gap-2 rounded-xl bg-[var(--color-surface-2)] py-1 pl-3 pr-1"
                >
                  <span aria-hidden="true" className="mt-3 size-1.5 shrink-0 rounded-full bg-brand-400" />
                  <span className="min-w-0 flex-1 whitespace-pre-wrap break-words py-2 text-sm">{b}</span>
                  <button
                    type="button"
                    onClick={() => save(bullets.filter((_, j) => j !== i))}
                    aria-label={`Delete note: ${b}`}
                    className="grid size-11 shrink-0 place-items-center rounded-lg text-[var(--color-fg-muted)] hover:text-rose-400"
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={add} className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              enterKeyHint="done"
              maxLength={200}
              placeholder="e.g. Keep elbows tucked"
              aria-label="New note"
              className="min-h-12 min-w-0 flex-1 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3.5 outline-none placeholder:text-[var(--color-fg-muted)] focus:border-brand-500"
            />
            <Button type="submit" disabled={!draft.trim()}>
              Add
            </Button>
          </form>
        </div>
      </Sheet>
    </>
  )
}
