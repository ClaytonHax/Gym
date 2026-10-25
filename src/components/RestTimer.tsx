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
  /** Start a countdown. A per-exercise `seconds` (from a plan) wins over the preset and is shown as such. */
  start: (seconds?: number) => void
}

const fmtPreset = (p: number) => (p < 60 ? `${p}s` : fmtClock(p))

/**
 * Countdown driven by a target timestamp rather than an interval counter, so it
 * stays accurate when the browser throttles timers in a background tab.
 *
 * Idle, it's a normal card with the presets. While counting down it collapses to
 * one slim row that sticks to the top, so it never hides the exercise you're on.
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

  const start = useCallback(
    (seconds?: number) => begin(seconds ?? duration, seconds !== undefined && seconds !== duration),
    [begin, duration]
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
    if (endsAt !== null) begin(seconds, false)
  }

  function addThirty() {
    if (endsAt === null) return
    setEndsAt(endsAt + 30_000)
    setTotal((t) => t + 30)
  }

  const running = endsAt !== null
  const pct = running && total > 0 ? (remaining / total) * 100 : 0
  const bar = (
    <div className="h-1 bg-[var(--color-surface-2)]">
      <div
        className="h-full bg-brand-500 transition-[width] duration-200 ease-linear motion-reduce:transition-none"
        style={{ width: `${pct}%` }}
      />
    </div>
  )

  if (running) {
    return (
      <div className="card sticky top-2 z-20 overflow-hidden p-0 shadow-lg shadow-black/30">
        <div className="flex items-center gap-2 p-2">
          <button
            type="button"
            onClick={() => setEndsAt(null)}
            aria-label="Stop rest timer"
            className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-500 text-ink-950 transition-colors duration-200"
          >
            <Icon name="pause" size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="tabular font-display text-2xl font-semibold leading-none" aria-live="off">
              {fmtClock(remaining)}
            </p>
            <p className="mt-0.5 truncate text-sm text-[var(--color-fg-muted)]">
              Resting, of {fmtClock(total)}
              {fromPlan ? ' (set by your plan)' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={addThirty}
            className="min-h-11 shrink-0 rounded-lg bg-[var(--color-surface-2)] px-3 text-sm font-bold transition-colors duration-200 hover:text-brand-400"
          >
            +30s
          </button>
          <button
            type="button"
            onClick={() => setEndsAt(null)}
            className="min-h-11 shrink-0 rounded-lg bg-[var(--color-surface-2)] px-3 text-sm font-bold transition-colors duration-200 hover:text-brand-400"
          >
            Skip
          </button>
        </div>
        {bar}
      </div>
    )
  }

  return (
    <div className="card overflow-hidden p-0">
      <div className="flex items-center gap-3 p-3">
        <button
          type="button"
          onClick={() => start()}
          aria-label="Start rest timer"
          className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--color-surface-2)] text-brand-400 transition-colors duration-200 hover:bg-brand-500/15"
        >
          <Icon name="clock" size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Rest timer</p>
          <p className="text-sm text-[var(--color-fg-muted)]">
            Starts by itself after each strength set. Default rest: <span className="tabular font-semibold text-[var(--color-fg)]">{fmtClock(duration)}</span>, unless the exercise shows its own.
          </p>
        </div>
      </div>
      <div role="group" aria-label="Rest length" className="grid grid-cols-4 gap-1.5 px-3 pb-3">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => choose(p)}
            aria-pressed={duration === p}
            className={`tabular min-h-11 rounded-lg text-sm font-bold transition-colors duration-200
              ${
                duration === p
                  ? 'bg-brand-500 text-ink-950'
                  : 'bg-[var(--color-surface-2)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'
              }`}
          >
            {fmtPreset(p)}
          </button>
        ))}
      </div>
    </div>
  )
}
