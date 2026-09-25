import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { Profile } from '../types'
import { useAuth } from './AuthContext'

const LOCAL_KEY = 'gym.profile'

const DEFAULTS: Profile = {
  displayName: '',
  unit: 'kg',
  theme: 'dark',
  weeklyGoal: 4,
}

interface SettingsValue {
  profile: Profile
  update: (patch: Partial<Profile>) => Promise<void>
  /** Resolved theme after 'system' is evaluated — for chart palettes. */
  resolvedTheme: 'dark' | 'light'
}

const SettingsContext = createContext<SettingsValue | null>(null)

function readLocal(): Profile {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  // Seed from localStorage so the chosen theme paints on the very first frame.
  const [profile, setProfile] = useState<Profile>(readLocal)
  const [systemDark, setSystemDark] = useState(
    () => !window.matchMedia('(prefers-color-scheme: light)').matches
  )

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = (e: MediaQueryListEvent) => setSystemDark(!e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (!user) return
    const ref = doc(db, 'users', user.uid)
    return onSnapshot(ref, (snap) => {
      const data = snap.data() as Partial<Profile> | undefined
      const next: Profile = {
        ...DEFAULTS,
        displayName: user.displayName ?? '',
        ...data,
      }
      setProfile(next)
      localStorage.setItem(LOCAL_KEY, JSON.stringify(next))
    })
  }, [user])

  const resolvedTheme: 'dark' | 'light' =
    profile.theme === 'system' ? (systemDark ? 'dark' : 'light') : profile.theme

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', resolvedTheme === 'dark')
    root.classList.toggle('light', resolvedTheme === 'light')
    root.style.colorScheme = resolvedTheme
  }, [resolvedTheme])

  const update = useCallback(
    async (patch: Partial<Profile>) => {
      // Optimistic: settings toggles must feel instant, even offline.
      setProfile((prev) => {
        const next = { ...prev, ...patch }
        localStorage.setItem(LOCAL_KEY, JSON.stringify(next))
        return next
      })
      if (user) await setDoc(doc(db, 'users', user.uid), patch, { merge: true })
    },
    [user]
  )

  const value = useMemo(() => ({ profile, update, resolvedTheme }), [profile, update, resolvedTheme])

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>')
  return ctx
}

/** Shorthand — the unit is needed in almost every numeric component. */
export function useUnit() {
  return useSettings().profile.unit
}
