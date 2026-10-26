import { Icon } from '../Icon'
import type { PlanDay } from '../../types'

export type NodeState = 'done' | 'today' | 'rest' | 'upcoming'

// Horizontal offsets (px) follow a sine so the path winds but stays inside 360px screens.
const OFFSETS = [0, 40, 60, 40, 0, -40, -60, -40]
const ROW = 132
const CENTER_Y = 64
const SVG_W = 280

const offsetOf = (i: number) => OFFSETS[i % OFFSETS.length]

const FACE: Record<NodeState, { bg: string; lip: string; fg: string }> = {
  done: { bg: 'var(--color-go-500)', lip: 'var(--color-go-600)', fg: 'var(--color-ink-950)' },
  today: { bg: 'var(--color-brand-500)', lip: 'var(--color-brand-700)', fg: 'var(--color-ink-950)' },
  rest: {
    bg: 'var(--color-rest)',
    lip: 'color-mix(in srgb, var(--color-rest) 65%, black)',
    fg: 'var(--color-ink-950)',
  },
  upcoming: { bg: 'var(--color-surface-2)', lip: 'var(--color-line)', fg: 'var(--color-fg-muted)' },
}

const STATE_WORD: Record<NodeState, string> = {
  done: 'done',
  today: 'today',
  rest: 'rest day',
  upcoming: 'up next',
}

/** The active plan's current cycle as a winding path of 3D day nodes. */
export function PlanPath({
  days,
  states,
  onSelect,
}: {
  days: PlanDay[]
  states: NodeState[]
  onSelect: (index: number) => void
}) {
  return (
    <ol className="relative mx-auto w-full max-w-sm" style={{ height: days.length * ROW }}>
      {days.map((day, i) => {
        const state = states[i]
        const face = FACE[state]
        const isToday = state === 'today'
        const size = isToday ? 76 : 64
        const icon = state === 'done' ? 'check' : state === 'rest' ? 'moon' : 'dumbbell'
        const last = i === days.length - 1
        const x1 = SVG_W / 2 + offsetOf(i)
        const x2 = SVG_W / 2 + offsetOf(i + 1)
        const label = day.kind === 'rest' ? 'Rest' : day.name

        return (
          <li key={day.id} className="absolute inset-x-0" style={{ top: i * ROW, height: ROW }}>
            {!last ? (
              <svg
                aria-hidden
                width={SVG_W}
                height={ROW}
                viewBox={`0 0 ${SVG_W} ${ROW}`}
                className="pointer-events-none absolute left-1/2 -translate-x-1/2 overflow-visible"
                style={{ top: CENTER_Y }}
              >
                <path
                  d={`M ${x1} 0 C ${x1} ${ROW / 2}, ${x2} ${ROW / 2}, ${x2} ${ROW}`}
                  fill="none"
                  stroke={state === 'done' ? 'var(--color-go-500)' : 'var(--color-line)'}
                  strokeWidth={6}
                  strokeLinecap="round"
                  strokeDasharray="0 13"
                />
              </svg>
            ) : null}

            <div
              className="absolute left-1/2 flex w-28 flex-col items-center"
              style={{ top: CENTER_Y - 38, transform: `translateX(calc(-50% + ${offsetOf(i)}px))` }}
            >
              {isToday ? (
                <span
                  aria-hidden
                  className="animate-bounce-soft absolute -top-8 rounded-xl bg-[var(--color-surface)] px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-brand-400"
                  style={{ border: '2px solid var(--color-line)' }}
                >
                  Start
                  <span
                    className="absolute left-1/2 top-full size-2.5 -translate-x-1/2 -translate-y-1.5 rotate-45 bg-[var(--color-surface)]"
                    style={{ borderRight: '2px solid var(--color-line)', borderBottom: '2px solid var(--color-line)' }}
                  />
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-label={`Day ${i + 1}, ${label}, ${STATE_WORD[state]}`}
                className={`grid shrink-0 place-items-center rounded-full ${isToday ? 'animate-bounce-soft' : ''}`}
                style={{
                  width: size,
                  height: size,
                  marginTop: isToday ? 0 : (76 - size) / 2,
                  marginBottom: isToday ? 0 : (76 - size) / 2,
                  backgroundColor: face.bg,
                  color: face.fg,
                  boxShadow: isToday
                    ? `0 6px 0 ${face.lip}, 0 0 0 5px #fff`
                    : `0 5px 0 ${face.lip}`,
                }}
              >
                <Icon name={icon} size={isToday ? 34 : 28} />
              </button>
              <span className="mt-3 max-w-28 truncate text-center text-xs font-bold text-[var(--color-fg-muted)]">
                {label}
              </span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
