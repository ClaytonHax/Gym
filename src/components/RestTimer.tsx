import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { fmtClock } from '../lib/date'

const PRESETS = [60, 90, 120, 180]
const LOCAL_KEY = 'gym.restPreset'

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

export interface RestTimerHandle {
  start: (seconds?: number) => void
}

/**
 * Countdown driven by a target timestamp rather than an interval counter, so it
 * stays accurate when the browser throttles timers in a background tab.
 */
export function RestTimer({
  onReady,
}: {
  onReady: (handle: RestTimerHandle) => void
}) {
  const [duration, setDuration] = useState(() => {
    const stored = Number(localStorage.getItem(LOCAL_KEY))
    return PRESETS.includes(stored) ? stored : 90
  })
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const [remaining, setRemaining] = useState(0)
  const firedRef = useRef(false)

  const start = useCallback(
    (seconds?: number) => {
      const secs = seconds ?? duration
      firedRef.current = false
      setEndsAt(Date.now() + secs * 1000)
      setRemaining(secs)
    },
    [duration]
  )

  useEffect(() => {
    onReady({ start })
  }, [onReady, start])

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

  function choose(seconds: number) {
    setDuration(seconds)
    localStorage.setItem(LOCAL_KEY, String(seconds))
    if (endsAt !== null) start(seconds)
  }

  const running = endsAt !== null
  const pct = running ? (remaining / duration) * 100 : 0

  return (
    <div className="card overflow-hidden p-0">
      <div className="flex items-center gap-3 p-3.5">
        <button
          type="button"
          onClick={() => (running ? setEndsAt(null) : start())}
          aria-label={running ? 'Stop rest timer' : 'Start rest timer'}
          className={`grid size-12 shrink-0 place-items-center rounded-xl transition-colors duration-200
            ${running ? 'bg-brand-500 text-white' : 'bg-[var(--color-surface-2)] text-brand-400 hover:bg-brand-500/15'}`}
        >
          <Icon name={running ? 'pause' : 'clock'} size={22} />
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-fg-muted)]">
            Rest timer
          </p>
          <p
            className="tabular font-display text-2xl font-semibold leading-tight"
            aria-live="off"
          >
            {fmtClock(running ? remaining : duration)}
          </p>
        </div>

        <div className="flex gap-1">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => choose(p)}
              aria-pressed={duration === p}
              className={`min-h-9 min-w-11 rounded-lg text-xs font-bold transition-colors duration-200
                ${
                  duration === p
                    ? 'bg-brand-500 text-white'
                    : 'bg-[var(--color-surface-2)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'
                }`}
            >
              {p < 60 ? `${p}s` : `${p / 60}m`}
            </button>
          ))}
        </div>
      </div>

      {/* Progress bar doubles as the at-a-glance signal from across the rack. */}
      <div className="h-1 bg-[var(--color-surface-2)]">
        <div
          className="h-full bg-brand-500 transition-[width] duration-200 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
