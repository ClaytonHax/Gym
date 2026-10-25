import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Icon } from './Icon'
import { Button, Field, Sheet } from './ui'
import { useSettings } from '../contexts/SettingsContext'
import { useSocial } from '../contexts/SocialContext'
import { useToast } from '../contexts/ToastContext'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { useBodyLog } from '../hooks/useBodyLog'
import { useUsernameAvailability } from '../hooks/useUsernameAvailability'
import { dayKey } from '../lib/date'
import { normalizeUsername, RENAME_COOLDOWN_DAYS, usernameError } from '../lib/social'
import { kgTo, toKg } from '../lib/units'

const OPEN_EVENT = 'gym:profile-setup'
const SNOOZE_KEY = 'gym.profileSetupSnoozed'

/** Open the "Set up your profile" sheet from anywhere (only does anything while it's still pending). */
export function openProfileSetup() {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

function snoozed(): boolean {
  try {
    return sessionStorage.getItem(SNOOZE_KEY) === '1'
  } catch {
    return false
  }
}

function snooze() {
  try {
    sessionStorage.setItem(SNOOZE_KEY, '1')
  } catch {
    // Private mode: it just comes back on the next navigation, which is fine.
  }
}

const oneDecimal = (kg: number, unit: 'kg' | 'lb') => String(Math.round(kgTo(unit, kg) * 10) / 10)

/** Readable candidates from a display name: "jake", "jake_g", "jake24", then numbered. */
export function usernameCandidates(displayName: string, year = new Date().getFullYear()): string[] {
  const parts = displayName.trim().toLowerCase().split(/\s+/).map((p) => p.replace(/[^a-z0-9]/g, ''))
  const first = parts[0] ?? ''
  if (first.length < 3) return []
  const last = parts.length > 1 ? parts[parts.length - 1] : ''
  const list = [first, ...(last ? [`${first}_${last[0]}`, `${first}${last}`] : []), `${first}${String(year).slice(2)}`]
  for (let n = 1; n <= 9; n++) list.push(`${first}${n * 11}`)
  return [...new Set(list.map(normalizeUsername))].filter((c) => !usernameError(c))
}

function SetupSheet({ onClose }: { onClose: () => void }) {
  const { me, changeUsername, confirmUsername } = useSocial()
  const { profile, update } = useSettings()
  const { latest, loading, saveEntry } = useBodyLog()
  const toast = useToast()
  const unit = profile.unit

  const { user } = useAuth()
  const [username, setUsername] = useState(me?.username ?? '')
  const typed = useRef(false)
  const [weight, setWeight] = useState('')
  const [goal, setGoal] = useState(profile.goalWeightKg ? oneDecimal(profile.goalWeightKg, unit) : '')
  const [errors, setErrors] = useState<{ weight?: string; goal?: string }>({})
  const [saving, setSaving] = useState(false)

  // Steps that already succeeded, so a retry after a partial failure doesn't redo them.
  const done = useRef({ weight: false, goal: false })
  // Prefill with the latest weigh-in once the log loads (never over something already typed).
  const prefilled = useRef(false)
  const latestText = latest ? oneDecimal(latest.weightKg, unit) : ''
  useEffect(() => {
    if (loading || prefilled.current) return
    prefilled.current = true
    setWeight((w) => w || latestText)
  }, [loading, latestText])

  const needsUsername = Boolean(me?.freeChange)

  // Replace the machine-made handle with a readable one from the display name, if free.
  useEffect(() => {
    if (!needsUsername) return
    const name = profile.displayName || user?.displayName || ''
    const candidates = usernameCandidates(name)
    if (candidates.length === 0) return
    let cancelled = false
    void (async () => {
      for (const c of candidates) {
        try {
          const snap = await getDoc(doc(db, 'usernames', c))
          if (cancelled || typed.current) return
          if (!snap.exists() || snap.data()?.uid === user?.uid) {
            setUsername(c)
            return
          }
        } catch {
          return
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsUsername])
  const { next, error, status, setStatus } = useUsernameAvailability(username, me?.username, needsUsername)
  const usernameOk = !needsUsername || next === me?.username || status === 'free'

  async function save() {
    if (!me) return
    const next_: typeof errors = {}
    const w = Number(weight)
    if (weight.trim() === '') {
      // Optional: skipping is fine.
    } else if (Number.isNaN(w) || w <= 0) next_.weight = 'Enter a weight above zero.'
    else if (toKg(unit, w) > 500) next_.weight = 'That looks too high — check the number.'
    const g = Number(goal)
    if (goal.trim() !== '' && (Number.isNaN(g) || g <= 0 || g >= 700)) next_.goal = 'Enter a goal above zero.'
    setErrors(next_)
    if (next_.weight || next_.goal || !usernameOk) return

    setSaving(true)
    const failed: string[] = []

    // Each step stands alone so one failure doesn't throw away the others.
    if (needsUsername) {
      try {
        if (next === me.username) await confirmUsername()
        else await changeUsername(next)
      } catch (err) {
        console.warn('username save failed', err)
        failed.push('username')
        if (next !== me.username) setStatus('taken')
      }
    }

    const weightChanged = weight.trim() !== '' && weight.trim() !== latestText
    if (weightChanged && !done.current.weight) {
      try {
        await saveEntry({ date: dayKey(), weightKg: toKg(unit, w) })
        done.current.weight = true
      } catch (err) {
        console.warn('weigh-in save failed', err)
        failed.push('weight')
      }
    }

    const goalChanged = goal.trim() !== '' && goal.trim() !== (profile.goalWeightKg ? oneDecimal(profile.goalWeightKg, unit) : '')
    if (goalChanged && !done.current.goal) {
      try {
        await update({ goalWeightKg: toKg(unit, g) })
        done.current.goal = true
      } catch (err) {
        console.warn('goal save failed', err)
        failed.push('goal weight')
      }
    }

    setSaving(false)
    if (failed.length === 0) {
      toast('Profile set up.')
      onClose()
    } else {
      toast(`Couldn’t save your ${failed.join(' and ')}. Check your connection and try again.`, 'error')
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Set up your profile"
      footer={
        <div className="flex flex-col gap-2">
          <Button full size="lg" loading={saving} disabled={!usernameOk} onClick={save}>
            Save
          </Button>
          <Button full variant="ghost" disabled={saving} onClick={onClose}>
            Later
          </Button>
        </div>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        {needsUsername ? (
          <>
            <Field
              label="Username"
              enterKeyHint="next"
              value={username}
              onChange={(e) => {
                typed.current = true
                setUsername(e.target.value)
              }}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={21}
              suffix={
                status === 'checking' ? (
                  <span className="text-xs">…</span>
                ) : status === 'free' ? (
                  <Icon name="check" size={18} className="text-go-400" title="Available" />
                ) : status === 'taken' ? (
                  <Icon name="x" size={18} className="text-rose-400" title="Taken" />
                ) : null
              }
              error={error ?? (status === 'taken' ? 'That username is taken.' : undefined)}
              hint="Friends use this name to find you."
            />
            <p className="-mt-2 text-sm text-[var(--color-fg-muted)]">
              Change it as much as you like now. After you save, you can change it once every{' '}
              {RENAME_COOLDOWN_DAYS} days.
            </p>
          </>
        ) : null}

        <Field
          label={`Current weight (${unit})`}
          type="number"
          inputMode="decimal"
          enterKeyHint="next"
          step="0.1"
          min="0"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          suffix={unit}
          placeholder="Optional"
          error={errors.weight}
          hint="Optional. Helps estimate calories burned."
        />
        <Field
          label={`Goal weight (${unit})`}
          type="number"
          inputMode="decimal"
          enterKeyHint="done"
          step="0.1"
          min="0"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          suffix={unit}
          placeholder="—"
          error={errors.goal}
          hint="Optional. You can set it later in Settings."
        />
        {/* Enter submits from any field. */}
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" disabled={saving}>
          Save
        </button>
      </form>
    </Sheet>
  )
}

/**
 * Onboarding: until someone has chosen (or confirmed) their username, offer a
 * one-time setup sheet. "Later" snoozes it for this session only.
 */
export function ProfileSetup() {
  const { me } = useSocial()
  const { pathname } = useLocation()
  const [dismissed, setDismissed] = useState(snoozed)

  useEffect(() => {
    const open = () => setDismissed(false)
    window.addEventListener(OPEN_EVENT, open)
    return () => window.removeEventListener(OPEN_EVENT, open)
  }, [])

  const close = useCallback(() => {
    snooze()
    setDismissed(true)
  }, [])

  // Never interrupt a session in progress.
  if (!me?.freeChange || dismissed || pathname === '/workout') return null
  return <SetupSheet onClose={close} />
}
