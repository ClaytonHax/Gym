import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { Button, Toggle } from './ui'
import { useAuth } from '../contexts/AuthContext'
import { useSocial } from '../contexts/SocialContext'
import { useToast } from '../contexts/ToastContext'
import {
  currentSubscription,
  disablePush,
  enablePush,
  notificationPermission,
  pushSupport,
  savePushPrefs,
} from '../lib/push'
import type { NotificationType } from '../lib/social'
import { IosInstallSheet } from './InstallPrompt'

const PREFS: Array<{ type: NotificationType; label: string; description: string }> = [
  { type: 'nudge', label: 'Nudges', description: 'When a friend tells you to get moving.' },
  { type: 'friend_request', label: 'Friend requests', description: 'New requests and accepts.' },
  { type: 'workout', label: 'Friends’ workouts', description: 'When a friend finishes a session.' },
  { type: 'kudos', label: 'Reactions', description: 'When friends react to your workouts.' },
  { type: 'streak_risk', label: 'Streak reminders', description: 'When your streak is about to end, or just did.' },
  { type: 'finish_workout', label: 'Workout reminders', description: 'If you forget to finish a workout, or miss a planned day.' },
  { type: 'friend_streak', label: 'Friends’ streaks', description: 'When a friend’s streak is about to end.' },
  { type: 'challenge_invite', label: 'Challenges', description: 'Invites and friends joining yours.' },
]

/** Is push on for *this* device? */
export function usePushEnabled() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  useEffect(() => {
    let cancelled = false
    currentSubscription()
      .then((s) => !cancelled && setEnabled(Boolean(s) && notificationPermission() === 'granted'))
      .catch(() => !cancelled && setEnabled(false))
    return () => {
      cancelled = true
    }
  }, [])
  return [enabled, setEnabled] as const
}

/** The on/off switch for this device, with the right help for each platform. */
export function PushToggleCard({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth()
  const toast = useToast()
  const [enabled, setEnabled] = usePushEnabled()
  const [busy, setBusy] = useState(false)
  const [iosHelp, setIosHelp] = useState(false)
  const support = pushSupport()
  const denied = notificationPermission() === 'denied'

  async function turnOn() {
    if (!user) return
    setBusy(true)
    try {
      const result = await enablePush(user.uid)
      if (result === 'granted') {
        setEnabled(true)
        toast('Notifications on for this device.')
      } else if (result === 'denied') {
        toast('Notifications are blocked. Allow them in your browser or phone settings.', 'error')
      } else {
        toast('This browser can’t receive notifications.', 'error')
      }
    } catch (err) {
      console.error(err)
      toast('Couldn’t turn on notifications.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function turnOff() {
    if (!user) return
    setBusy(true)
    try {
      await disablePush(user.uid)
      setEnabled(false)
      toast('Notifications off for this device.', 'info')
    } catch {
      toast('Couldn’t turn off notifications.', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (enabled && compact) return null

  return (
    <div className={compact ? 'card-accent p-4' : ''}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-brand-400">
          <Icon name="bell" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {enabled ? 'Notifications are on' : 'Get notified'}
          </p>
          <p className="text-sm text-[var(--color-fg-muted)]">
            {support === 'ios-install'
              ? 'On iPhone, add Gym to your Home Screen first — then you can turn on notifications.'
              : support === 'unsupported'
                ? 'This browser doesn’t support notifications. Try Chrome, Edge, Firefox or Safari.'
                : denied
                  ? 'Notifications are blocked for this site. Allow them in your browser or phone settings, then try again.'
                  : enabled
                    ? 'Nudges, friend requests and challenges reach this device even when the app is closed.'
                    : 'Know the moment a friend nudges you, accepts your request or challenges you.'}
          </p>
        </div>
      </div>
      <div className="mt-3">
        {support === 'ios-install' ? (
          <Button full icon="share" onClick={() => setIosHelp(true)}>
            Show me how
          </Button>
        ) : support === 'supported' && enabled !== null ? (
          enabled ? (
            <Button full variant="secondary" loading={busy} onClick={turnOff}>
              Turn off on this device
            </Button>
          ) : (
            <Button full icon="bell" loading={busy} disabled={denied} onClick={turnOn}>
              Turn on notifications
            </Button>
          )
        ) : null}
      </div>
      <IosInstallSheet open={iosHelp} onClose={() => setIosHelp(false)} />
    </div>
  )
}

export function NotificationPrefs() {
  const { user } = useAuth()
  const { push } = useSocial()
  const toast = useToast()

  async function set(type: NotificationType, on: boolean) {
    if (!user) return
    const next: Record<string, boolean> = { ...push.prefs, [type]: on }
    // Challenge invites and joins share one switch, as do requests and accepts.
    if (type === 'challenge_invite') next.challenge_join = on
    if (type === 'friend_request') next.friend_accept = on
    if (type === 'streak_risk') next.streak_lost = on
    if (type === 'finish_workout') next.missed_day = on
    try {
      await savePushPrefs(user.uid, next)
    } catch {
      toast('Couldn’t save that setting.', 'error')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {PREFS.map((p) => (
        <Toggle
          key={p.type}
          label={p.label}
          description={p.description}
          checked={push.prefs[p.type] !== false}
          onChange={(on) => set(p.type, on)}
        />
      ))}
      <p className="text-xs text-[var(--color-fg-muted)]">
        These apply to push alerts on all your devices. Everything still shows in the in-app inbox.
      </p>
    </div>
  )
}
