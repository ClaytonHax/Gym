import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Badge, Button, EmptyState, PageTitle, Skeleton } from '../components/ui'
import { useSettings } from '../contexts/SettingsContext'
import { useWorkouts } from '../hooks/useWorkouts'
import { MUSCLE_COLORS } from '../data/exercises'
import { fmtDuration, fmtTime, relativeDay } from '../lib/date'
import { fmtVolume } from '../lib/units'
import type { MuscleGroup, Workout } from '../types'

/** Group sessions under month headings so long histories stay scannable. */
function groupByMonth(workouts: Workout[]) {
  const groups = new Map<string, Workout[]>()
  for (const w of workouts) {
    const key = new Date(w.startedAt).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    })
    const list = groups.get(key)
    if (list) list.push(w)
    else groups.set(key, [w])
  }
  return [...groups.entries()]
}

export function History() {
  const { workouts, loading } = useWorkouts()
  const { profile } = useSettings()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return workouts
    return workouts.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        w.exercises.some((ex) => ex.name.toLowerCase().includes(q))
    )
  }, [workouts, search])

  const grouped = useMemo(() => groupByMonth(filtered), [filtered])

  const totalVolume = workouts.reduce((s, w) => s + w.totalVolumeKg, 0)
  const totalTime = workouts.reduce((s, w) => s + w.durationSec, 0)

  return (
    <div className="animate-rise">
      <PageTitle
        title="History"
        subtitle={
          workouts.length > 0
            ? `${workouts.length} sessions · ${fmtVolume(totalVolume, profile.unit)} lifted · ${fmtDuration(totalTime)} trained`
            : undefined
        }
      />

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-[86px]" />
          <Skeleton className="h-[86px]" />
          <Skeleton className="h-[86px]" />
        </div>
      ) : workouts.length === 0 ? (
        <EmptyState
          icon="history"
          title="No history yet"
          message="Finished workouts land here with full set-by-set detail."
          action={
            <Button variant="go" icon="play" onClick={() => navigate('/workout')}>
              Start your first workout
            </Button>
          }
        />
      ) : (
        <>
          <div className="relative mb-5">
            <Icon
              name="search"
              size={18}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-fg-muted)]"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search workouts or exercises"
              aria-label="Search workouts or exercises"
              className="min-h-12 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] pl-11 pr-3.5 text-[var(--color-fg)] placeholder:text-[var(--color-fg-muted)] outline-none focus:border-brand-500"
            />
          </div>

          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--color-fg-muted)]">
              Nothing matches “{search}”.
            </p>
          ) : (
            <div className="flex flex-col gap-6">
              {grouped.map(([month, sessions]) => (
                <section key={month}>
                  <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-fg-muted)]">
                    {month}
                  </h2>
                  <ul className="flex flex-col gap-2">
                    {sessions.map((w) => {
                      const muscles = [...new Set(w.exercises.map((ex) => ex.muscle))].slice(0, 3)
                      return (
                        <li key={w.id}>
                          <Link
                            to={`/history/${w.id}`}
                            className="card block p-3.5 transition-colors duration-200 hover:border-brand-500/60"
                          >
                            <div className="flex items-start gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-semibold">{w.name}</p>
                                <p className="tabular text-xs text-[var(--color-fg-muted)]">
                                  {relativeDay(w.startedAt)} · {fmtTime(w.startedAt)} ·{' '}
                                  {fmtDuration(w.durationSec)}
                                </p>
                              </div>
                              <Icon
                                name="chevron-right"
                                size={16}
                                className="mt-1 shrink-0 text-[var(--color-fg-muted)]"
                              />
                            </div>

                            <div className="mt-2.5 flex items-center justify-between gap-3">
                              <div className="flex flex-wrap gap-1.5">
                                {muscles.map((m) => (
                                  <Badge key={m} color={MUSCLE_COLORS[m as MuscleGroup]}>
                                    {m}
                                  </Badge>
                                ))}
                                {w.exercises.length > 3 ? (
                                  <span className="text-[11px] font-semibold text-[var(--color-fg-muted)]">
                                    +{w.exercises.length - 3} more
                                  </span>
                                ) : null}
                              </div>
                              <p className="tabular shrink-0 text-xs text-[var(--color-fg-muted)]">
                                <span className="font-semibold text-brand-400">
                                  {fmtVolume(w.totalVolumeKg, profile.unit)}
                                </span>{' '}
                                · {w.setCount} sets
                              </p>
                            </div>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
