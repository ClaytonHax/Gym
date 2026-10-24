import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import {
  Badge,
  Button,
  Card,
  ChartTable,
  EmptyState,
  SectionHeader,
  Skeleton,
  StatTile,
} from '../components/ui'
import { BodyWeightChart } from '../components/LazyCharts'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useWorkouts } from '../hooks/useWorkouts'
import { useBodyLog } from '../hooks/useBodyLog'
import { useActiveWorkout } from '../hooks/useActiveWorkout'
import { MUSCLE_COLORS } from '../data/exercises'
import { nextProgram, planToExercises, PROGRAMS } from '../data/programs'
import { estimateMinutes } from './StartScreen'
import { fmtVolume, fmtWeight } from '../lib/units'
import { addDays, dayKey, fmtDuration, relativeDay, startOfWeek } from '../lib/date'
import { muscleRecovery } from '../lib/recovery'
import { bodyWeightSeries, personalRecords, weekStreak, workoutsThisWeek } from '../lib/stats'
import type { MuscleGroup } from '../types'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

/** Mon–Sun dots showing which days were trained this week. */
function WeekStrip({ trainedDays, goal }: { trainedDays: Set<string>; goal: number }) {
  const monday = startOfWeek()
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const done = trainedDays.size
  const pct = Math.min(100, goal > 0 ? (done / goal) * 100 : 0)

  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-base font-semibold">This week</h2>
        <p className="tabular text-sm text-[var(--color-fg-muted)]">
          <span className="font-semibold text-[var(--color-fg)]">{done}</span> / {goal} sessions
        </p>
      </div>

      <div className="mb-4 h-2 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
        <div
          className="h-full rounded-full bg-go-500 transition-[width] duration-500"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={done}
          aria-valuemin={0}
          aria-valuemax={goal}
          aria-label={`${done} of ${goal} weekly sessions completed`}
        />
      </div>

      <ul className="flex justify-between">
        {days.map((d) => {
          const key = dayKey(d)
          const trained = trainedDays.has(key)
          const isToday = key === dayKey()
          const future = d.getTime() > Date.now()
          return (
            <li key={key} className="flex flex-col items-center gap-1.5">
              <span
                className={`text-[10px] font-bold uppercase tracking-wider ${
                  isToday ? 'text-brand-400' : 'text-[var(--color-fg-muted)]'
                }`}
              >
                {d.toLocaleDateString(undefined, { weekday: 'narrow' })}
              </span>
              <span
                className={`grid size-8 place-items-center rounded-full border text-xs font-semibold
                  ${
                    trained
                      ? 'border-go-500 bg-go-500 text-ink-950'
                      : future
                        ? 'border-dashed border-[var(--color-line)] text-[var(--color-fg-muted)]'
                        : 'border-[var(--color-line)] bg-[var(--color-surface-2)] text-[var(--color-fg-muted)]'
                  }
                  ${isToday && !trained ? 'ring-2 ring-brand-500/50' : ''}`}
              >
                {trained ? <Icon name="check" size={14} title="Trained" /> : d.getDate()}
              </span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

const RECOVERY_STYLE = {
  fresh: 'border-go-500/40 bg-go-500/10 text-go-400',
  recovering: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
  untrained: 'border-[var(--color-line)] bg-[var(--color-surface-2)] text-[var(--color-fg-muted)]',
} as const

/** Which muscles are ready to train again — a rule-based take on Fitbod's recovery view. */
function RecoveryCard({ workouts }: { workouts: Parameters<typeof muscleRecovery>[0] }) {
  const items = useMemo(() => muscleRecovery(workouts), [workouts])
  return (
    <Card>
      <h2 className="mb-3 text-base font-semibold">Muscle recovery</h2>
      <ul className="grid grid-cols-2 gap-2">
        {items.map((m) => (
          <li
            key={m.muscle}
            className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm ${RECOVERY_STYLE[m.state]}`}
          >
            <span className="font-semibold">{m.muscle}</span>
            <span className="tabular text-xs">
              {m.hoursSince === null
                ? 'Not yet'
                : m.state === 'fresh'
                  ? 'Ready'
                  : `${Math.ceil(m.hoursSince)}h ago`}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-[var(--color-fg-muted)]">
        Green means enough time has passed since you last trained it (24–72h by muscle).
      </p>
    </Card>
  )
}

export function Dashboard() {
  const { user } = useAuth()
  const { profile } = useSettings()
  const navigate = useNavigate()
  const { workouts, loading } = useWorkouts()
  const { entries, latest, previous, loading: bodyLoading } = useBodyLog()
  const { active, save } = useActiveWorkout()

  const unit = profile.unit
  const firstName = (profile.displayName || user?.displayName || '').split(' ')[0]

  const thisWeek = useMemo(() => workoutsThisWeek(workouts), [workouts])
  const trainedDays = useMemo(
    () => new Set(thisWeek.map((w) => dayKey(new Date(w.startedAt)))),
    [thisWeek]
  )
  const streak = useMemo(() => weekStreak(workouts), [workouts])
  const prs = useMemo(() => personalRecords(workouts).slice(0, 3), [workouts])
  const bwSeries = useMemo(() => bodyWeightSeries(entries, 90), [entries])

  const weekVolume = thisWeek.reduce((s, w) => s + w.totalVolumeKg, 0)
  const weekSets = thisWeek.reduce((s, w) => s + w.setCount, 0)
  const recent = workouts.slice(0, 3)

  const weightDelta = latest && previous ? latest.weightKg - previous.weightKg : null

  const next = useMemo(() => nextProgram(workouts), [workouts])

  function startProgram(id: string) {
    const program = PROGRAMS.find((p) => p.id === id)
    if (!program) return
    save({
      name: program.name,
      startedAt: new Date().toISOString(),
      exercises: planToExercises(program.exercises),
    })
    navigate('/workout')
  }

  return (
    <div className="animate-rise flex flex-col gap-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--color-fg-muted)]">{greeting()}</p>
          <h1 className="font-display text-3xl font-semibold tracking-wide">
            {firstName || 'Athlete'}
          </h1>
        </div>
        <Link
          to="/settings"
          aria-label="Settings"
          className="grid size-11 shrink-0 place-items-center rounded-xl border border-[var(--color-line)]
            bg-[var(--color-surface)] text-[var(--color-fg-muted)] transition-colors duration-200
            hover:border-brand-500/60 hover:text-brand-400"
        >
          <Icon name="settings" size={20} />
        </Link>
      </header>

      {/* Primary action — the one thing you open this app to do. */}
      {active ? (
        <Button
          size="lg"
          full
          icon="dumbbell"
          onClick={() => navigate('/workout')}
          className="text-lg"
        >
          Resume {active.name}
        </Button>
      ) : (
        <section aria-label="Up next" className="hero relative overflow-hidden rounded-2xl p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/80">Up next</p>
          <h2 className="mt-1 font-display text-5xl font-bold leading-none text-white">{next.name}</h2>
          <p className="mt-1 text-sm font-medium text-white/85">{next.focus}</p>
          <p className="tabular mt-3 text-xs font-semibold text-white/80">
            {next.exercises.length} exercises ·{' '}
            {next.exercises.reduce((n, e) => n + e.targets.length, 0)} sets · ~
            {estimateMinutes(next.exercises)} min
          </p>
          <div className="mt-4 flex gap-2">
            <Button variant="go" size="lg" icon="play" onClick={() => startProgram(next.id)} className="flex-1">
              Start {next.name}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => navigate('/workout')}
              aria-label="Choose a different workout"
            >
              Other
            </Button>
          </div>
        </section>
      )}

      <section aria-label="Key stats" className="grid grid-cols-2 gap-3">
        {loading ? (
          <>
            <Skeleton className="h-[108px]" />
            <Skeleton className="h-[108px]" />
            <Skeleton className="h-[108px]" />
            <Skeleton className="h-[108px]" />
          </>
        ) : (
          <>
            <StatTile
              label="Week volume"
              value={fmtVolume(weekVolume, unit).split(' ')[0]}
              unit={unit}
              icon="layers"
              accent="go"
              delta={`${weekSets} sets logged`}
            />
            <StatTile
              label="Sessions"
              value={String(thisWeek.length)}
              unit={`/ ${profile.weeklyGoal}`}
              icon="target"
              accent="brand"
              delta={
                thisWeek.length >= profile.weeklyGoal
                  ? 'Goal hit'
                  : `${profile.weeklyGoal - thisWeek.length} to go`
              }
              trend={thisWeek.length >= profile.weeklyGoal ? 'up' : 'flat'}
            />
            <StatTile
              label="Week streak"
              value={String(streak)}
              unit={streak === 1 ? 'week' : 'weeks'}
              icon="flame"
              accent="violet"
              delta={streak > 0 ? 'Keep it alive' : 'Train to start one'}
            />
            <StatTile
              label="Body weight"
              value={latest ? fmtWeight(latest.weightKg, unit, false) : '—'}
              unit={latest ? unit : undefined}
              icon="scale"
              accent="sky"
              delta={
                weightDelta === null
                  ? 'Log your weight'
                  : `${weightDelta > 0 ? '+' : ''}${fmtWeight(Math.abs(weightDelta), unit)} since last`
              }
              trend={weightDelta === null || weightDelta === 0 ? 'flat' : weightDelta > 0 ? 'up' : 'down'}
            />
          </>
        )}
      </section>

      <WeekStrip trainedDays={trainedDays} goal={profile.weeklyGoal} />

      {workouts.length > 0 ? <RecoveryCard workouts={workouts} /> : null}

      {!active ? (
        <section>
          <SectionHeader title="Set workouts" />
          <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1">
            {PROGRAMS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => startProgram(p.id)}
                className="card min-w-[10.5rem] shrink-0 snap-start p-3.5 text-left
                  transition-colors duration-200 hover:border-brand-500/60"
              >
                <span className="mb-2 grid size-9 place-items-center rounded-lg bg-brand-500/10 text-brand-400">
                  <Icon name="dumbbell" size={18} />
                </span>
                <span className="block font-display text-xl font-semibold">{p.name}</span>
                <span className="block text-xs text-[var(--color-fg-muted)]">{p.focus}</span>
                <span className="mt-2 block text-xs font-semibold text-brand-400">
                  {p.exercises.length} exercises
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <SectionHeader
          title="Body weight"
          action={
            <Link to="/body" className="text-sm font-semibold text-brand-400 hover:text-brand-300">
              Log weight
            </Link>
          }
        />
        <Card>
          {bodyLoading ? (
            <Skeleton className="h-[220px]" />
          ) : bwSeries.length >= 2 ? (
            <>
              <BodyWeightChart data={bwSeries} />
              <ChartTable
                caption="Body weight over the last 90 days"
                head={['Date', `Weight (${unit})`]}
                rows={bwSeries
                  .slice()
                  .reverse()
                  .map((p) => [p.label, fmtWeight(p.value, unit, false)])}
              />
            </>
          ) : (
            <div className="py-6 text-center">
              <p className="text-sm text-[var(--color-fg-muted)]">
                Log your weight on two or more days to see the trend.
              </p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => navigate('/body')}>
                Add an entry
              </Button>
            </div>
          )}
        </Card>
      </section>

      {prs.length > 0 ? (
        <section>
          <SectionHeader
            title="Top lifts"
            action={
              <Link to="/progress" className="text-sm font-semibold text-brand-400 hover:text-brand-300">
                All progress
              </Link>
            }
          />
          <ul className="flex flex-col gap-2">
            {prs.map((pr) => (
              <Card as="li" key={pr.exerciseId} className="flex items-center gap-3 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-amber-500/10 text-amber-400">
                  <Icon name="trophy" size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{pr.name}</span>
                  <span className="tabular block text-xs text-[var(--color-fg-muted)]">
                    {fmtWeight(pr.bestWeightKg, unit)} × {pr.bestReps} · est. 1RM{' '}
                    {fmtWeight(pr.estimated1rmKg, unit)}
                  </span>
                </span>
                <Badge color={MUSCLE_COLORS[pr.muscle as MuscleGroup]}>{pr.muscle}</Badge>
              </Card>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <SectionHeader
          title="Recent sessions"
          action={
            recent.length > 0 ? (
              <Link to="/history" className="text-sm font-semibold text-brand-400 hover:text-brand-300">
                See all
              </Link>
            ) : undefined
          }
        />
        {loading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-[72px]" />
            <Skeleton className="h-[72px]" />
          </div>
        ) : recent.length === 0 ? (
          <EmptyState
            icon="dumbbell"
            title="No workouts yet"
            message="Start your first session and it'll show up here with your volume, sets and PRs."
            action={
              <Button variant="go" icon="play" onClick={() => navigate('/workout')}>
                Start workout
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {recent.map((w) => (
              <li key={w.id}>
                <Link
                  to={`/history/${w.id}`}
                  className="card flex items-center gap-3 p-3.5 transition-colors duration-200 hover:border-brand-500/60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{w.name}</span>
                    <span className="tabular block text-xs text-[var(--color-fg-muted)]">
                      {relativeDay(w.startedAt)} · {fmtDuration(w.durationSec)} · {w.setCount} sets
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-right">
                    <span className="block font-display text-lg font-semibold text-brand-400">
                      {fmtVolume(w.totalVolumeKg, unit).split(' ')[0]}
                    </span>
                    <span className="block text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
                      {unit} volume
                    </span>
                  </span>
                  <Icon name="chevron-right" size={16} className="shrink-0 text-[var(--color-fg-muted)]" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
