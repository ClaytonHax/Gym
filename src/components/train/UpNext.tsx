import { Icon } from '../Icon'
import { Button, Card } from '../ui'
import type { WorkoutExercise } from '../../types'

/** Small card under the focused exercise: what's next, plus Add exercise and workout notes. */
export function UpNext({
  next,
  onFocusNext,
  onAdd,
  notes,
}: {
  next?: { ex: WorkoutExercise; index: number }
  onFocusNext: () => void
  onAdd: () => void
  notes?: string
}) {
  return (
    <div className="flex flex-col gap-3">
      {next ? (
        <button
          type="button"
          onClick={onFocusNext}
          className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] px-4 text-left transition-colors duration-200 hover:border-brand-500"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">
              Up next
            </span>
            <span className="block truncate font-semibold">{next.ex.name}</span>
          </span>
          <span className="tabular shrink-0 text-sm text-[var(--color-fg-muted)]">
            {next.ex.sets.length} {next.ex.sets.length === 1 ? 'set' : 'sets'}
          </span>
          <Icon name="chevron-right" size={18} className="shrink-0 text-[var(--color-fg-muted)]" />
        </button>
      ) : null}

      <Button variant="secondary" size="lg" full icon="plus" onClick={onAdd}>
        Add exercise
      </Button>

      {notes ? (
        <Card className="flex gap-2.5">
          <Icon name="note" size={16} className="mt-0.5 shrink-0 text-[var(--color-fg-muted)]" />
          <p className="whitespace-pre-wrap text-sm text-[var(--color-fg-muted)]">{notes}</p>
        </Card>
      ) : null}
    </div>
  )
}
