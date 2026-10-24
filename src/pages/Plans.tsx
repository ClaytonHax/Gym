import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Badge, Button, ConfirmSheet, EmptyState, IconButton, PageTitle, Skeleton } from '../components/ui'
import { useToast } from '../contexts/ToastContext'
import { PLAN_TEMPLATES } from '../data/programs'
import { usePlans } from '../hooks/usePlans'
import { parseDayKey } from '../lib/date'
import { planSummary } from '../lib/plans'
import type { Plan, ScheduleSlot } from '../types'

function weekdayInitial(slot: ScheduleSlot): string {
  return parseDayKey(slot.date).toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 1)
}

function summaryText(plan: Pick<Plan, 'days'>): string {
  const { length, workouts, rests } = planSummary(plan)
  return `${length}-day cycle · ${workouts} workouts · ${rests} rest`
}

/** Seven-day look-ahead: moon for rest, filled for workouts, ring on today. */
function WeekStrip({ slots }: { slots: ScheduleSlot[] }) {
  return (
    <ul className="grid grid-cols-7 gap-1.5" aria-label="Next seven days">
      {slots.map((slot) => {
        const rest = slot.isRest
        const label = `${parseDayKey(slot.date).toLocaleDateString(undefined, { weekday: 'long' })}: ${
          slot.day ? (rest ? 'rest' : slot.day.name) : 'not started'
        }`
        return (
          <li
            key={slot.date}
            aria-label={label}
            className={`flex min-h-16 min-w-0 flex-col items-center justify-between rounded-xl border px-0.5 py-1.5 ${
              slot.isToday
                ? 'border-brand-500 bg-brand-500/10'
                : 'border-[var(--color-line)] bg-[var(--color-surface-2)]'
            }`}
          >
            <span className="text-[10px] font-bold uppercase text-[var(--color-fg-muted)]">
              {weekdayInitial(slot)}
            </span>
            {rest ? (
              <Icon name="moon" size={18} className="text-rest" />
            ) : (
              <Icon name="dumbbell" size={18} className="text-brand-400" />
            )}
            <span className="w-full truncate text-center text-[10px] font-semibold">
              {slot.day ? (rest ? 'Rest' : slot.day.name.replace(/\s+/g, '')) : '—'}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

type Pending = { kind: 'delete'; plan: Plan } | { kind: 'delay' } | { kind: 'skip' } | { kind: 'deactivate' }

export function Plans() {
  const navigate = useNavigate()
  const toast = useToast()
  const {
    plans,
    loading,
    activePlan,
    today,
    upcoming,
    activatePlan,
    deactivatePlan,
    duplicatePlan,
    deletePlan,
    delayToday,
    skipToday,
  } = usePlans()
  const [pending, setPending] = useState<Pending | null>(null)

  async function run(action: () => Promise<unknown>, done: string) {
    try {
      await action()
      toast(done)
    } catch {
      toast('Something went wrong. Try again.', 'error')
    } finally {
      setPending(null)
    }
  }

  const confirm = (() => {
    switch (pending?.kind) {
      case 'delete':
        return {
          title: `Delete “${pending.plan.name}”?`,
          message: 'This plan will be removed. Workouts you already logged are kept.',
          label: 'Delete',
          go: () => run(() => deletePlan(pending.plan.id), 'Plan deleted.'),
        }
      case 'delay':
        return {
          title: 'Delay a day?',
          message:
            'Today becomes a rest day and your whole schedule shifts back one day. Today’s workout moves to tomorrow.',
          label: 'Delay',
          go: () => run(delayToday, 'Schedule shifted by a day.'),
        }
      case 'skip':
        return {
          title: 'Skip today?',
          message:
            'Today becomes a rest day and today’s workout is dropped. The rest of your schedule stays exactly as it was.',
          label: 'Skip',
          go: () => run(skipToday, 'Today skipped.'),
        }
      case 'deactivate':
        return {
          title: 'Deactivate this plan?',
          message: 'Your plan stays saved, but nothing will be scheduled until you activate one again.',
          label: 'Deactivate',
          go: () => run(deactivatePlan, 'Plan deactivated.'),
        }
      default:
        return null
    }
  })()

  const others = plans.filter((p) => p.id !== activePlan?.id)

  return (
    <div className="animate-rise flex flex-col gap-6">
      <PageTitle title="Plans" subtitle="Pick a template, make it yours, and let the schedule run itself." />

      <section aria-label="Active plan">
        {loading ? (
          <Skeleton className="h-56" />
        ) : activePlan && today ? (
          <div className="card-accent flex flex-col gap-4 p-4">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-400">
                  Active plan
                </p>
                <h2 className="num-display mt-1 truncate text-3xl">{activePlan.name}</h2>
                <p className="tabular text-sm text-[var(--color-fg-muted)]">
                  {today.dayNumber > 0
                    ? `Day ${today.dayNumber} of ${today.cycleLength} · Cycle ${today.cycle}`
                    : `Starts ${parseDayKey(today.date).toLocaleDateString()}`}
                </p>
              </div>
              <IconButton
                icon="pencil"
                label={`Edit ${activePlan.name}`}
                onClick={() => navigate(`/plans/${activePlan.id}`)}
              />
            </div>

            <WeekStrip slots={upcoming(7)} />

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon="arrow-right"
                disabled={today.isRest}
                onClick={() => setPending({ kind: 'delay' })}
              >
                Delay a day
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon="skip-forward"
                disabled={today.isRest}
                onClick={() => setPending({ kind: 'skip' })}
              >
                Skip today
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon="copy"
                onClick={() =>
                  void duplicatePlan(activePlan.id).then(
                    () => toast('Plan duplicated.'),
                    () => toast('Could not duplicate the plan.', 'error')
                  )
                }
              >
                Duplicate
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPending({ kind: 'deactivate' })}>
                Deactivate
              </Button>
            </div>
          </div>
        ) : (
          <EmptyState
            icon="layers"
            title="No active plan"
            message="Choose a template below or build your own, then add it to your plan to get a daily schedule."
          />
        )}
      </section>

      <section aria-label="Templates">
        <h2 className="mb-3 text-lg font-semibold">Start a plan</h2>
        <ul className="flex flex-col gap-3">
          {PLAN_TEMPLATES.map((t) => (
            <li key={t.id}>
              <Link
                to={`/plans/new?template=${t.id}`}
                className="card group flex min-h-14 flex-col gap-2 p-4 transition-colors duration-200 hover:border-brand-500/60"
              >
                <div className="flex items-center gap-2">
                  <h3 className="num-display flex-1 text-2xl">{t.name}</h3>
                  <Icon
                    name="chevron-right"
                    size={20}
                    className="text-[var(--color-fg-muted)] transition-transform duration-200 group-hover:translate-x-0.5"
                  />
                </div>
                <p className="text-sm text-[var(--color-fg-muted)]">{t.description}</p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge>{t.tagline}</Badge>
                </div>
                <ul className="flex flex-wrap gap-1.5" aria-label="Cycle order">
                  {t.days.map((d) => (
                    <li
                      key={d.id}
                      className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
                        d.kind === 'rest'
                          ? 'border border-rest text-rest'
                          : 'bg-brand-500/15 text-brand-400'
                      }`}
                    >
                      {d.name}
                    </li>
                  ))}
                </ul>
              </Link>
            </li>
          ))}
          <li>
            <Link
              to="/plans/new?custom=1"
              className="card flex min-h-14 items-center gap-3 p-4 transition-colors duration-200 hover:border-brand-500/60"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-brand-400">
                <Icon name="plus" size={22} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-xl font-semibold">Custom plan</span>
                <span className="block text-sm text-[var(--color-fg-muted)]">
                  Start blank and design every day yourself.
                </span>
              </span>
              <Icon name="chevron-right" size={20} className="text-[var(--color-fg-muted)]" />
            </Link>
          </li>
          <li
            className="flex min-h-14 items-center gap-3 rounded-2xl border border-dashed border-[var(--color-line)] p-4 text-sm text-[var(--color-fg-muted)]"
            aria-disabled="true"
          >
            <Icon name="star" size={18} className="shrink-0" />
            More templates coming soon
          </li>
        </ul>
      </section>

      <section aria-label="My plans">
        <h2 className="mb-3 text-lg font-semibold">My plans</h2>
        {loading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : plans.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="No saved plans yet"
            message="Plans you add show up here so you can switch, edit or duplicate them."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {[...(activePlan ? [activePlan] : []), ...others].map((p) => {
              const isActive = p.id === activePlan?.id
              return (
                <li key={p.id} className={`card p-4 ${isActive ? 'border-brand-500/60' : ''}`}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-base font-semibold">{p.name}</h3>
                        {isActive ? <Badge color="#22c55e">Active</Badge> : null}
                      </div>
                      <p className="tabular text-xs text-[var(--color-fg-muted)]">{summaryText(p)}</p>
                    </div>
                    <div className="-mr-2 -mt-2 flex">
                      <IconButton
                        icon="pencil"
                        label={`Edit ${p.name}`}
                        onClick={() => navigate(`/plans/${p.id}`)}
                      />
                      <IconButton
                        icon="copy"
                        label={`Duplicate ${p.name}`}
                        onClick={() =>
                          void duplicatePlan(p.id).then(
                            () => toast('Plan duplicated.'),
                            () => toast('Could not duplicate the plan.', 'error')
                          )
                        }
                      />
                      <IconButton
                        icon="trash"
                        label={`Delete ${p.name}`}
                        onClick={() => setPending({ kind: 'delete', plan: p })}
                        className="hover:bg-rose-500/15 hover:text-rose-400"
                      />
                    </div>
                  </div>
                  {!isActive ? (
                    <Button
                      variant="go"
                      size="sm"
                      className="mt-3"
                      onClick={() => void run(() => activatePlan(p.id), `${p.name} is now your plan.`)}
                    >
                      Make active
                    </Button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <ConfirmSheet
        open={confirm !== null}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        confirmLabel={confirm?.label}
        tone={confirm?.label === 'Delay' || confirm?.label === 'Skip' ? 'primary' : 'danger'}
        onCancel={() => setPending(null)}
        onConfirm={() => void confirm?.go()}
      />
    </div>
  )
}
