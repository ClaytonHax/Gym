import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { EXERCISE_IMAGE_BASE, type ExerciseGuide as Guide } from '../data/exerciseGuides'

type Guides = Record<string, Guide>

let guidesPromise: Promise<Guides> | null = null
/** Guide text is ~70 KB, so it loads on first tap instead of with the app. */
function loadGuides(): Promise<Guides> {
  guidesPromise ??= import('../data/exerciseGuides').then((m) => m.EXERCISE_GUIDES)
  return guidesPromise
}

const CHIP =
  'inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[var(--color-surface-2)] px-2.5 text-sm font-semibold text-[var(--color-fg-muted)] active:scale-95'

/** "Show me how" chip plus the start/end photos and steps for built-in exercises. */
export function ExerciseGuide({ exerciseId, name, chipClass = CHIP }: { exerciseId?: string; name: string; chipClass?: string }) {
  const [open, setOpen] = useState(false)
  const [guides, setGuides] = useState<Guides | null>(null)
  const [frame, setFrame] = useState(0)
  const guide = exerciseId && guides ? guides[exerciseId] : undefined

  useEffect(() => {
    if (!open || guides) return
    let live = true
    loadGuides().then((g) => live && setGuides(g)).catch(() => {})
    return () => {
      live = false
    }
  }, [open, guides])

  // Flip between the start and end position so the movement reads without a video.
  useEffect(() => {
    if (!open || !guide) return
    const t = setInterval(() => setFrame((f) => 1 - f), 1200)
    return () => clearInterval(t)
  }, [open, guide])

  return (
    <>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={chipClass}>
        <Icon name="image" size={14} /> {open ? 'Hide how' : 'Show me how'}
      </button>
      {open ? (
        <div className="basis-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] p-2.5">
          {!guides ? (
            <p className="text-sm text-[var(--color-fg-muted)]">Loading…</p>
          ) : !guide ? (
            <p className="text-sm text-[var(--color-fg-muted)]">No demo for {name} yet.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                {[0, 1].map((i) => (
                  <img
                    key={i}
                    src={`${EXERCISE_IMAGE_BASE}${guide.dir}/${i}.jpg`}
                    alt={`${name}, ${i === 0 ? 'start' : 'end'} position`}
                    loading="lazy"
                    onError={(e) => ((e.currentTarget.style.visibility = 'hidden'))}
                    className={`aspect-[4/3] w-full rounded-lg bg-white object-cover transition-opacity ${frame === i ? 'opacity-100' : 'opacity-50'}`}
                  />
                ))}
              </div>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
                {guide.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </>
          )}
        </div>
      ) : null}
    </>
  )
}
