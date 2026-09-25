import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import {
  Badge,
  Button,
  Card,
  ConfirmSheet,
  Field,
  IconButton,
  PageTitle,
  SectionHeader,
  Segmented,
} from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import { useExercises } from '../hooks/useExercises'
import { useWorkouts } from '../hooks/useWorkouts'
import { useBodyLog } from '../hooks/useBodyLog'
import { MUSCLE_COLORS } from '../data/exercises'
import { kgTo, toKg } from '../lib/units'
import type { Profile, Unit } from '../types'

export function Settings() {
  const { user, logout } = useAuth()
  const { profile, update } = useSettings()
  const toast = useToast()
  const navigate = useNavigate()
  const { custom, deleteExercise } = useExercises()
  const { workouts } = useWorkouts()
  const { entries } = useBodyLog()

  const unit = profile.unit
  const [name, setName] = useState(profile.displayName)
  const [height, setHeight] = useState('')
  const [goal, setGoal] = useState('')
  const [deleteExerciseId, setDeleteExerciseId] = useState<string | null>(null)

  // Mirror remote profile values into the local fields when they arrive.
  useEffect(() => {
    setName(profile.displayName)
    setHeight(profile.heightCm ? String(Math.round(profile.heightCm)) : '')
    setGoal(
      profile.goalWeightKg ? String(Math.round(kgTo(unit, profile.goalWeightKg) * 10) / 10) : ''
    )
  }, [profile.displayName, profile.heightCm, profile.goalWeightKg, unit])

  async function save(patch: Partial<Profile>, message?: string) {
    try {
      await update(patch)
      if (message) toast(message)
    } catch {
      toast('Could not save that change.', 'error')
    }
  }

  function exportData() {
    const payload = {
      exportedAt: new Date().toISOString(),
      profile,
      workouts,
      bodyLog: entries,
      customExercises: custom,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `gym-tracker-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast('Export downloaded.')
  }

  return (
    <div className="animate-rise flex flex-col gap-6">
      <div className="flex items-start gap-2">
        <IconButton icon="chevron-left" label="Back" onClick={() => navigate(-1)} className="-ml-2 mt-1" />
        <div className="flex-1">
          <PageTitle title="Settings" subtitle={user?.email ?? undefined} />
        </div>
      </div>

      <section>
        <SectionHeader title="Profile" />
        <Card className="flex flex-col gap-4">
          <Field
            label="Display name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (name.trim() !== profile.displayName) save({ displayName: name.trim() }, 'Name updated.')
            }}
            placeholder="Your name"
          />
          <Field
            label="Height (cm)"
            type="number"
            inputMode="numeric"
            min="80"
            max="260"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            onBlur={() => {
              const cm = Number(height)
              if (!height) return save({ heightCm: undefined })
              if (cm >= 80 && cm <= 260) save({ heightCm: cm }, 'Height saved.')
            }}
            suffix="cm"
            hint="Used for BMI on the Body tab."
            placeholder="—"
          />
          <Field
            label={`Goal weight (${unit})`}
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onBlur={() => {
              const value = Number(goal)
              if (!goal) return save({ goalWeightKg: undefined })
              if (value > 0 && value < 700) save({ goalWeightKg: toKg(unit, value) }, 'Goal saved.')
            }}
            suffix={unit}
            placeholder="—"
          />
        </Card>
      </section>

      <section>
        <SectionHeader title="Preferences" />
        <Card className="flex flex-col gap-5">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-fg-muted)]">
              Units
            </p>
            <Segmented
              label="Weight units"
              value={unit}
              onChange={(next: Unit) => save({ unit: next })}
              options={[
                { value: 'kg', label: 'Kilograms' },
                { value: 'lb', label: 'Pounds' },
              ]}
            />
            <p className="mt-1.5 text-xs text-[var(--color-fg-muted)]">
              Weights are stored precisely, so switching back and forth never loses data.
            </p>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-fg-muted)]">
              Theme
            </p>
            <Segmented
              label="Theme"
              value={profile.theme}
              onChange={(next) => save({ theme: next })}
              options={[
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
                { value: 'system', label: 'System' },
              ]}
            />
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-fg-muted)]">
              Weekly session goal
            </p>
            <div className="flex items-center gap-3">
              <IconButton
                icon="minus"
                label="Decrease weekly goal"
                variant="secondary"
                disabled={profile.weeklyGoal <= 1}
                onClick={() => save({ weeklyGoal: Math.max(1, profile.weeklyGoal - 1) })}
              />
              <span className="tabular flex-1 text-center font-display text-3xl font-semibold">
                {profile.weeklyGoal}
                <span className="ml-1 text-sm font-medium text-[var(--color-fg-muted)]">
                  / week
                </span>
              </span>
              <IconButton
                icon="plus"
                label="Increase weekly goal"
                variant="secondary"
                disabled={profile.weeklyGoal >= 14}
                onClick={() => save({ weeklyGoal: Math.min(14, profile.weeklyGoal + 1) })}
              />
            </div>
          </div>
        </Card>
      </section>

      <section>
        <SectionHeader title={`Custom exercises (${custom.length})`} />
        {custom.length === 0 ? (
          <Card>
            <p className="text-sm text-[var(--color-fg-muted)]">
              Exercises you create while logging a workout show up here.
            </p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {custom.map((ex) => (
              <Card as="li" key={ex.id} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{ex.name}</span>
                  <span className="block text-xs text-[var(--color-fg-muted)]">
                    {ex.equipment}
                    {!ex.tracksWeight ? ' · Reps only' : ''}
                  </span>
                </span>
                <Badge color={MUSCLE_COLORS[ex.muscle]}>{ex.muscle}</Badge>
                <IconButton
                  icon="trash"
                  label={`Delete ${ex.name}`}
                  onClick={() => setDeleteExerciseId(ex.id)}
                  className="hover:bg-rose-500/15 hover:text-rose-400"
                />
              </Card>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionHeader title="Your data" />
        <Card className="flex flex-col gap-3">
          <p className="text-sm text-[var(--color-fg-muted)]">
            {workouts.length} workouts · {entries.length} weigh-ins · {custom.length} custom exercises
          </p>
          <Button variant="secondary" full icon="download" onClick={exportData}>
            Export as JSON
          </Button>
          <p className="flex items-start gap-2 text-xs text-[var(--color-fg-muted)]">
            <Icon name="note" size={14} className="mt-0.5 shrink-0" />
            Everything is stored in your own Firebase project and cached on this device for
            offline use.
          </p>
        </Card>
      </section>

      <Button variant="secondary" size="lg" full icon="logout" onClick={() => logout()}>
        Sign out
      </Button>

      <p className="pb-2 text-center text-xs text-[var(--color-fg-muted)]">Gym Tracker v1.0.0</p>

      <ConfirmSheet
        open={deleteExerciseId !== null}
        title="Delete custom exercise?"
        message="Past workouts keep their records — this only removes it from your library."
        onCancel={() => setDeleteExerciseId(null)}
        onConfirm={async () => {
          if (!deleteExerciseId) return
          try {
            await deleteExercise(deleteExerciseId)
            toast('Exercise deleted.', 'info')
          } catch {
            toast('Could not delete that exercise.', 'error')
          }
          setDeleteExerciseId(null)
        }}
      />
    </div>
  )
}
