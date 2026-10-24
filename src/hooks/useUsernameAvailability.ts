import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { normalizeUsername, usernameError } from '../lib/social'

export type Availability = 'idle' | 'checking' | 'free' | 'taken' | 'invalid'

/**
 * Live validation + debounced availability check for a username being typed.
 * `current` is the name you already own, which counts as "idle" (nothing to claim).
 */
export function useUsernameAvailability(value: string, current: string | undefined, enabled = true) {
  const { user } = useAuth()
  const [status, setStatus] = useState<Availability>('idle')

  const next = normalizeUsername(value)
  const error = value ? usernameError(next) : null

  useEffect(() => {
    if (!enabled) return
    if (!value || next === current) {
      setStatus('idle')
      return
    }
    if (error) {
      setStatus('invalid')
      return
    }
    setStatus('checking')
    let cancelled = false
    const t = window.setTimeout(() => {
      getDoc(doc(db, 'usernames', next))
        .then((snap) => !cancelled && setStatus(snap.exists() && snap.data()?.uid !== user?.uid ? 'taken' : 'free'))
        .catch(() => !cancelled && setStatus('idle'))
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [enabled, value, next, error, current, user?.uid])

  return { next, error, status, setStatus }
}
