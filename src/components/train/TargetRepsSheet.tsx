import { useState } from 'react'
import { Button, Sheet } from '../ui'
import { RepsEditor } from '../RepsEditor'

/** "8-" (a half-typed range) becomes "8"; an empty range becomes blank. */
function tidy(v: string): string {
  const t = v.trim()
  if (t.toLowerCase() === 'failure') return 'failure'
  const [lo, hi] = t.split('-').map((x) => x.trim())
  if (!t.includes('-')) return lo ?? ''
  if (lo && hi) return `${lo}-${hi}`
  return lo || hi || ''
}

/** Change the rep target for every working set of the exercise being done. */
export function TargetRepsSheet({
  name,
  initial,
  onApply,
  onClose,
}: {
  name: string
  initial: string
  onApply: (value: string) => void
  onClose: () => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <Sheet
      open
      onClose={onClose}
      title="Target reps"
      footer={
        <Button full onClick={() => onApply(tidy(value))}>
          Done
        </Button>
      }
    >
      <p className="text-sm text-[var(--color-fg-muted)]">
        {name}. Applies to all working sets. Leave it blank to clear the target.
      </p>
      <RepsEditor name={name} value={value} onChange={setValue} />
    </Sheet>
  )
}
