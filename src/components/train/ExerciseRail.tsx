import { useEffect, useRef } from 'react'
import { Icon } from '../Icon'
import { MUSCLE_COLORS } from '../../data/exercises'
import { linkedToNext, supersetColor } from '../../lib/supersets'
import type { WorkoutExercise } from '../../types'

const doneEx = (ex: WorkoutExercise) => ex.sets.length > 0 && ex.sets.every((s) => s.done)

/** Horizontal strip of exercise bubbles: tap one to focus it, "+" at the end adds another. */
export function ExerciseRail({
  exercises,
  focusIdx,
  onFocus,
  onAdd,
}: {
  exercises: WorkoutExercise[]
  focusIdx: number
  onFocus: (index: number) => void
  onAdd: () => void
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  // Keep the focused bubble visible without scrolling the page itself.
  useEffect(() => {
    const el = refs.current[focusIdx]
    const box = el?.closest('nav')
    if (!el || !box) return
    const left = el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    box.scrollTo({ left, behavior: reduce ? 'auto' : 'smooth' })
  }, [focusIdx, exercises.length])

  return (
    <nav aria-label="Exercises" className="no-scrollbar relative -mx-4 snap-x overflow-x-auto px-4 py-1">
      <ol className="flex w-max items-start">
        {exercises.map((ex, i) => {
          const done = doneEx(ex)
          const focused = i === focusIdx
          const paired = linkedToNext(exercises, i)
          const color = paired ? supersetColor(exercises, i) : undefined
          return (
            <li key={`${ex.exerciseId}-${i}`} className="flex shrink-0 snap-center items-start">
              <div className="flex w-14 flex-col items-center gap-1">
                <button
                  ref={(el) => {
                    refs.current[i] = el
                  }}
                  type="button"
                  onClick={() => onFocus(i)}
                  aria-current={focused ? 'step' : undefined}
                  aria-label={`${ex.name}, exercise ${i + 1} of ${exercises.length}${done ? ', done' : ''}`}
                  className={`tabular grid place-items-center rounded-full font-bold transition-all duration-200 ${
                    focused ? 'size-14 ring-4 ring-brand-500/60' : 'size-12'
                  } ${
                    done
                      ? 'bg-go-500 text-ink-950 shadow-[0_3px_0_var(--color-go-600)]'
                      : focused
                        ? 'bg-[var(--color-surface-2)] text-brand-400'
                        : 'bg-[var(--color-surface-2)] text-[var(--color-fg-muted)]'
                  }`}
                >
                  {done ? <Icon name="check" size={focused ? 26 : 22} /> : i + 1}
                </button>
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: MUSCLE_COLORS[ex.muscle] }}
                />
              </div>
              {paired ? (
                <span
                  aria-hidden="true"
                  className="mt-[22px] h-1.5 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
              ) : null}
            </li>
          )
        })}
        <li className="flex w-14 shrink-0 snap-center justify-center">
          <button
            type="button"
            onClick={onAdd}
            aria-label="Add exercise"
            className="grid size-12 place-items-center rounded-full border-2 border-dashed border-[var(--color-line)] text-[var(--color-fg-muted)] transition-colors duration-200 hover:border-brand-500 hover:text-brand-400"
          >
            <Icon name="plus" size={20} />
          </button>
        </li>
      </ol>
    </nav>
  )
}
