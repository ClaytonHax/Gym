import { useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Icon } from './Icon'
import { Button, IconButton, Sheet } from './ui'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import {
  currentSubscription,
  enablePush,
  isIos,
  isStandalone,
  notificationPermission,
  pushSupport,
} from '../lib/push'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const INSTALL_SNOOZE = 'gym.installSnoozedUntil'
const PUSH_SNOOZE = 'gym.pushSnoozedUntil'
const SNOOZE_DAYS = 3

function snoozed(key: string): boolean {
  try {
    return Number(localStorage.getItem(key) ?? 0) > Date.now()
  } catch {
    return false
  }
}

function snooze(key: string) {
  try {
    localStorage.setItem(key, String(Date.now() + SNOOZE_DAYS * 86400000))
  } catch {
    // Private mode — the banner just comes back next visit.
  }
}

/* -------------------------------------------------------------------------- */
/* iOS illustrations — drawn after the iOS 26+ Safari layout ("Liquid Glass")  */
/* -------------------------------------------------------------------------- */

const IOS_BLUE = '#0a84ff'

function Frame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <svg
      viewBox="0 0 300 168"
      role="img"
      aria-label={label}
      className="w-full rounded-2xl border border-[var(--color-line)] bg-[var(--color-canvas)]"
    >
      {children}
    </svg>
  )
}

/** Safari's bottom bar: back, address pill, ••• — with the menu open on Share. */
function StepShareArt() {
  return (
    <Frame label="Safari toolbar at the bottom of the screen with the More button open and Share highlighted">
      {/* menu popover */}
      <rect x="150" y="14" width="134" height="92" rx="16" fill="var(--color-surface)" stroke="var(--color-line)" />
      <rect x="158" y="22" width="118" height="24" rx="8" fill={`${IOS_BLUE}26`} stroke={IOS_BLUE} strokeWidth="1.5" />
      <g stroke={IOS_BLUE} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M168 40v-8M164.5 35.5 168 32l3.5 3.5M163 37v5h10v-5" />
      </g>
      <text x="182" y="38.5" fontSize="11" fontWeight="700" fill={IOS_BLUE} fontFamily="system-ui">Share</text>
      <text x="166" y="64" fontSize="11" fill="var(--color-fg-muted)" fontFamily="system-ui">Add Bookmark</text>
      <text x="166" y="86" fontSize="11" fill="var(--color-fg-muted)" fontFamily="system-ui">New Tab</text>
      <line x1="158" y1="52" x2="276" y2="52" stroke="var(--color-line)" />
      <line x1="158" y1="74" x2="276" y2="74" stroke="var(--color-line)" />
      {/* toolbar */}
      <rect x="12" y="120" width="276" height="38" rx="19" fill="var(--color-surface)" stroke="var(--color-line)" />
      <path d="M32 132l-6 7 6 7" stroke="var(--color-fg-muted)" strokeWidth="2" fill="none" strokeLinecap="round" />
      <rect x="48" y="126" width="180" height="26" rx="13" fill="var(--color-surface-2)" />
      <text x="138" y="143" fontSize="11" fill="var(--color-fg)" textAnchor="middle" fontFamily="system-ui">gym-zim.vercel.app</text>
      <circle cx="260" cy="139" r="14" fill={`${IOS_BLUE}26`} stroke={IOS_BLUE} strokeWidth="1.5" />
      <g fill={IOS_BLUE}>
        <circle cx="254" cy="139" r="1.8" />
        <circle cx="260" cy="139" r="1.8" />
        <circle cx="266" cy="139" r="1.8" />
      </g>
      {/* tap hint */}
      <circle cx="217" cy="34" r="9" fill="none" stroke={IOS_BLUE} strokeOpacity="0.45" strokeWidth="3" />
    </Frame>
  )
}

/** The share sheet's action list, scrolled to Add to Home Screen. */
function StepScrollArt() {
  const rows = ['Copy', 'Add to Reading List', 'Add Bookmark', 'Add to Favourites']
  return (
    <Frame label="iOS share sheet scrolled down with Add to Home Screen highlighted">
      <rect x="30" y="8" width="240" height="160" rx="18" fill="var(--color-surface)" stroke="var(--color-line)" />
      {/* app row */}
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={46 + i * 44} y="20" width="32" height="32" rx="9" fill="var(--color-surface-2)" />
      ))}
      {rows.map((r, i) => (
        <g key={r}>
          <text x="48" y={74 + i * 19} fontSize="10.5" fill="var(--color-fg-muted)" fontFamily="system-ui">{r}</text>
          <line x1="44" y1={80 + i * 19} x2="256" y2={80 + i * 19} stroke="var(--color-line)" />
        </g>
      ))}
      <rect x="40" y="141" width="220" height="22" rx="7" fill={`${IOS_BLUE}26`} stroke={IOS_BLUE} strokeWidth="1.5" />
      <text x="48" y="156" fontSize="11" fontWeight="700" fill={IOS_BLUE} fontFamily="system-ui">Add to Home Screen</text>
      <g stroke={IOS_BLUE} strokeWidth="1.6" fill="none" strokeLinecap="round">
        <rect x="236" y="145" width="14" height="14" rx="3.5" />
        <path d="M243 149v6M240 152h6" />
      </g>
      {/* scroll cue */}
      <g stroke="var(--color-brand-500)" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M284 60v66M278 118l6 8 6-8" />
      </g>
    </Frame>
  )
}

/** The Add to Home Screen dialog with "Open as Web App" on and Add highlighted. */
function StepAddArt() {
  return (
    <Frame label="Add to Home Screen screen with Open as Web App switched on and the Add button highlighted">
      <rect x="30" y="8" width="240" height="152" rx="18" fill="var(--color-surface)" stroke="var(--color-line)" />
      <text x="46" y="32" fontSize="11" fill={IOS_BLUE} fontFamily="system-ui">Cancel</text>
      <text x="150" y="32" fontSize="11" fontWeight="700" textAnchor="middle" fill="var(--color-fg)" fontFamily="system-ui">Add to Home Screen</text>
      <rect x="222" y="18" width="38" height="20" rx="10" fill={IOS_BLUE} />
      <text x="241" y="32" fontSize="11" fontWeight="700" textAnchor="middle" fill="#fff" fontFamily="system-ui">Add</text>
      <circle cx="241" cy="28" r="17" fill="none" stroke={IOS_BLUE} strokeOpacity="0.4" strokeWidth="3" />
      <rect x="46" y="50" width="208" height="50" rx="10" fill="var(--color-surface-2)" />
      <rect x="54" y="57" width="36" height="36" rx="9" fill="var(--color-brand-500)" />
      <path d="M62 75h20M66 69v12M78 69v12" stroke="#0b1220" strokeWidth="2.5" strokeLinecap="round" />
      <text x="100" y="72" fontSize="12" fontWeight="700" fill="var(--color-fg)" fontFamily="system-ui">Gym</text>
      <text x="100" y="87" fontSize="9.5" fill="var(--color-fg-muted)" fontFamily="system-ui">gym-zim.vercel.app</text>
      <rect x="46" y="110" width="208" height="34" rx="10" fill="var(--color-surface-2)" />
      <text x="56" y="131" fontSize="11" fill="var(--color-fg)" fontFamily="system-ui">Open as Web App</text>
      <rect x="214" y="117" width="32" height="20" rx="10" fill="#30d158" />
      <circle cx="236" cy="127" r="8" fill="#fff" />
    </Frame>
  )
}

const STEPS = [
  {
    title: 'Tap Share',
    body: 'In Safari, tap Share. On iOS 26 and later it’s inside the ••• button at the bottom right.',
    Art: StepShareArt,
  },
  {
    title: 'Scroll down to “Add to Home Screen”',
    body: 'Scroll down the list of actions until you see Add to Home Screen, then tap it.',
    Art: StepScrollArt,
  },
  {
    title: 'Tap Add',
    body: 'Leave “Open as Web App” on and tap Add. Gym now opens full-screen from your Home Screen.',
    Art: StepAddArt,
  },
]

export function IosInstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add Gym to your Home Screen"
      footer={
        <Button full size="lg" onClick={onClose}>
          Got it
        </Button>
      }
    >
      <ol className="flex flex-col gap-5">
        {STEPS.map(({ title, body, Art }, i) => (
          <li key={title} className="flex flex-col gap-2.5">
            <div className="flex items-start gap-3">
              <span className="num-display grid size-8 shrink-0 place-items-center rounded-full bg-brand-500 text-lg text-ink-950">
                {i + 1}
              </span>
              <div className="min-w-0">
                <h3 className="text-lg font-bold">{title}</h3>
                <p className="text-sm text-[var(--color-fg-muted)]">{body}</p>
              </div>
            </div>
            <Art />
          </li>
        ))}
        <li className="flex items-start gap-3 rounded-2xl bg-brand-500/10 p-3.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-500 text-ink-950">
            <Icon name="bell" size={16} />
          </span>
          <p className="text-sm">
            <span className="font-semibold">Then open Gym from your Home Screen</span> and turn on
            notifications, so you hear about nudges, friend requests and challenges. iPhone only allows
            notifications for apps added to the Home Screen.
          </p>
        </li>
      </ol>
    </Sheet>
  )
}

/* -------------------------------------------------------------------------- */
/* Banners                                                                     */
/* -------------------------------------------------------------------------- */

function Banner({
  icon,
  title,
  text,
  action,
  onDismiss,
  dismissLabel,
}: {
  icon: 'download' | 'bell'
  title: string
  text: string
  action: ReactNode
  onDismiss: () => void
  dismissLabel: string
}) {
  return (
    <div className="kb-hide fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 px-4">
      <div className="animate-rise mx-auto flex max-w-2xl items-center gap-3 rounded-2xl border border-brand-500/40 bg-[var(--color-surface)] p-3 shadow-2xl shadow-ink-950/40">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-brand-400">
          <Icon name={icon} size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-[var(--color-fg-muted)]">{text}</p>
        </div>
        {action}
        <IconButton icon="x" label={dismissLabel} onClick={onDismiss} />
      </div>
    </div>
  )
}

/**
 * Add-to-home-screen + notifications nudges. Chrome/Android gets the native
 * install prompt; iPhone gets an illustrated Share → Add to Home Screen guide.
 * Once installed (or on desktop), it asks to turn notifications on.
 */
export function InstallPrompt() {
  const { user } = useAuth()
  const toast = useToast()
  const { pathname } = useLocation()
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIos, setShowIos] = useState(false)
  const [iosGuide, setIosGuide] = useState(false)
  const [askPush, setAskPush] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (isStandalone() || snoozed(INSTALL_SNOOZE)) return
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    // Delay so it doesn't land on top of the first paint.
    const timer = isIos() ? window.setTimeout(() => setShowIos(true), 4000) : undefined
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      if (timer) window.clearTimeout(timer)
    }
  }, [])

  // Ask for notifications once the app can actually receive them.
  useEffect(() => {
    if (pushSupport() !== 'supported' || notificationPermission() !== 'default' || snoozed(PUSH_SNOOZE)) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      currentSubscription()
        .then((sub) => !cancelled && !sub && setAskPush(true))
        .catch(() => {})
    }, 5000)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [])

  // Keep banners off the live workout screen.
  if (pathname === '/workout') return null

  const dismissInstall = () => {
    snooze(INSTALL_SNOOZE)
    setDeferred(null)
    setShowIos(false)
  }

  const install = async () => {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    dismissInstall()
  }

  const turnOnPush = async () => {
    if (!user) return
    setBusy(true)
    try {
      const result = await enablePush(user.uid)
      toast(
        result === 'granted' ? 'Notifications on. We’ll tell you when friends nudge you.' : 'Notifications stay off. You can turn them on in Settings.',
        result === 'granted' ? 'success' : 'info'
      )
    } catch {
      toast('Couldn’t turn on notifications.', 'error')
    } finally {
      setBusy(false)
      setAskPush(false)
      snooze(PUSH_SNOOZE)
    }
  }

  return (
    <>
      {deferred || showIos ? (
        <Banner
          icon="download"
          title="Add Gym to your Home Screen"
          text={deferred ? 'Full-screen, offline, with notifications.' : 'Full-screen, offline, and needed for notifications on iPhone.'}
          dismissLabel="Dismiss install prompt"
          onDismiss={dismissInstall}
          action={
            <Button size="sm" onClick={deferred ? install : () => setIosGuide(true)}>
              {deferred ? 'Install' : 'How'}
            </Button>
          }
        />
      ) : askPush ? (
        <Banner
          icon="bell"
          title="Turn on notifications?"
          text="Hear about nudges, friend requests and challenges."
          dismissLabel="Not now"
          onDismiss={() => {
            snooze(PUSH_SNOOZE)
            setAskPush(false)
          }}
          action={
            <Button size="sm" loading={busy} onClick={turnOnPush}>
              Turn on
            </Button>
          }
        />
      ) : null}
      <IosInstallSheet open={iosGuide} onClose={() => setIosGuide(false)} />
    </>
  )
}
