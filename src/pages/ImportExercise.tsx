import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Badge, Button, Card } from '../components/ui'
import { useExercises } from '../hooks/useExercises'
import { useToast } from '../contexts/ToastContext'
import { MUSCLE_COLORS } from '../data/exercises'
import { parseSharedExercise } from '../lib/shareExercise'

/** /x/:code — someone shared a custom exercise; confirm before adding it to this library. */
export function ImportExercise() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { custom, addExercise } = useExercises()
  const [saving, setSaving] = useState(false)
  const ex = parseSharedExercise(code)

  if (!ex) {
    return (
      <Card className="flex flex-col items-center gap-3 text-center">
        <p className="font-semibold">That exercise link is not valid.</p>
        <Link to="/" className="font-semibold text-brand-400 underline">
          Back home
        </Link>
      </Card>
    )
  }

  const have = custom.some((c) => c.name.toLowerCase() === ex.name.toLowerCase())

  async function add() {
    if (!ex) return
    setSaving(true)
    try {
      await addExercise(ex)
      toast(`${ex.name} added to your library.`)
      navigate('/settings', { replace: true })
    } catch {
      toast('Could not save that exercise. Try again.', 'error')
      setSaving(false)
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <p className="text-sm text-[var(--color-fg-muted)]">Someone shared a custom exercise with you:</p>
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-semibold">{ex.name}</span>
          <span className="block text-sm text-[var(--color-fg-muted)]">
            {ex.equipment}
            {ex.logBy === 'time' ? ' · Timed' : !ex.tracksWeight ? ' · Reps only' : ''}
          </span>
        </span>
        <Badge color={MUSCLE_COLORS[ex.muscle]}>{ex.muscle}</Badge>
      </div>
      {have ? <p className="text-sm text-amber-400">You already have an exercise with this name.</p> : null}
      <Button full loading={saving} onClick={add}>
        Add to my library
      </Button>
    </Card>
  )
}
