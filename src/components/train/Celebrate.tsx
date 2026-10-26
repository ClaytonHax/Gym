import { useEffect, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

const LIFETIME_MS = 1600
const XP_FLOAT_MS = 900

const COLORS = [
  'var(--color-brand-500)',
  'var(--color-go-500)',
  'var(--color-xp-400)',
  '#a78bfa',
  '#38bdf8',
]

interface Piece {
  id: number
  color: string
  round: boolean
  w: number
  h: number
  left: number
  x: number
  r: number
  d: number
}

let pieceSeq = 0

/** Unique ids so each burst's pieces remount and restart their animation. */
function makePieces(count: number): Piece[] {
  return Array.from({ length: count }, () => {
    const round = Math.random() < 0.3
    const size = 6 + Math.random() * 4
    return {
      id: pieceSeq++,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      round,
      w: size,
      h: round ? size : size * 1.6,
      // Start in a band around top-centre, then drift sideways as they fall.
      left: 50 + (Math.random() - 0.5) * 20,
      x: (Math.random() - 0.5) * 240,
      r: (Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 720),
      d: Math.random() * 150,
    }
  })
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/**
 * Falling confetti over the whole screen. Changing `burstKey` fires a new burst;
 * a key of 0 means "nothing yet", so mounting with it stays quiet.
 */
export function Confetti({
  burstKey,
  intensity = 'small',
}: {
  burstKey: number | string
  intensity?: 'small' | 'big'
}) {
  const [pieces, setPieces] = useState<Piece[]>([])

  useEffect(() => {
    if (burstKey === 0 || prefersReducedMotion()) {
      setPieces([])
      return
    }
    setPieces(makePieces(intensity === 'big' ? 60 : 24))
    const t = window.setTimeout(() => setPieces([]), LIFETIME_MS)
    return () => window.clearTimeout(t)
  }, [burstKey, intensity])

  if (pieces.length === 0 || prefersReducedMotion()) return null

  // Portalled so no ancestor's overflow or transform can clip the pieces.
  return createPortal(
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="animate-confetti-piece absolute block"
          style={
            {
              left: `${p.left}%`,
              top: '30%',
              width: p.w,
              height: p.h,
              background: p.color,
              borderRadius: p.round ? '9999px' : '2px',
              '--x': `${p.x}px`,
              '--r': `${p.r}deg`,
              '--d': `${p.d}ms`,
            } as CSSProperties
          }
        />
      ))}
    </div>,
    document.body
  )
}

/** A gold "+N XP" pill that floats up and fades. Place it in a `relative` parent. */
export function XpFloat({ amount, burstKey }: { amount: number; burstKey: number | string }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (burstKey === 0) return
    setVisible(true)
    const t = window.setTimeout(() => setVisible(false), XP_FLOAT_MS)
    return () => window.clearTimeout(t)
  }, [burstKey])

  if (!visible) return null

  return (
    <span
      // Remounting on each burst restarts the float animation.
      key={burstKey}
      aria-hidden="true"
      className="animate-xp-float pointer-events-none absolute left-1/2 top-0 z-10 whitespace-nowrap rounded-full bg-[var(--color-xp-400)] px-2.5 py-0.5 text-sm font-bold text-[var(--color-ink-950)] tabular"
    >
      +{amount} XP
    </span>
  )
}
