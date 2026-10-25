import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { PlanUpdateCard, PublicPlanList } from '../components/plans'
import { PlanSourcePill, PlanStats, SwitchPlanSheet } from '../components/planUi'
import { Badge, Button, ConfirmSheet, IconButton, PageTitle, Skeleton } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { usePlanSync } from '../contexts/PlanSyncContext'
import { PPL_PUBLIC_ID } from '../data/programs'
import { usePlans } from '../hooks/usePlans'
import { useAuthorPlans, usePublicPlanActions } from '../hooks/usePublicPlans'
import { dayKey, parseDayKey } from '../lib/date'
import { samePlanContent } from '../lib/planSync'
import { rotationText } from '../lib/plans'
import { nextWorkoutLabel, nextWorkoutSlot } from '../lib/planUiLogic'
import { workoutsByDay } from '../lib/streaks'
import { useWorkouts } from '../hooks/useWorkouts'
import type { Plan, PublicPlan, ScheduleSlot } from '../types'

function weekdayInitial(slot: ScheduleSlot): string {
  return parseDayKey(slot.date).toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 1)
}

const summaryText = rotationText

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
            <span className="text-xs font-bold uppercase text-[var(--color-fg-muted)]">
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

type Pending = { kind: 'delay' } | { kind: 'skip' } | { kind: 'deactivate' } | { kind: 'remove'; plan: PublicPlan }

/** State A: nothing saved yet, so the page is a two-way choice. */
function Onboarding() {
  return (
    <section aria-label="Get started" className="flex flex-col gap-4">
      <div className="hero p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-400">Get started</p>
        <h2 className="num-display mt-1 text-3xl">Choose your training plan</h2>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          A plan tells you what to do each day, rest days included. Weights or cardio, pick one or build your own.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          to="/plans/library"
          className="group flex min-h-40 cursor-pointer flex-col gap-2 rounded-2xl bg-brand-500 p-5 text-white shadow-lg transition-colors duration-200 hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <span className="grid size-11 place-items-center rounded-xl bg-white/20">
            <Icon name="layers" size={24} />
          </span>
          <span className="font-display text-2xl font-bold uppercase leading-tight">Choose a ready-made plan</span>
          <span className="text-sm text-white/90">Ready-made plans for weights or cardio</span>
          <span className="mt-auto flex items-center gap-1 text-sm font-bold">
            Browse plans
            <Icon name="chevron-right" size={18} className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </span>
        </Link>
        <Link
          to="/plans/new"
          className="card group flex min-h-40 cursor-pointer flex-col gap-2 p-5 transition-colors duration-200 hover:border-brand-500/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          <span className="grid size-11 place-items-center rounded-xl bg-brand-500/15 text-brand-400">
            <Icon name="pencil" size={22} />
          </span>
          <span className="font-display text-2xl font-bold uppercase leading-tight">Design my own</span>
          <span className="text-sm text-[var(--color-fg-muted)]">Pick your own days and exercises</span>
          <span className="mt-auto flex items-center gap-1 text-sm font-bold text-brand-400">
            Build a plan
            <Icon name="chevron-right" size={18} className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </span>
        </Link>
      </div>
    </section>
  )
}

export function Plans() {
  const navigate = useNavigate()
  const toast = useToast()
  const { plans, loading, activePlan, today, upcoming, deactivatePlan, delayToday, skipToday } = usePlans()
  const { user } = useAuth()
  const { removePublic } = usePublicPlanActions()
  const published = useAuthorPlans(user?.uid)
  const { actionFor } = usePlanSync()
  const { workouts } = useWorkouts()
  const todayDone = workoutsByDay(workouts).has(dayKey())
  const nextSlot = nextWorkoutSlot(upcoming(9), todayDone)
  const [pending, setPending] = useState<Pending | null>(null)
  const [switching, setSwitching] = useState<Plan | null>(null)

  async function run(action: () => Promise<unknown>, done: string) {
    try {
      await action()
      toast(done)
    } catch (err) {
      // Our own validation errors are readable; Firebase errors carry a `code` and aren't.
      toast(err instanceof Error && !('code' in err) ? err.message : 'Something went wrong. Try again.', 'error')
    } finally {
      setPending(null)
    }
  }

  const confirm = (() => {
    switch (pending?.kind) {
      case 'delay':
        return {
          title: 'Move to tomorrow?',
          message:
            'Today becomes a rest day and everything after it moves back one day. Today’s workout happens tomorrow.',
          label: 'Move to tomorrow',
          tone: 'primary' as const,
          go: () => run(delayToday, 'Moved to tomorrow.'),
        }
      case 'skip':
        return {
          title: 'Skip today?',
          message:
            'Today becomes a rest day and today’s workout is dropped. The rest of your schedule stays exactly as it was.',
          label: 'Skip today',
          tone: 'primary' as const,
          go: () => run(skipToday, 'Today skipped.'),
        }
      case 'deactivate':
        return {
          title: 'Deactivate this plan?',
          message: 'Your plan stays saved, but nothing will be scheduled until you activate one again.',
          label: 'Deactivate',
          tone: 'danger' as const,
          go: () => run(deactivatePlan, 'Plan deactivated.'),
        }
      case 'remove':
        return {
          title: `Remove “${pending.plan.name}”?`,
          message: 'It disappears from the library. Copies people already added keep working.',
          label: 'Remove',
          tone: 'danger' as const,
          go: () => run(() => removePublic(pending.plan.id), 'Removed from the library.'),
        }
      default:
        return null
    }
  })()

  const ordered = [...(activePlan ? [activePlan] : []), ...plans.filter((p) => p.id !== activePlan?.id)]
  const publicOf = new Map(published.data.map((p) => [p.id, p]))
  // Library plans I wrote that have no private copy (e.g. the built-in PPL).
  const linked = new Set(plans.map((p) => p.publishedId))
  const libraryOnly = loading ? [] : published.data.filter((p) => !linked.has(p.id))
  const onboarding = !loading && plans.length === 0

  return (
    <div className="animate-rise flex flex-col gap-6">
      <PageTitle title="Plans" subtitle="Pick a plan, make it yours, and let the schedule run itself." />

      {loading ? (
        <Skeleton className="h-56" />
      ) : onboarding ? (
        <Onboarding />
      ) : activePlan && today ? (
        <section aria-label="Active plan" className="card-accent flex flex-col gap-4 p-4">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-400">Active plan</p>
              <h2 className="num-display mt-1 truncate text-3xl">{activePlan.name}</h2>
              <p className="tabular text-sm text-[var(--color-fg-muted)]">
                {today.dayNumber > 0
                  ? `Today is day ${today.dayNumber} of ${today.cycleLength} in your plan`
                  : `Starts ${parseDayKey(today.date).toLocaleDateString()}`}
              </p>
              {todayDone ? (
                <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-go-400">
                  <Icon name="check-circle" size={16} className="shrink-0" />
                  Today's workout is done.{nextSlot ? ` Next: ${nextWorkoutLabel(nextSlot)}.` : ''}
                </p>
              ) : null}
            </div>
            <IconButton
              icon="pencil"
              label={`Edit ${activePlan.name}`}
              onClick={() => navigate(`/plans/${activePlan.id}`)}
            />
          </div>

          <PlanStats days={activePlan.days} />

          <WeekStrip slots={upcoming(7)} />

          <p className="text-xs text-[var(--color-fg-muted)]">
            Move to tomorrow: do today's workout tomorrow instead. Skip today: drop it and carry on with the plan.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon="arrow-right"
              disabled={today.isRest || todayDone}
              onClick={() => setPending({ kind: 'delay' })}
            >
              Move to tomorrow
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon="skip-forward"
              disabled={today.isRest || todayDone}
              onClick={() => setPending({ kind: 'skip' })}
            >
              Skip today
            </Button>
            <Button variant="secondary" size="sm" icon="eye" onClick={() => navigate(`/plans/view/${activePlan.id}`)}>
              View plan
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPending({ kind: 'deactivate' })}>
              Deactivate
            </Button>
          </div>
        </section>
      ) : (
        <section
          aria-label="No active plan"
          className="card flex items-start gap-3 border-brand-500/50 p-4"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-brand-400">
            <Icon name="layers" size={22} />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold uppercase">No active plan</h2>
            <p className="text-sm text-[var(--color-fg-muted)]">
              Pick one of your plans below and tap Switch to get a daily schedule.
            </p>
          </div>
        </section>
      )}

      {!onboarding ? (
        <section aria-label="My plans">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="flex-1 text-lg font-semibold">My plans</h2>
            <Button variant="secondary" size="sm" icon="plus" onClick={() => navigate('/plans/new')}>
              New plan
            </Button>
          </div>
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {ordered.map((p) => {
                const isActive = p.id === activePlan?.id
                const pub = p.publishedId ? publicOf.get(p.publishedId) : undefined
                // Saves publish automatically; this only shows if that failed (compared by content, not clocks).
                const stale = !!pub && !samePlanContent(p, pub)
                return (
                  <li
                    key={p.id}
                    className={`card flex flex-col gap-2 p-4 transition-colors duration-200 hover:border-brand-500/60 ${
                      isActive ? 'border-brand-500/60' : ''
                    }`}
                  >
                    <Link
                      to={`/plans/view/${p.id}`}
                      className="group -m-1 flex min-h-11 cursor-pointer items-start gap-2 rounded-xl p-1 focus-visible:outline-2 focus-visible:outline-brand-500"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-base font-semibold">{p.name}</span>
                          {isActive ? <Badge color="#22c55e">Active</Badge> : null}
                        </span>
                        <span className="tabular block text-xs text-[var(--color-fg-muted)]">{summaryText(p)}</span>
                      </span>
                      <Icon
                        name="chevron-right"
                        size={20}
                        className="mt-0.5 shrink-0 text-[var(--color-fg-muted)] transition-transform duration-200 group-hover:translate-x-0.5"
                      />
                    </Link>
                    <PlanSourcePill plan={p} />
                    {stale ? (
                      <p className="text-xs font-semibold text-amber-400">Changes not published yet</p>
                    ) : null}
                    {actionFor(p) === 'prompt' ? <PlanUpdateCard plan={p} /> : null}
                    {!isActive ? (
                      <div className="mt-auto pt-1">
                        <Button variant="go" size="sm" full onClick={() => setSwitching(p)}>
                          Switch
                        </Button>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      ) : null}

      {!loading ? (
        <Link
          to="/plans/library"
          className="card flex min-h-14 cursor-pointer items-center gap-3 p-4 transition-colors duration-200 hover:border-brand-500/60 focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-brand-400">
            <Icon name="search" size={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-xl font-semibold">Browse more plans</span>
            <span className="block text-sm text-[var(--color-fg-muted)]">
              Recommended and community plans, ready to add.
            </span>
          </span>
          <Icon name="chevron-right" size={20} className="text-[var(--color-fg-muted)]" />
        </Link>
      ) : null}

      {libraryOnly.length > 0 ? (
        <section aria-label="Published by you">
          <h2 className="mb-3 text-lg font-semibold">Published by you</h2>
          <PublicPlanList
            plans={libraryOnly}
            showAuthor={false}
            extra={(p) =>
              p.id === PPL_PUBLIC_ID ? null : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 text-rose-400 hover:text-rose-400"
                  onClick={() => setPending({ kind: 'remove', plan: p })}
                >
                  Remove from library
                </Button>
              )
            }
          />
        </section>
      ) : null}

      <SwitchPlanSheet plan={switching} onClose={() => setSwitching(null)} />

      <ConfirmSheet
        open={confirm !== null}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        confirmLabel={confirm?.label}
        tone={confirm?.tone ?? 'danger'}
        onCancel={() => setPending(null)}
        onConfirm={() => void confirm?.go()}
      />
    </div>
  )
}
