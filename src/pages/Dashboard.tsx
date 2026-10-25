import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import {
  Badge,
  Button,
  Card,
  ChartTable,
  ConfirmSheet,
  EmptyState,
  ProgressRing,
  SectionHeader,
  Skeleton,
  StatTile,
  StreakBadge,
} from '../components/ui'
import { ActivityHeatmap } from '../components/ActivityHeatmap'
import { FriendsPulse } from '../components/FriendsPulse'
import { StreakAlert } from '../components/StreakAlert'
import { NotificationBell } from '../components/social'
import { BodyWeightChart } from '../components/LazyCharts'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useWorkouts } from '../hooks/useWorkouts'
import { useBodyLog } from '../hooks/useBodyLog'
import { useActiveWorkout } from '../hooks/useActiveWorkout'
import { MUSCLE_COLORS } from '../data/exercises'
import { usePlans } from '../hooks/usePlans'
import { StarterPlans } from '../components/plans'
import { HomeInstallBanner } from '../components/InstallPrompt'
import { daySummary, startPlanDay } from '../lib/plans'
import { nextWorkoutLabel, nextWorkoutSlot } from '../lib/planUiLogic'
import { computeStreaks, workoutsByDay } from '../lib/streaks'
import { fmtVolume, fmtWeight } from '../lib/units'
import { addDays, dayKey, fmtDuration, parseDayKey, relativeDay, startOfWeek } from '../lib/date'
import { muscleRecovery } from '../lib/recovery'
import { bodyWeightSeries, personalRecords, workoutsThisWeek } from '../lib/stats'
import type { MuscleGroup, ScheduleSlot, Workout } from '../types'

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

/** Upcoming plan days, today first: done / today / rest / upcoming. */
function PlanWeekStrip({ slots, byDay }: { slots: ScheduleSlot[]; byDay: Map<string, Workout[]> }) {
  return (
    <Card>
      <h2 className="mb-3 text-base font-semibold">Next 7 days</h2>
      <ul className="grid grid-cols-7 gap-1">
        {slots.map((s) => {
          const done = byDay.has(s.date)
          const label = s.isRest ? 'Rest' : (s.day?.name ?? '')
          const weekday = parseDayKey(s.date).toLocaleDateString(undefined, { weekday: 'narrow' })
          return (
            <li key={s.date} className="flex min-w-0 flex-col items-center gap-1.5">
              <span
                className={`text-[10px] font-bold uppercase tracking-wider ${
                  s.isToday ? 'text-brand-400' : 'text-[var(--color-fg-muted)]'
                }`}
              >
                {weekday}
              </span>
              <span
                className={`grid size-9 place-items-center rounded-full border text-xs font-bold
                  ${
                    done
                      ? 'border-go-500 bg-go-500 text-ink-950'
                      : s.isRest
                        ? 'border-rest text-rest'
                        : s.isToday
                          ? 'border-brand-500 bg-brand-500/15 text-brand-400'
                          : 'border-[var(--color-line)] bg-[var(--color-surface-2)] text-[var(--color-fg-muted)]'
                  }
                  ${s.isToday && !done ? 'ring-2 ring-brand-500/40' : ''}`}
              >
                {done ? (
                  <Icon name="check" size={15} title="Trained" />
                ) : s.isRest ? (
                  <Icon name="moon" size={15} title="Rest day" />
                ) : (
                  parseDayKey(s.date).getDate()
                )}
              </span>
              <span className="w-full truncate text-center text-[10px] font-semibold text-[var(--color-fg-muted)]">
                {label}
              </span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

/** Streak flame, weekly-goal ring and lifetime numbers in one block. */
function StreakCard({ stats }: { stats: ReturnType<typeof computeStreaks> }) {
  const unit = stats.mode === 'plan' ? 'day' : 'week'
  return (
    <Card>
      <div className="flex items-center gap-4">
        <ProgressRing
          value={stats.workoutsThisWeek}
          max={stats.weeklyGoal}
          size={92}
          stroke={9}
          color={stats.workoutsThisWeek >= stats.weeklyGoal ? 'go' : 'brand'}
          label={`${stats.workoutsThisWeek} of ${stats.weeklyGoal} workouts this week`}
        >
          <span className="num-display text-3xl leading-none">{stats.workoutsThisWeek}</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">
            of {stats.weeklyGoal}
          </span>
        </ProgressRing>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <StreakBadge count={stats.current} unit={unit} active={stats.current > 0} size="lg" />
          <dl className="grid grid-cols-2 gap-2">
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">
                Longest
              </dt>
              <dd className="tabular font-display text-xl font-bold">
                {stats.longest} {unit}
                {stats.longest === 1 ? '' : 's'}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">
                Total
              </dt>
              <dd className="tabular font-display text-xl font-bold">{stats.totalWorkouts}</dd>
            </div>
          </dl>
        </div>
      </div>
      <p className="mt-3 text-xs text-[var(--color-fg-muted)]">
        {stats.mode === 'plan'
          ? 'Every trained day and every planned rest day keeps your streak alive.'
          : `Hit ${stats.weeklyGoal} sessions a week to build a weekly streak.`}
      </p>
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
  const { activePlan, activeState, today, upcoming, isRestDay, loading: plansLoading, delayToday, skipToday } =
    usePlans()
  const [confirm, setConfirm] = useState<'delay' | 'skip' | null>(null)

  const unit = profile.unit
  const firstName = (profile.displayName || user?.displayName || '').split(' ')[0]

  const thisWeek = useMemo(() => workoutsThisWeek(workouts), [workouts])
  const trainedDays = useMemo(
    () => new Set(thisWeek.map((w) => dayKey(new Date(w.startedAt)))),
    [thisWeek]
  )
  const streakStats = useMemo(
    () =>
      computeStreaks(workouts, {
        isRestDay,
        planStartDate: activeState?.startDate,
        weeklyGoal: profile.weeklyGoal,
      }),
    [workouts, isRestDay, activeState?.startDate, profile.weeklyGoal]
  )
  const byDay = useMemo(() => workoutsByDay(workouts), [workouts])
  const week = useMemo(() => upcoming(7), [upcoming])
  const prs = useMemo(() => personalRecords(workouts).slice(0, 3), [workouts])
  const bwSeries = useMemo(() => bodyWeightSeries(entries, 90), [entries])

  const weekVolume = thisWeek.reduce((s, w) => s + w.totalVolumeKg, 0)
  const weekSets = thisWeek.reduce((s, w) => s + w.setCount, 0)
  const weekMinutes = Math.round(thisWeek.reduce((s, w) => s + w.durationSec, 0) / 60)
  const weekKcal = thisWeek.reduce((s, w) => s + (w.caloriesKcal ?? 0), 0)
  // Cardio-only people never see "0 kg lifted" or a muscle recovery list.
  const lifts = workouts.some((w) => w.totalVolumeKg > 0)
  const recent = workouts.slice(0, 3)

  const weightDelta = latest && previous ? latest.weightKg - previous.weightKg : null

  const todayDone = byDay.has(dayKey())
  // Once today's workout is done, "next" starts from tomorrow.
  const nextWorkout = useMemo(() => nextWorkoutSlot(upcoming(9), todayDone), [upcoming, todayDone])

  function startToday() {
    if (!activePlan || !today || today.isRest || !today.day) return
    save(startPlanDay(activePlan, today))
    navigate('/workout')
  }

  async function confirmAdjust() {
    const kind = confirm
    setConfirm(null)
    if (kind === 'delay') await delayToday()
    else if (kind === 'skip') await skipToday()
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
        <div className="flex shrink-0 gap-2">
        <NotificationBell />
        <Link
          to="/body"
          aria-label="Body weight"
          className="flex h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border
            border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 text-[var(--color-fg-muted)] transition-colors
            duration-200 hover:border-brand-500/60 hover:text-brand-400"
        >
          <Icon name="scale" size={20} />
          <span className="text-xs font-medium leading-none">Weight</span>
        </Link>
        <Link
          to="/settings"
          aria-label="Settings"
          className="flex h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border
            border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 text-[var(--color-fg-muted)] transition-colors
            duration-200 hover:border-brand-500/60 hover:text-brand-400"
        >
          <Icon name="settings" size={20} />
          <span className="text-xs font-medium leading-none">Settings</span>
        </Link>
        </div>
      </header>

      <HomeInstallBanner />

      {/* Today — the one thing you open this app to do. */}
      <section aria-label="Today" className="card-accent rounded-2xl p-5">
        {active ? (
          <>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-400">In progress</p>
            <h2 className="mt-1 font-display text-4xl font-bold leading-none">
              {active.planDayName ?? active.name}
            </h2>
            <Button size="lg" full icon="dumbbell" onClick={() => navigate('/workout')} className="mt-4 text-lg">
              Resume workout
            </Button>
          </>
        ) : plansLoading ? (
          <Skeleton className="h-[140px]" />
        ) : !activePlan || !today ? (
          <>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-400">No active plan</p>
            <h2 className="mt-1 font-display text-4xl font-bold leading-none">Choose a plan</h2>
            <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
              Pick a plan and the app tells you what to do each day, rest days included. Weights or cardio.
            </p>
            <div className="mt-4">
              <StarterPlans />
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="lg" icon="layers" onClick={() => navigate('/plans/library')} className="flex-1 whitespace-nowrap">
                Browse plans
              </Button>
              <Button variant="secondary" size="lg" onClick={() => navigate('/workout')} className="whitespace-nowrap">
                Quick start
              </Button>
            </div>
          </>
        ) : todayDone ? (
          <>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-go-400">Today</p>
            <h2 className="mt-1 flex items-center gap-2 font-display text-4xl font-bold leading-none">
              <Icon name="check-circle" size={30} className="text-go-400" />
              Done for today
            </h2>
            <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
              {nextWorkout
                ? `Next workout - ${nextWorkoutLabel(nextWorkout)}. Come back then.`
                : 'Nice work. Recover well.'}
            </p>
          </>
        ) : today.isRest || !today.day ? (
          <>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-rest">
              {today.adjusted === 'delay' ? 'Delayed' : today.adjusted === 'skip' ? 'Skipped' : 'Today'}
              {today.dayNumber > 0 ? ` · Day ${today.dayNumber} of ${today.cycleLength}` : ''}
            </p>
            <h2 className="mt-1 flex items-center gap-2 font-display text-4xl font-bold leading-none">
              <Icon name="moon" size={30} className="text-rest" />
              {today.dayIndex === null ? 'Plan starts soon' : 'Rest day'}
            </h2>
            <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
              {nextWorkout?.day
                ? `Next workout - ${nextWorkoutLabel(nextWorkout)}.`
                : 'Recovery is part of the plan.'}
            </p>
            <Button variant="secondary" size="lg" full onClick={() => navigate('/workout')} className="mt-4">
              Train anyway
            </Button>
          </>
        ) : (
          <>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-400">
              Day {today.dayNumber} of {today.cycleLength} in your plan
            </p>
            <h2 className="mt-1 font-display text-5xl font-bold leading-none">{today.day.name}</h2>
            {today.day.focus ? (
              <p className="mt-1 text-sm font-medium text-[var(--color-fg-muted)]">{today.day.focus}</p>
            ) : null}
            <p className="tabular mt-3 text-xs font-semibold text-[var(--color-fg-muted)]">
              {daySummary(today.day.exercises)}
            </p>
            <Button variant="go" size="lg" full icon="play" onClick={startToday} className="mt-4 text-lg">
              Start {today.day.name}
            </Button>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button variant="ghost" size="sm" icon="arrow-right" onClick={() => setConfirm('delay')}>
                Move to tomorrow
              </Button>
              <Button variant="ghost" size="sm" icon="skip-forward" onClick={() => setConfirm('skip')}>
                Skip today
              </Button>
            </div>
            <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
              Move to tomorrow: do this workout tomorrow instead. Skip today: drop it and carry on.
            </p>
          </>
        )}
      </section>

      <ConfirmSheet
        open={confirm !== null}
        title={confirm === 'delay' ? 'Move to tomorrow?' : 'Skip today?'}
        message={
          confirm === 'delay'
            ? "Today becomes a rest day and everything after it moves back one day, so tomorrow you'll do today's workout."
            : "Today becomes a rest day and today's workout is dropped. The rest of the schedule stays where it is."
        }
        confirmLabel={confirm === 'delay' ? 'Move to tomorrow' : 'Skip today'}
        tone="primary"
        onConfirm={confirmAdjust}
        onCancel={() => setConfirm(null)}
      />

      {!loading ? <StreakAlert /> : null}

      {loading ? <Skeleton className="h-[140px]" /> : <StreakCard stats={streakStats} />}

      {activePlan && week.length > 0 ? (
        <PlanWeekStrip slots={week} byDay={byDay} />
      ) : (
        <WeekStrip trainedDays={trainedDays} goal={profile.weeklyGoal} />
      )}

      <FriendsPulse />

      <section aria-label="Activity">
        <SectionHeader title="Activity" />
        <Card>
          <ActivityHeatmap workouts={workouts} isRestDay={isRestDay} variant="compact" />
        </Card>
      </section>

      <section aria-label="Key stats" className="grid grid-cols-2 gap-3">
        {loading ? (
          <>
            <Skeleton className="h-[108px]" />
            <Skeleton className="h-[108px]" />
          </>
        ) : (
          <>
            {lifts && weekVolume > 0 ? (
              <StatTile
                label="Weight lifted this week"
                value={fmtVolume(weekVolume, unit).split(' ')[0]}
                unit={unit}
                icon="layers"
                accent="go"
                delta={`${weekSets} ${weekSets === 1 ? 'set' : 'sets'} logged`}
              />
            ) : (
              <StatTile
                label="Active minutes this week"
                value={String(weekMinutes)}
                unit="min"
                icon="layers"
                accent="go"
                delta={weekKcal > 0 ? `~${weekKcal} kcal (estimate)` : `${thisWeek.length} ${thisWeek.length === 1 ? 'workout' : 'workouts'}`}
              />
            )}
            <StatTile
              label="Body weight"
              value={latest ? fmtWeight(latest.weightKg, unit, false) : '—'}
              unit={latest ? unit : undefined}
              icon="scale"
              accent="sky"
              delta={
                weightDelta === null
                  ? 'Log your weight'
                  : `${weightDelta > 0 ? '+' : weightDelta < 0 ? '−' : ''}${fmtWeight(Math.abs(weightDelta), unit)} since last`
              }
              trend={weightDelta === null || weightDelta === 0 ? 'flat' : weightDelta > 0 ? 'up' : 'down'}
            />
          </>
        )}
      </section>

      {lifts ? <RecoveryCard workouts={workouts} /> : null}

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
                    {fmtWeight(pr.bestWeightKg, unit)} × {pr.bestReps} · best single lift (est.){' '}
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
            message="Start your first session and it'll show up here with your sets and personal bests."
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
                      {relativeDay(w.startedAt)} · {fmtDuration(w.durationSec)} · {w.setCount} {w.setCount === 1 ? 'set' : 'sets'}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-right">
                    <span className="block font-display text-lg font-semibold text-brand-400">
                      {w.totalVolumeKg > 0 ? fmtVolume(w.totalVolumeKg, unit).split(' ')[0] : Math.round(w.durationSec / 60)}
                    </span>
                    <span className="block text-xs uppercase tracking-wider text-[var(--color-fg-muted)]">
                      {w.totalVolumeKg > 0 ? `${unit} lifted` : 'minutes'}
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
