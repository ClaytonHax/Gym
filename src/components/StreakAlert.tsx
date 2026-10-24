import { Link } from 'react-router-dom'
import { Icon } from './Icon'
import { Button } from './ui'
import { useMyPublicStats } from './SocialSync'

/** Dashboard banner: your streak ends today unless you train, or it ended yesterday. */
export function StreakAlert() {
  const { status, watch, ready } = useMyPublicStats()
  if (!ready || !status.status) return null
  const unit = watch.unit === 'week' ? 'week' : 'day'
  const label = `${status.streak}-${unit}`

  if (status.status === 'risk') {
    return (
      <section aria-label="Streak at risk" className="card-accent flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-500 text-ink-950">
            <Icon name="flame" size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Your {label} streak is on the line</p>
            <p className="text-sm text-[var(--color-fg-muted)]">
              {unit === 'day'
                ? 'Train today to keep it alive. A single session is enough.'
                : 'You need a session on every remaining day this week to hit your goal.'}
            </p>
          </div>
        </div>
        <Link to="/workout" className="block">
          <Button full icon="dumbbell">
            Start a workout
          </Button>
        </Link>
      </section>
    )
  }

  return (
    <section aria-label="Streak ended" className="card flex items-center gap-3 p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--color-surface-2)] text-[var(--color-fg-muted)]">
        <Icon name="flame" size={20} />
      </span>
      <p className="min-w-0 flex-1 text-sm text-[var(--color-fg-muted)]">
        <span className="font-semibold text-[var(--color-fg)]">Your {label} streak ended.</span> Start a new one today.
      </p>
      <Link to="/workout" className="shrink-0 text-sm font-semibold text-brand-400 hover:text-brand-300">
        Train
      </Link>
    </section>
  )
}
