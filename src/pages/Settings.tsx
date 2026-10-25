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
  Toggle,
} from '../components/ui'
import { REST_PRESETS, defaultRestSec, fmtPreset } from '../components/RestTimer'
import { UsernameCard } from '../components/UsernameCard'
import { NotificationPrefs, PushToggleCard } from '../components/PushSettings'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import { useExercises } from '../hooks/useExercises'
import { useWorkouts } from '../hooks/useWorkouts'
import { useBodyLog } from '../hooks/useBodyLog'
import { MUSCLE_COLORS } from '../data/exercises'
import { workoutsToCsv } from '../lib/csv'
import { kgTo, toKg } from '../lib/units'
import type { Profile, Unit } from '../types'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

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

  function exportCsv() {
    const blob = new Blob([workoutsToCsv(workouts)], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `gym-tracker-sets-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast('CSV downloaded.')
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

      <section id="username" className="scroll-mt-4">
        <SectionHeader title="Username" />
        <UsernameCard />
      </section>

      <section>
        <SectionHeader title="Notifications" />
        <Card className="flex flex-col gap-5">
          <PushToggleCard />
          <div className="border-t border-[var(--color-line)] pt-4">
            <NotificationPrefs />
          </div>
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
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-fg-muted)]">
              Always rest days
            </p>
            <div className="flex gap-1.5">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => {
                const on = (profile.restWeekdays ?? []).includes(i)
                return (
                  <button
                    key={i}
                    type="button"
                    aria-pressed={on}
                    aria-label={`${WEEKDAYS[i]} is a rest day`}
                    onClick={() =>
                      save({
                        restWeekdays: on
                          ? (profile.restWeekdays ?? []).filter((d) => d !== i)
                          : [...(profile.restWeekdays ?? []), i].sort(),
                      })
                    }
                    className={`h-11 flex-1 rounded-xl border text-sm font-semibold ${
                      on
                        ? 'border-rest bg-rest/15 text-rest'
                        : 'border-[var(--color-border)] text-[var(--color-fg-muted)]'
                    }`}
                  >
                    {l}
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-xs text-[var(--color-fg-muted)]">
              Days you never train, like when your gym is closed. They keep your streak alive.
            </p>
          </div>
        </Card>
      </section>

      <section>
        <SectionHeader title="Rest timer" />
        <Card className="flex flex-col gap-5">
          <Toggle
            label="Auto rest timer"
            description="Counts down after each strength set."
            checked={profile.restTimer !== false}
            onChange={(next) => save({ restTimer: next })}
          />
          {profile.restTimer !== false ? (
            <>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-fg-muted)]">
                  Rest length
                </p>
                <Segmented
                  label="Rest length"
                  value={String(defaultRestSec(profile.restSec))}
                  onChange={(next) => save({ restSec: Number(next) })}
                  options={REST_PRESETS.map((p) => ({ value: String(p), label: fmtPreset(p) }))}
                />
              </div>
              <Toggle
                label="Use plan rest times"
                description="Exercises with their own rest in a plan use that instead."
                checked={profile.restFollowsPlan === true}
                onChange={(next) => save({ restFollowsPlan: next })}
              />
            </>
          ) : null}
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
          <Button variant="secondary" full icon="download" onClick={exportCsv}>
            Export sets as CSV
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
