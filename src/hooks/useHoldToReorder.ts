import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'

const HOLD_MS = 350
/** Moving further than this before the hold fires means the person is scrolling. */
const SLOP_PX = 8
const EDGE_PX = 80
const IGNORE = 'button, input, select, textarea, a, label, [role=button]'

/** Put on the hold area too: stops iOS selecting text or popping its callout on a long press. */
export const HOLD_HANDLE_CLASS = 'select-none [-webkit-touch-callout:none]'

type Drag = { from: number; over: number; dy: number }

function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p)
    if ((overflowY === 'auto' || overflowY === 'scroll') && p.scrollHeight > p.clientHeight) return p
  }
  return null
}

/**
 * Press and hold an item, then drag it to a new place in the list. Other items
 * slide out of the way while dragging; `onMove(from, to)` fires once on release.
 * Holding near the top or bottom edge scrolls the list (page or sheet).
 *
 * Spread `handleProps(i)` on the part of the item that starts a drag and
 * `itemProps(i)` on the item itself.
 */
export function useHoldToReorder(onMove: (from: number, to: number) => void) {
  const [drag, setDrag] = useState<Drag | null>(null)
  const items = useRef<Array<HTMLElement | null>>([])
  const onMoveRef = useRef(onMove)
  onMoveRef.current = onMove
  const cleanup = useRef<(() => void) | null>(null)
  /** Height of the dragged item plus the list gap: how far neighbours slide. */
  const dragSlot = useRef(0)

  useEffect(() => () => cleanup.current?.(), [])

  function begin(index: number, e: ReactPointerEvent) {
    if (e.button !== 0 || (e.target as HTMLElement).closest(IGNORE)) return
    cleanup.current?.()
    const startX = e.clientX
    let lastY = e.clientY
    let active = false
    let raf = 0
    const scroller = scrollParent(items.current[index])
    const scrollTop = () => (scroller ? scroller.scrollTop : window.scrollY)
    const startScroll = scrollTop()
    const startY = e.clientY
    // Item centres and the slot height, in scroll-content coordinates.
    let mids: number[] = []
    let from = index
    let over = index

    const update = () => {
      const dy = lastY - startY + (scrollTop() - startScroll)
      const centre = mids[from] + dy
      over = from
      for (let i = from + 1; i < mids.length; i++) if (centre > mids[i]) over = i
      for (let i = from - 1; i >= 0; i--) if (centre < mids[i]) over = i
      setDrag({ from, over, dy })
    }

    const tick = () => {
      const bounds = scroller?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight }
      const speed = lastY < bounds.top + EDGE_PX ? -12 : lastY > bounds.bottom - EDGE_PX ? 12 : 0
      if (speed) {
        if (scroller) scroller.scrollTop += speed
        else window.scrollBy(0, speed)
        update()
      }
      raf = requestAnimationFrame(tick)
    }

    const activate = () => {
      active = true
      const st = scrollTop()
      // Unmounted items leave trailing nulls behind.
      while (items.current.length && !items.current[items.current.length - 1]) items.current.pop()
      const rects = items.current.map((el) => el?.getBoundingClientRect() ?? null)
      mids = rects.map((r) => (r ? r.top + st + r.height / 2 : 0))
      const r = rects[from]
      const after = rects[from + 1] ?? null
      const before = rects[from - 1] ?? null
      const gap = after && r ? after.top - r.bottom : before && r ? r.top - before.bottom : 0
      dragSlot.current = (r?.height ?? 0) + gap
      navigator.vibrate?.(15)
      update()
      raf = requestAnimationFrame(tick)
    }

    const timer = window.setTimeout(activate, HOLD_MS)

    const onPointerMove = (ev: PointerEvent) => {
      if (!active) {
        if (Math.abs(ev.clientY - startY) > SLOP_PX || Math.abs(ev.clientX - startX) > SLOP_PX) stop()
        return
      }
      lastY = ev.clientY
      update()
    }
    // Once dragging, the finger must not scroll the page (iOS needs a non-passive touchmove).
    const onTouchMove = (ev: TouchEvent) => {
      if (active) ev.preventDefault()
    }
    const onUp = () => {
      const moved = active && over !== from
      if (moved) onMoveRef.current(from, over)
      if (active) {
        // Swallow the click that follows the release so it doesn't tap whatever is underneath.
        const swallow = (ev: MouseEvent) => {
          ev.stopPropagation()
          ev.preventDefault()
        }
        window.addEventListener('click', swallow, { capture: true, once: true })
        setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 50)
      }
      stop()
    }
    const onContextMenu = (ev: Event) => ev.preventDefault()

    function stop() {
      window.clearTimeout(timer)
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', stop)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('contextmenu', onContextMenu)
      cleanup.current = null
      setDrag(null)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', stop)
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('contextmenu', onContextMenu)
    cleanup.current = stop
  }

  function offset(i: number): number {
    if (!drag) return 0
    const { from, over } = drag
    if (i === from) return drag.dy
    if (from < over && i > from && i <= over) return -dragSlot.current
    if (from > over && i < from && i >= over) return dragSlot.current
    return 0
  }

  return {
    dragging: drag?.from ?? null,
    handleProps: (i: number) => ({
      onPointerDown: (e: ReactPointerEvent) => begin(i, e),
    }),
    itemProps: (i: number) => {
      const lifted = drag?.from === i
      const style: CSSProperties | undefined = drag
        ? {
            transform: `translateY(${offset(i)}px)${lifted ? ' scale(1.02)' : ''}`,
            transition: lifted ? 'none' : 'transform 160ms ease',
            position: 'relative',
            zIndex: lifted ? 20 : undefined,
            boxShadow: lifted ? '0 12px 32px rgb(0 0 0 / 0.45)' : undefined,
          }
        : undefined
      return {
        ref: (el: HTMLElement | null) => {
          items.current[i] = el
        },
        style,
      }
    },
  }
}
