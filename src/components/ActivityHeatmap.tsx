import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sheet } from './ui'
import { buildHeatmap, type HeatCell } from '../lib/streaks'
import { useSettings } from '../contexts/SettingsContext'
import { parseDayKey } from '../lib/date'
import { fmtVolume } from '../lib/units'

const VARIANTS = {
  // Up to 26 weeks; trimmed to whatever fits the card at runtime.
  compact: { weeks: 26, cell: 11, gap: 2 },
  full: { weeks: 53, cell: 12, gap: 3 },
} as const

const DAY_LABELS = ['M', '', 'W', '', 'F', '', '']

function fmtLong(key: string): string {
  return parseDayKey(key).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function describe(cell: HeatCell): string {
  const date = fmtLong(cell.date)
  if (cell.workoutCount > 0) {
    return `${date}: ${cell.workoutCount} ${cell.workoutCount === 1 ? 'workout' : 'workouts'}, ${cell.setCount} ${cell.setCount === 1 ? 'set' : 'sets'}`
  }
  if (cell.isRest) return `${date}: planned rest day`
  if (cell.isFuture) return `${date}: upcoming`
  return `${date}: no workout`
}

/** GitHub contribution-graph style grid: columns are weeks, rows are Mon–Sun. */
export function ActivityHeatmap({
  workouts,
  isRestDay,
  variant = 'compact',
  className = '',
  readOnly = false,
}: {
  workouts: Parameters<typeof buildHeatmap>[0]
  isRestDay?: (date: string) => boolean
  variant?: 'compact' | 'full'
  className?: string
  /** Someone else's activity: days show totals but don't link to sessions. */
  readOnly?: boolean
}) {
  const { weeks: maxWeeks, cell, gap } = VARIANTS[variant]
  const scroller = useRef<HTMLDivElement>(null)
  // Compact trims to however many whole weeks fit, so no column is ever half-cut
  // (a clipped first column also clipped its month label).
  const [fitWeeks, setFitWeeks] = useState<number>(maxWeeks)
  useEffect(() => {
    const el = scroller.current
    if (variant !== 'compact' || !el) return
    const measure = () =>
      setFitWeeks(Math.max(8, Math.min(maxWeeks, Math.floor((el.clientWidth + gap) / (cell + gap)))))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [variant, maxWeeks, cell, gap])
  const weeks = variant === 'compact' ? fitWeeks : maxWeeks
  const data = useMemo(
    () => buildHeatmap(workouts, weeks, { isRestDay }),
    [workouts, weeks, isRestDay]
  )
  const { profile } = useSettings()
  const [selected, setSelected] = useState<HeatCell | null>(null)

  // Land on the latest week; older history is a swipe away.
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [weeks])

  const step = cell + gap
  const total = data.weeks.reduce((n, w) => n + w.reduce((m, c) => m + c.workoutCount, 0), 0)
  const activeDays = data.weeks.reduce((n, w) => n + w.filter((c) => c.workoutCount > 0).length, 0)

  return (
    <div className={className}>
      <p className="sr-only">
        {total} workouts across {activeDays} days in the last {weeks} weeks. Select a day for
        details.
      </p>

      <div className="flex gap-1.5">
        {/* Weekday labels stay put while the grid scrolls. */}
        <div
          aria-hidden="true"
          className="grid shrink-0 pt-[18px] text-[9px] font-bold leading-none text-[var(--color-fg-muted)]"
          style={{ gridTemplateRows: `repeat(7, ${cell}px)`, rowGap: gap }}
        >
          {DAY_LABELS.map((l, i) => (
            <span key={i} className="flex items-center">
              {l}
            </span>
          ))}
        </div>

        <div ref={scroller} className="no-scrollbar min-w-0 flex-1 overflow-x-auto pb-1">
          <div style={{ width: data.weeks.length * step - gap }}>
            <div className="relative h-[18px]" aria-hidden="true">
              {data.months.map((m) => (
                <span
                  key={m.col}
                  className="absolute top-0 text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]"
                  style={{ left: m.col * step }}
                >
                  {m.label}
                </span>
              ))}
            </div>
            <div className="flex" style={{ gap }}>
              {data.weeks.map((week) => (
                <div
                  key={week[0].date}
                  className="grid"
                  style={{ gridTemplateRows: `repeat(7, ${cell}px)`, gap }}
                >
                  {week.map((c) => (
                    <button
                      key={c.date}
                      type="button"
                      className="heat-cell"
                      data-level={c.level}
                      data-rest={c.isRest ? 'true' : undefined}
                      data-future={c.isFuture ? 'true' : undefined}
                      data-selected={selected?.date === c.date ? 'true' : undefined}
                      style={{
                        width: cell,
                        height: cell,
                        minWidth: 0,
                        minHeight: 0,
                        padding: 0,
                        outline: c.isToday ? '1.5px solid var(--color-brand-400)' : undefined,
                        outlineOffset: 1,
                      }}
                      aria-label={describe(c)}
                      onClick={() => setSelected(c)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div
        className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] font-semibold text-[var(--color-fg-muted)]"
        aria-hidden="true"
      >
        <span className="flex items-center gap-1.5">
          <span className="heat-cell" data-rest="true" style={{ width: cell, height: cell }} />
          Rest day
        </span>
        <span className="flex items-center gap-1.5">
          Less
          {([0, 1, 2, 3, 4] as const).map((l) => (
            <span key={l} className="heat-cell" data-level={l} style={{ width: cell, height: cell }} />
          ))}
          More
        </span>
      </div>

      <Sheet
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? fmtLong(selected.date) : ''}
      >
        {selected ? (
          selected.workoutCount > 0 ? (
            <ul className="flex flex-col gap-2">
              {readOnly ? (
                <li className="card p-3.5 font-semibold">
                  {selected.workouts.map((w) => w.name).join(', ')}
                </li>
              ) : null}
              {readOnly ? null : selected.workouts.map((w) => (
                <li key={w.id}>
                  <Link
                    to={`/history/${w.id}`}
                    onClick={() => setSelected(null)}
                    className="card flex min-h-12 items-center justify-between gap-3 p-3.5 font-semibold
                      transition-colors duration-200 hover:border-brand-500/60"
                  >
                    <span className="truncate">{w.name}</span>
                    <span className="text-xs font-bold uppercase tracking-wider text-brand-400">View</span>
                  </Link>
                </li>
              ))}
              <li className="tabular pt-1 text-sm text-[var(--color-fg-muted)]">
                {selected.setCount} {selected.setCount === 1 ? 'set' : 'sets'} · {fmtVolume(selected.volumeKg, profile.unit)}
              </li>
            </ul>
          ) : (
            <p className="text-[var(--color-fg-muted)]">
              {selected.isRest
                ? 'Planned rest day. Recovery counts toward your streak.'
                : selected.isFuture
                  ? 'Nothing logged yet.'
                  : 'No workout logged.'}
            </p>
          )
        ) : null}
      </Sheet>
    </div>
  )
}
