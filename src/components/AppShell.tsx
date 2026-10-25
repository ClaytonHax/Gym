import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Icon, type IconName } from './Icon'
import { useActiveWorkout } from '../hooks/useActiveWorkout'
import { fmtDuration } from '../lib/date'
import { SocialSync } from './SocialSync'
import { ProfileSetup } from './ProfileSetup'
import { PublicPlanSeeder } from './plans'
import { useSocial } from '../contexts/SocialContext'
import { PlanSyncProvider } from '../contexts/PlanSyncContext'
import { PullToRefresh } from './PullToRefresh'

const TABS: Array<{ to: string; label: string; icon: IconName; primary?: boolean }> = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/plans', label: 'Plans', icon: 'layers' },
  { to: '/workout', label: 'Train', icon: 'dumbbell', primary: true },
  { to: '/friends', label: 'Friends', icon: 'users' },
  { to: '/progress', label: 'Progress', icon: 'trending' },
]

/** Screens mid-edit, where a stray pull-down reload would throw work away. */
function pullAllowed(pathname: string): boolean {
  if (pathname === '/workout' || pathname === '/plans/new' || pathname.endsWith('/edit')) return false
  // /plans/:id is the editor; /plans/library and /plans/view/:id are read-only.
  return !/^\/plans\/(?!library$|view\/)[^/]+$/.test(pathname)
}

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
    <div className="flex items-center justify-center gap-2 bg-amber-500/15 px-4 py-2 text-sm font-semibold text-amber-400">
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
      className="flex min-h-14 items-center gap-3 border-t border-brand-500/30 bg-brand-500/15 px-4 py-2.5
        transition-colors duration-200 hover:bg-brand-500/25"
    >
      <span className="animate-pulse-ring grid size-8 shrink-0 place-items-center rounded-full bg-brand-500 text-ink-950">
        <Icon name="dumbbell" size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{active.planDayName ?? active.name}</span>
        <span className="tabular block text-sm text-[var(--color-fg-muted)]">
          Workout in progress · {fmtDuration(elapsed)}
        </span>
      </span>
      <span className="text-sm font-bold uppercase tracking-wider text-brand-400">Resume</span>
      <Icon name="chevron-right" size={16} className="text-brand-400" />
    </NavLink>
  )
}

export function AppShell() {
  const { pathname } = useLocation()
  const { incoming, unread } = useSocial()
  const friendsBadge = incoming.length + unread

  // A fresh route should start at the top, like a native screen push.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <PlanSyncProvider>
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-60
          focus:rounded-lg focus:bg-brand-500 focus:px-4 focus:py-2 focus:font-semibold focus:text-ink-950"
      >
        Skip to content
      </a>

      <PullToRefresh enabled={pullAllowed(pathname)} />

      <div className="safe-top">
        <OfflineBanner />
      </div>

      {/* Bottom padding clears the nav bar, the centre Train button that rises above it, the active-workout strip and the install banner. */}
      <main id="main" className="mx-auto w-full max-w-2xl px-4 pb-56 pt-4">
        <Outlet />
      </main>

      <SocialSync />
      <ProfileSetup />
      <PublicPlanSeeder />

      <nav
        aria-label="Main"
        className="kb-hide safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-line)]
          bg-[var(--color-surface)]/95 shadow-[0_-12px_32px_-20px_rgb(0,0,0,0.6)] backdrop-blur-lg"
      >
        <ActiveWorkoutBar />
        <ul className="mx-auto flex max-w-2xl items-end">
          {TABS.map((tab) => (
            <li key={tab.to} className="flex-1">
              <NavLink
                to={tab.to}
                end={tab.to === '/'}
                className={({ isActive }) =>
                  tab.primary
                    ? `group relative -mt-2 flex flex-col items-center gap-1 pb-2 ${
                        isActive ? 'text-brand-400' : 'text-[var(--color-fg-muted)]'
                      }`
                    : `flex min-h-14 flex-col items-center justify-center gap-1 py-2
                       transition-colors duration-200 ${
                         isActive
                           ? 'text-brand-400'
                           : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'
                       }`
                }
              >
                {({ isActive }) =>
                  tab.primary ? (
                    <>
                      <span
                        className="grid size-12 place-items-center rounded-2xl bg-brand-500 text-ink-950
                          shadow-lg shadow-brand-500/40 ring-4 ring-[var(--color-surface)]
                          transition-[background-color,transform] duration-200 group-hover:bg-brand-400
                          group-active:scale-95"
                      >
                        <Icon name={tab.icon} size={24} />
                      </span>
                      <span className="text-xs font-bold uppercase tracking-wider">{tab.label}</span>
                    </>
                  ) : (
                    <>
                      {/* Active state is shape (pill) + colour, not colour alone. */}
                      <span
                        className={`grid h-8 w-14 place-items-center rounded-full transition-colors duration-200 ${
                          isActive ? 'bg-brand-500/15' : 'bg-transparent'
                        }`}
                      >
                        <span className="relative">
                          <Icon name={tab.icon} size={22} />
                          {tab.to === '/friends' && friendsBadge > 0 ? (
                            <span className="absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-[var(--color-surface)]">
                              {friendsBadge > 9 ? '9+' : friendsBadge}
                              <span className="sr-only"> new</span>
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <span className="text-xs font-bold uppercase tracking-wider">{tab.label}</span>
                    </>
                  )
                }
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
    </PlanSyncProvider>
  )
}
