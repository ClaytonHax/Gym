import { useCallback, useEffect, useRef, useState } from 'react'
import { fmtClock } from '../lib/date'
import { useSettings } from '../contexts/SettingsContext'

export const REST_PRESETS = [60, 90, 120, 180]
// Pre-sync home of the chosen preset; still read so nobody loses their pick.
const LEGACY_KEY = 'gym.restPreset'

/** The user's default rest in seconds: their profile setting, else the old local pick, else 90. */
export function defaultRestSec(restSec: number | undefined): number {
  if (restSec && restSec > 0) return restSec
  try {
    const stored = Number(localStorage.getItem(LEGACY_KEY))
    if (REST_PRESETS.includes(stored)) return stored
  } catch {
    // Storage can be blocked; the default is fine.
  }
  return 90
}

/** Short vibration + beep when rest is up — the phone is usually face-down. */
function alertDone() {
  if ('vibrate' in navigator) navigator.vibrate?.([120, 60, 120])
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.5)
    osc.onended = () => void ctx.close()
  } catch {
    // Audio is a nicety — never let it break the workout.
  }
}

export const fmtPreset = (p: number) => (p < 60 ? `${p}s` : fmtClock(p))

/**
 * Rest countdown state. Driven by a target timestamp rather than an interval
 * counter, so it stays accurate when the browser throttles a background tab.
 * The workout screen renders it inside its bottom bar.
 */
export function useRestTimer() {
  const { profile, update } = useSettings()
  const duration = defaultRestSec(profile.restSec)
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const [remaining, setRemaining] = useState(0)
  // Length of the countdown in flight — a per-exercise rest can differ from the preset.
  const [total, setTotal] = useState(0)
  // Set when the plan's own rest for this exercise replaced the preset.
  const [fromPlan, setFromPlan] = useState(false)
  const firedRef = useRef(false)

  const begin = useCallback((secs: number, planned: boolean) => {
    firedRef.current = false
    setEndsAt(Date.now() + secs * 1000)
    setRemaining(secs)
    setTotal(secs)
    setFromPlan(planned)
  }, [])

  /** Start a countdown. A per-exercise `seconds` (from a plan, when allowed in Settings) wins over the preset. */
  const start = useCallback(
    (seconds?: number) => begin(seconds ?? duration, seconds !== undefined && seconds !== duration),
    [begin, duration]
  )

  const stop = useCallback(() => setEndsAt(null), [])

  useEffect(() => {
    if (endsAt === null) return
    const tick = () => {
      const left = (endsAt - Date.now()) / 1000
      setRemaining(Math.max(0, left))
      if (left <= 0 && !firedRef.current) {
        firedRef.current = true
        alertDone()
        setEndsAt(null)
      }
    }
    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [endsAt])

  /** Pick the default rest length; a countdown already running restarts at it. */
  function choose(seconds: number) {
    void update({ restSec: seconds })
    if (endsAt !== null) begin(seconds, false)
  }

  const addThirty = useCallback(() => {
    setEndsAt((e) => (e === null ? e : e + 30_000))
    setTotal((t) => t + 30)
  }, [])

  return { running: endsAt !== null, remaining, total, fromPlan, start, stop, addThirty, duration, choose }
}
