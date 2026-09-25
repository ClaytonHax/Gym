import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import {
  Badge,
  Button,
  Card,
  ChartTable,
  EmptyState,
  PageTitle,
  SectionHeader,
  Segmented,
  Skeleton,
} from '../components/ui'
import {
  ExerciseProgressChart,
  MuscleBalanceChart,
  VolumeChart,
} from '../components/LazyCharts'
import { useSettings } from '../contexts/SettingsContext'
import { useWorkouts } from '../hooks/useWorkouts'
import { MUSCLE_COLORS } from '../data/exercises'
import { fmtDate, fmtDuration } from '../lib/date'
import { fmtVolume, fmtWeight } from '../lib/units'
import {
  exerciseProgress,
  muscleBalance,
  personalRecords,
  weeklyVolume,
} from '../lib/stats'
import type { MuscleGroup } from '../types'

type Range = '8' | '12' | '26'

export function Progress() {
  const { workouts, loading } = useWorkouts()
  const { profile } = useSettings()
  const navigate = useNavigate()
  const unit = profile.unit

  const [range, setRange] = useState<Range>('12')
  const weeks = Number(range)

  const prs = useMemo(() => personalRecords(workouts), [workouts])
  const [focusId, setFocusId] = useState<string | null>(null)
  const focusExerciseId = focusId ?? prs[0]?.exerciseId ?? null

  const volume = useMemo(() => weeklyVolume(workouts, weeks), [workouts, weeks])
  const balance = useMemo(() => muscleBalance(workouts, weeks * 7), [workouts, weeks])
  const focusSeries = useMemo(
    () => (focusExerciseId ? exerciseProgress(workouts, focusExerciseId) : []),
    [workouts, focusExerciseId]
  )
  const focusPr = prs.find((p) => p.exerciseId === focusExerciseId)

  const totalVolume = workouts.reduce((s, w) => s + w.totalVolumeKg, 0)
  const totalTime = workouts.reduce((s, w) => s + w.durationSec, 0)
  const avgSession = workouts.length > 0 ? totalTime / workouts.length : 0

  if (loading) {
    return (
      <div className="animate-rise">
        <PageTitle title="Progress" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-[240px]" />
          <Skeleton className="h-[240px]" />
        </div>
      </div>
    )
  }

  if (workouts.length === 0) {
    return (
      <div className="animate-rise">
        <PageTitle title="Progress" />
        <EmptyState
          icon="trending"
          title="Nothing to chart yet"
          message="Log a couple of sessions and your volume, PRs and muscle balance will appear here."
          action={
            <Button variant="go" icon="play" onClick={() => navigate('/workout')}>
              Start a workout
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="animate-rise flex flex-col gap-6">
      <PageTitle
        title="Progress"
        subtitle={`${workouts.length} sessions · ${fmtVolume(totalVolume, unit)} total · ${fmtDuration(avgSession)} avg session`}
      />

      <Segmented
        label="Time range"
        value={range}
        onChange={setRange}
        options={[
          { value: '8', label: '8 weeks' },
          { value: '12', label: '12 weeks' },
          { value: '26', label: '6 months' },
        ]}
      />

      <section>
        <SectionHeader title="Weekly volume" />
        <Card>
          <VolumeChart data={volume} />
          <ChartTable
            caption={`Training volume per week over the last ${weeks} weeks`}
            head={['Week of', `Volume (${unit})`]}
            rows={volume
              .slice()
              .reverse()
              .map((p) => [p.label, fmtVolume(p.value, unit)])}
          />
        </Card>
      </section>

      {focusExerciseId ? (
        <section>
          <SectionHeader title="Strength trend" />
          <Card>
            <div className="mb-3 flex flex-col gap-1.5">
              <label
                htmlFor="focus-exercise"
                className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-fg-muted)]"
              >
                Exercise
              </label>
              <select
                id="focus-exercise"
                value={focusExerciseId}
                onChange={(e) => setFocusId(e.target.value)}
                className="min-h-12 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3.5 font-medium text-[var(--color-fg)] outline-none focus:border-brand-500"
              >
                {prs.map((pr) => (
                  <option key={pr.exerciseId} value={pr.exerciseId}>
                    {pr.name}
                  </option>
                ))}
              </select>
            </div>

            {focusPr ? (
              <p className="tabular mb-2 text-sm text-[var(--color-fg-muted)]">
                Best: {fmtWeight(focusPr.bestWeightKg, unit)} × {focusPr.bestReps} on{' '}
                {fmtDate(focusPr.date)} · est. 1RM{' '}
                <span className="font-semibold text-brand-400">
                  {fmtWeight(focusPr.estimated1rmKg, unit)}
                </span>
              </p>
            ) : null}

            {focusSeries.length >= 2 ? (
              <>
                <ExerciseProgressChart data={focusSeries} />
                <ChartTable
                  caption="Estimated one-rep max per session"
                  head={['Date', `Est. 1RM (${unit})`]}
                  rows={focusSeries
                    .slice()
                    .reverse()
                    .map((p) => [p.label, fmtWeight(p.value, unit, false)])}
                />
              </>
            ) : (
              <p className="py-6 text-center text-sm text-[var(--color-fg-muted)]">
                Log this exercise in two or more sessions to see a trend line.
              </p>
            )}
          </Card>
        </section>
      ) : null}

      {balance.length >= 3 ? (
        <section>
          <SectionHeader title="Muscle balance" />
          <Card>
            <p className="mb-1 text-sm text-[var(--color-fg-muted)]">
              Completed working sets per muscle group over the last {weeks} weeks.
            </p>
            <MuscleBalanceChart data={balance} />
            <ChartTable
              caption="Working sets per muscle group"
              head={['Muscle', 'Sets']}
              rows={balance.map((b) => [b.muscle, String(b.sets)])}
            />
          </Card>
        </section>
      ) : null}

      <section>
        <SectionHeader title="Personal records" />
        {prs.length === 0 ? (
          <Card>
            <p className="text-sm text-[var(--color-fg-muted)]">
              PRs appear once you log weighted sets.
            </p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {prs.map((pr, i) => (
              <Card as="li" key={pr.exerciseId} className="flex items-center gap-3 py-3">
                <span
                  className={`tabular grid size-8 shrink-0 place-items-center rounded-lg text-xs font-bold ${
                    i < 3 ? 'bg-amber-500/15 text-amber-400' : 'bg-[var(--color-surface-2)] text-[var(--color-fg-muted)]'
                  }`}
                >
                  {i < 3 ? <Icon name="trophy" size={14} /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{pr.name}</span>
                  <span className="tabular block text-xs text-[var(--color-fg-muted)]">
                    {fmtWeight(pr.bestWeightKg, unit)} × {pr.bestReps} · {fmtDate(pr.date)}
                  </span>
                </span>
                <span className="tabular shrink-0 text-right">
                  <span className="block font-display text-lg font-semibold text-brand-400">
                    {fmtWeight(pr.estimated1rmKg, unit, false)}
                  </span>
                  <span className="block text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
                    est. 1RM
                  </span>
                </span>
                <Badge color={MUSCLE_COLORS[pr.muscle as MuscleGroup]}>{pr.muscle}</Badge>
              </Card>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
