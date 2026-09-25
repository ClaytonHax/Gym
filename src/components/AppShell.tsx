import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Icon, type IconName } from './Icon'
import { useActiveWorkout } from '../hooks/useActiveWorkout'
import { fmtDuration } from '../lib/date'
import { InstallPrompt } from './InstallPrompt'

const TABS: Array<{ to: string; label: string; icon: IconName }> = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/history', label: 'History', icon: 'history' },
  { to: '/workout', label: 'Train', icon: 'dumbbell' },
  { to: '/progress', label: 'Progress', icon: 'trending' },
  { to: '/body', label: 'Body', icon: 'scale' },
]

function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  if (!offline) return null
  return (
    <div className="flex items-center justify-center gap-2 bg-amber-500/15 px-4 py-2 text-xs font-semibold text-amber-400">
      <Icon name="wifi-off" size={14} />
      Offline — your sets are saved and will sync automatically
    </div>
  )
}

/** Persistent "workout in progress" strip, so you can never lose the session. */
function ActiveWorkoutBar() {
  const { active } = useActiveWorkout()
  const { pathname } = useLocation()
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!active) return
    const tick = () =>
      setElapsed((Date.now() - new Date(active.startedAt).getTime()) / 1000)
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [active])

  if (!active || pathname === '/workout') return null

  return (
    <NavLink
      to="/workout"
      className="flex items-center gap-3 border-t border-brand-500/30 bg-brand-500/15 px-4 py-2.5
        transition-colors duration-200 hover:bg-brand-500/25"
    >
      <span className="animate-pulse-ring grid size-8 shrink-0 place-items-center rounded-full bg-brand-500 text-white">
        <Icon name="dumbbell" size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{active.name}</span>
        <span className="tabular block text-xs text-[var(--color-fg-muted)]">
          In progress · {fmtDuration(elapsed)}
        </span>
      </span>
      <span className="text-xs font-bold uppercase tracking-wider text-brand-400">Resume</span>
      <Icon name="chevron-right" size={16} className="text-brand-400" />
    </NavLink>
  )
}

export function AppShell() {
  const { pathname } = useLocation()

  // A fresh route should start at the top, like a native screen push.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-60
          focus:rounded-lg focus:bg-brand-500 focus:px-4 focus:py-2 focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>

      <div className="safe-top sticky top-0 z-30 bg-[var(--color-canvas)]/80 backdrop-blur-md">
        <OfflineBanner />
      </div>

      {/* Bottom padding clears the nav bar + active-workout strip. */}
      <main id="main" className="mx-auto w-full max-w-2xl px-4 pb-40 pt-4">
        <Outlet />
      </main>

      <InstallPrompt />

      <nav
        aria-label="Main"
        className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-line)]
          bg-[var(--color-surface)]/95 backdrop-blur-lg"
      >
        <ActiveWorkoutBar />
        <ul className="mx-auto flex max-w-2xl">
          {TABS.map((tab) => (
            <li key={tab.to} className="flex-1">
              <NavLink
                to={tab.to}
                end={tab.to === '/'}
                className={({ isActive }) =>
                  `flex min-h-14 flex-col items-center justify-center gap-1 py-2
                   transition-colors duration-200 ${
                     isActive
                       ? 'text-brand-400'
                       : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'
                   }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon name={tab.icon} size={22} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      {tab.label}
                    </span>
                    {/* Active state is shape + colour, not colour alone. */}
                    <span
                      className={`h-0.5 w-6 rounded-full transition-colors duration-200 ${
                        isActive ? 'bg-brand-500' : 'bg-transparent'
                      }`}
                    />
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
