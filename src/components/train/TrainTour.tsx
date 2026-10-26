import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { Icon, type IconName } from '../Icon'
import { Button, StreakBadge } from '../ui'
import { useSettings } from '../../contexts/SettingsContext'
import { useSocial } from '../../contexts/SocialContext'
import { useActiveWorkout } from '../../hooks/useActiveWorkout'
import { setHapticsEnabled } from '../../lib/haptics'
import type { Profile } from '../../types'

const TOUR_ID = 'train-v2'
const OPEN_EVENT = 'gym:train-tour'
// Mirrored locally so the tour stays dismissed when offline or before the profile syncs.
const SEEN_KEY = `gym.tour.${TOUR_ID}`

/** Seen if either the synced profile or this device says so. */
export function trainTourSeen(profile: Pick<Profile, 'seenTours'>): boolean {
  if (profile.seenTours?.includes(TOUR_ID)) return true
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Open the walkthrough from anywhere. By default it opens even if already seen
 * (Settings replay). `unseenOnly` is for the onboarding chain, where a repeat
 * of an already-seen tour would be unwelcome.
 */
export function openTrainTour(opts: { unseenOnly?: boolean } = {}): void {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { unseenOnly: opts.unseenOnly === true } }))
}

/* -------------------------------------------------------------------------- */
/* Illustrations: small CSS-only copies of real UI bits. Decorative only.      */
/* -------------------------------------------------------------------------- */

const PATH_NODES: Array<{ x: number; y: number; state: 'done' | 'today' | 'locked' }> = [
  { x: 14, y: 62, state: 'done' },
  { x: 38, y: 30, state: 'done' },
  { x: 62, y: 66, state: 'today' },
  { x: 86, y: 34, state: 'locked' },
]

const NODE_TONE = {
  done: 'size-11 bg-go-500 text-ink-950 shadow-[0_4px_0_var(--color-go-600)]',
  today: 'size-14 bg-brand-500 text-ink-950 shadow-[0_5px_0_var(--color-brand-700)] animate-pulse-ring',
  locked: 'size-11 border-2 border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-fg-muted)]',
}

const NODE_ICON: Record<'done' | 'today' | 'locked', IconName> = {
  done: 'check',
  today: 'dumbbell',
  locked: 'lock',
}

function PathArt() {
  return (
    <div className="relative size-full">
      <svg className="absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polyline
          points={PATH_NODES.map((n) => `${n.x},${n.y}`).join(' ')}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth="3"
          strokeDasharray="2 7"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {PATH_NODES.map((n, i) => (
        <span
          key={i}
          className="absolute"
          style={{ left: `${n.x}%`, top: `${n.y}%`, transform: 'translate(-50%, -50%)' }}
        >
          {n.state === 'today' ? (
            <span className="absolute -top-9 left-1/2 -translate-x-1/2 rounded-lg bg-brand-500 px-2 py-0.5 text-[10px] font-bold tracking-wider whitespace-nowrap text-ink-950">
              START
            </span>
          ) : null}
          <span className={`grid place-items-center rounded-full ${NODE_TONE[n.state]}`}>
            <Icon name={NODE_ICON[n.state]} size={n.state === 'today' ? 24 : 18} />
          </span>
        </span>
      ))}
    </div>
  )
}

function MiniStepper({ value, unit }: { value: string; unit: string }) {
  return (
    <div className="tabular min-w-20 rounded-xl bg-[var(--color-surface)] px-3 py-1.5 text-center font-display text-2xl leading-none font-bold shadow-sm">
      {value}
      <span className="ml-1 text-xs font-medium text-[var(--color-fg-muted)]">{unit}</span>
    </div>
  )
}

function StepperArt() {
  return (
    <div className="flex flex-col items-center gap-2.5">
      <div className="flex gap-2">
        <MiniStepper value="60" unit="kg" />
        <MiniStepper value="10" unit="reps" />
      </div>
      <span className="btn-3d btn-3d-go inline-flex h-10 items-center rounded-xl px-5 text-sm">Log set</span>
    </div>
  )
}

function RestArt() {
  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex items-center gap-2.5 rounded-2xl bg-[var(--color-surface)] px-3 py-2.5 shadow-sm">
        <Icon name="clock" size={16} className="shrink-0 text-rest" />
        <span className="tabular flex-1 font-display text-3xl leading-none font-bold">1:24</span>
        <span className="rounded-lg bg-rest/15 px-2 py-1 text-xs font-bold text-rest">+30s</span>
        <span className="rounded-lg bg-[var(--color-surface-2)] px-2 py-1 text-xs font-bold text-[var(--color-fg-muted)]">
          Skip
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-line)]">
        <div className="h-full w-3/5 rounded-full bg-rest" />
      </div>
    </div>
  )
}

function XpArt() {
  return (
    <div className="flex items-center gap-3">
      <span className="animate-pop rounded-full bg-[var(--color-xp-400)] px-3 py-1.5 font-display text-lg leading-none font-bold text-ink-950">
        +10 XP
      </span>
      <span className="grid size-14 place-items-center rounded-2xl bg-violet-500 font-display text-xl leading-none font-bold text-white">
        Lv 4
      </span>
      <StreakBadge count={5} size="sm" />
    </div>
  )
}

const EXTRAS: Array<{ label: string; icon: IconName }> = [
  { label: 'Swap', icon: 'rotate' },
  { label: 'Superset', icon: 'link' },
  { label: 'Plate math', icon: 'calculator' },
  { label: 'Copy last time', icon: 'copy' },
  { label: 'Notes', icon: 'note' },
]

function ExtrasArt() {
  return (
    <div className="flex flex-col items-center gap-2.5">
      <span className="grid size-11 place-items-center rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]">
        <Icon name="more" size={22} />
      </span>
      <div className="flex flex-wrap justify-center gap-1.5">
        {EXTRAS.map((x) => (
          <span
            key={x.label}
            className="flex items-center gap-1.5 rounded-full bg-[var(--color-surface)] px-2.5 py-1 text-xs font-semibold"
          >
            <Icon name={x.icon} size={12} />
            {x.label}
          </span>
        ))}
      </div>
    </div>
  )
}

interface Slide {
  title: string
  body: string
  art: ReactNode
  isNew?: boolean
}

const SLIDES: Slide[] = [
  {
    title: 'Your plan is a path',
    body: "Tap the glowing day to start today's workout.",
    art: <PathArt />,
    isNew: true,
  },
  {
    title: 'Log a set in one tap',
    body: 'Numbers fill in from last time. Tap a box to type a new one, then hit LOG SET.',
    art: <StepperArt />,
  },
  {
    title: 'Rest runs itself',
    body: 'After each set the rest timer starts at the bottom. Skip it or add time.',
    art: <RestArt />,
  },
  {
    title: 'Earn XP, keep the streak',
    body: 'Every set earns XP. PRs and finishing earn bonus XP. Train to keep your streak and clear 3 daily quests.',
    art: <XpArt />,
  },
  {
    title: 'Everything else is in ⋯',
    body: 'Tap ⋯ on an exercise for extras. Tap any exercise bubble at the top to jump to it.',
    art: <ExtrasArt />,
  },
]

const SWIPE_PX = 50

function TrainTour({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  // Read through a ref so the effect below doesn't re-run on every render.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const swipeStart = useRef<number | null>(null)
  const last = index === SLIDES.length - 1
  const slide = SLIDES[index]

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      // Keep Tab cycling inside the card, like Sheet does.
      const focusables = panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled])')
      if (focusables.length === 0) return
      const first = focusables[0]
      const lastEl = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    const raf = requestAnimationFrame(() => panelRef.current?.focus({ preventScroll: true }))

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      cancelAnimationFrame(raf)
      document.body.style.overflow = overflow
      previouslyFocused?.focus?.()
    }
  }, [])

  function next() {
    if (last) onClose()
    else setIndex((i) => i + 1)
  }

  function back() {
    setIndex((i) => Math.max(0, i - 1))
  }

  // Portal to <body>, same reason as Sheet: a transformed ancestor would trap the fixed overlay.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="animate-fade absolute inset-0 bg-ink-950/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onPointerDown={(e) => {
          swipeStart.current = e.clientX
        }}
        onPointerUp={(e) => {
          const start = swipeStart.current
          swipeStart.current = null
          if (start === null) return
          const dx = e.clientX - start
          if (Math.abs(dx) < SWIPE_PX) return
          if (dx < 0 && !last) setIndex((i) => i + 1)
          else if (dx > 0) back()
        }}
        onPointerCancel={() => {
          swipeStart.current = null
        }}
        className="card animate-pop relative flex w-full max-w-sm flex-col gap-5 rounded-3xl p-5 shadow-2xl outline-none"
      >
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl px-3 text-sm font-semibold text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)]"
          >
            Skip
          </button>
        </div>

        <div className="flex h-36 items-center justify-center overflow-hidden rounded-2xl bg-[var(--color-surface-2)] p-3" aria-hidden="true">
          {slide.art}
        </div>

        <div key={index} className="animate-pop flex flex-col gap-2">
          {slide.isNew ? (
            <span className="self-start rounded-md bg-brand-500 px-2 py-0.5 text-[11px] font-bold tracking-wider text-ink-950 uppercase">
              New
            </span>
          ) : null}
          <h2 id={titleId} className="font-display text-2xl leading-tight font-bold tracking-wide">
            {slide.title}
          </h2>
          <p className="text-[var(--color-fg-muted)]">{slide.body}</p>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex justify-center gap-1.5" aria-hidden="true">
            {SLIDES.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  i === index ? 'w-6 bg-brand-500' : 'w-1.5 bg-[var(--color-line)]'
                }`}
              />
            ))}
          </div>
          <p className="sr-only" aria-live="polite">
            Step {index + 1} of {SLIDES.length}
          </p>

          <div className="flex gap-3">
            {index > 0 ? (
              <Button variant="ghost" onClick={back}>
                Back
              </Button>
            ) : null}
            <button
              type="button"
              onClick={next}
              className="btn-3d btn-3d-go inline-flex min-h-14 flex-1 items-center justify-center gap-2 px-6 text-base"
            >
              {last ? "Let's train" : 'Next'}
              {last ? null : <Icon name="arrow-right" size={18} />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

/**
 * Mounted once in AppShell. Auto-opens the walkthrough the first time, and
 * listens for `openTrainTour()`. Also applies the vibration setting app-wide.
 */
export function TrainTourHost() {
  const { profile, update } = useSettings()
  const { me } = useSocial()
  const { active } = useActiveWorkout()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const autoShown = useRef(false)

  const profileRef = useRef(profile)
  profileRef.current = profile
  const updateRef = useRef(update)
  updateRef.current = update

  useEffect(() => {
    setHapticsEnabled(profile.haptics !== false)
  }, [profile.haptics])

  useEffect(() => {
    const onOpen = (e: Event) => {
      const unseenOnly = (e as CustomEvent<{ unseenOnly?: boolean }>).detail?.unseenOnly === true
      if (unseenOnly && trainTourSeen(profileRef.current)) return
      setOpen(true)
    }
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [])

  // Not while ProfileSetup is showing (freeChange), and not mid-workout on the Train screen.
  const eligible =
    !trainTourSeen(profile) && Boolean(me) && !me?.freeChange && !(active && pathname === '/workout')

  useEffect(() => {
    if (!eligible || open || autoShown.current) return
    // Short delay so the page settles, and a fresh device's synced profile (seenTours) can arrive first.
    const id = window.setTimeout(() => {
      autoShown.current = true
      setOpen(true)
    }, 1200)
    return () => window.clearTimeout(id)
  }, [eligible, open])

  const close = useCallback(() => {
    setOpen(false)
    try {
      localStorage.setItem(SEEN_KEY, '1')
    } catch {
      // Private mode: the synced copy below still records it.
    }
    const seenTours = profileRef.current.seenTours ?? []
    if (!seenTours.includes(TOUR_ID)) {
      updateRef.current({ seenTours: [...seenTours, TOUR_ID] }).catch(() => {
        // Local flag is already set, so it won't nag again on this device.
      })
    }
  }, [])

  if (!open) return null
  return <TrainTour onClose={close} />
}
