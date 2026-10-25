import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { applyUpdate, subscribeUpdate } from '../lib/swUpdate'

/** How far (px, after resistance) the finger has to drag before letting go refreshes. */
const THRESHOLD = 72
const MAX_PULL = 110

/**
 * Pull down from the top of the page to reload, like a native app. Everything
 * on screen is live from Firestore, so a reload is the honest "refresh": it
 * reconnects listeners that iOS may have stalled in the background, and picks
 * up a waiting app update at the same time.
 *
 * Only starts when the page is scrolled to the very top, no sheet is open (they
 * lock body scroll) and the touch isn't on a field, slider or anything marked
 * `data-no-pull`.
 */
export function PullToRefresh({ enabled }: { enabled: boolean }) {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const update = useRef(false)

  useEffect(() => subscribeUpdate((v) => void (update.current = v)), [])

  useEffect(() => {
    if (!enabled || refreshing) return
    let startY = 0
    let startX = 0
    let tracking = false
    let dist = 0

    const onStart = (e: TouchEvent) => {
      tracking = false
      if (e.touches.length !== 1 || window.scrollY > 0) return
      if (document.body.style.overflow === 'hidden') return
      const target = e.target as Element | null
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="slider"], [data-no-pull]')) return
      startY = e.touches[0].clientY
      startX = e.touches[0].clientX
      dist = 0
      tracking = true
    }

    const onMove = (e: TouchEvent) => {
      if (!tracking) return
      const dy = e.touches[0].clientY - startY
      const dx = e.touches[0].clientX - startX
      // A sideways swipe or an upward scroll isn't a pull.
      if (dist === 0 && (dy <= 0 || Math.abs(dx) > dy)) {
        tracking = false
        return
      }
      if (window.scrollY > 0) {
        tracking = false
        setPull(0)
        return
      }
      dist = Math.min(MAX_PULL, Math.max(0, dy) * 0.5)
      setPull(dist)
    }

    const onEnd = () => {
      if (!tracking) return
      tracking = false
      if (dist >= THRESHOLD) {
        setRefreshing(true)
        setPull(THRESHOLD)
        if (update.current) applyUpdate()
        else window.location.reload()
      } else {
        setPull(0)
      }
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [enabled, refreshing])

  if (pull === 0 && !refreshing) return null

  const progress = Math.min(1, pull / THRESHOLD)
  const ready = progress >= 1

  return (
    <div
      aria-hidden={!refreshing}
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center pt-[env(safe-area-inset-top)]"
      style={{
        transform: `translateY(${pull - 44}px)`,
        // Follows the finger exactly; only the snap to the refreshing spot eases.
        transition: refreshing ? 'transform 200ms ease-out' : 'none',
      }}
    >
      <span
        role={refreshing ? 'status' : undefined}
        className={`grid size-10 place-items-center rounded-full border border-[var(--color-line)]
          bg-[var(--color-surface)] shadow-lg shadow-ink-950/40 transition-colors duration-150 ${
            ready ? 'text-brand-400' : 'text-[var(--color-fg-muted)]'
          }`}
        style={{ opacity: 0.4 + progress * 0.6 }}
      >
        <span
          className={`grid ${refreshing ? 'animate-spin' : ''}`}
          style={refreshing ? undefined : { transform: `rotate(${progress * 270}deg)` }}
        >
          <Icon name="rotate" size={18} />
        </span>
        {refreshing ? <span className="sr-only">Refreshing</span> : null}
      </span>
    </div>
  )
}
