import { useId, useState } from 'react'
import { Icon } from './Icon'
import { FollowPill } from './plans'
import { Badge, Button, Field, Segmented, Sheet } from './ui'
import { useToast } from '../contexts/ToastContext'
import { usePlanSync } from '../contexts/PlanSyncContext'
import { MUSCLE_COLORS } from '../data/exercises'
import { usePlans } from '../hooks/usePlans'
import { usePublicPlanActions } from '../hooks/usePublicPlans'
import { addDays, dayKey, fmtDuration, parseDayKey } from '../lib/date'
import { estimateMinutes, exerciseTargetLabel, planSummary, setCountOf } from '../lib/plans'
import { avgSessionMinutes, matchesDeletePhrase, DELETE_PHRASE, startDateFor } from '../lib/planUiLogic'
import type { DayKey, Plan, PlanDay } from '../types'

const fmtLong = (k: DayKey) =>
  parseDayKey(k).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

/* -------------------------------------------------------------------------- */
/* Stats                                                                       */
/* -------------------------------------------------------------------------- */

/** Cycle length · workouts · rest · ~min per session · total sets. */
export function PlanStats({ days, className = '' }: { days: PlanDay[]; className?: string }) {
  const { length, workouts, rests } = planSummary({ days })
  const sessions = days.filter((d) => d.kind === 'workout')
  const avgMin = avgSessionMinutes(days)
  const sets = sessions.reduce((t, d) => t + setCountOf(d.exercises), 0)
  const items: Array<[string, string]> = [
    [`${length}`, 'day cycle'],
    [`${workouts}`, 'workouts'],
    [`${rests}`, 'rest'],
    [avgMin ? `~${avgMin}` : '—', 'min / session'],
    [`${sets}`, 'sets'],
  ]
  return (
    <dl className={`grid grid-cols-3 gap-2 sm:grid-cols-5 ${className}`}>
      {items.map(([value, label]) => (
        <div
          key={label}
          className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2"
        >
          <dd className="num-display tabular text-2xl leading-none">{value}</dd>
          <dt className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
            {label}
          </dt>
        </div>
      ))}
    </dl>
  )
}

/* -------------------------------------------------------------------------- */
/* Day accordion                                                               */
/* -------------------------------------------------------------------------- */

function DayRow({ day, index, defaultOpen }: { day: PlanDay; index: number; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()

  if (day.kind === 'rest') {
    return (
      <li className="flex min-h-12 items-center gap-3 rounded-xl border border-rest/50 px-3 text-rest">
        <span className="tabular w-5 font-display text-lg font-bold">{index + 1}</span>
        <Icon name="moon" size={18} />
        <span className="font-semibold">Rest day</span>
      </li>
    )
  }

  return (
    <li className="card overflow-hidden border-l-4 border-l-brand-500">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-14 w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors duration-200 hover:bg-[var(--color-surface-2)]"
      >
        <span className="tabular w-5 font-display text-lg font-bold text-brand-400">{index + 1}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-xl font-semibold">{day.name}</span>
          <span className="tabular block truncate text-xs text-[var(--color-fg-muted)]">
            {day.focus ? `${day.focus} · ` : ''}
            {day.exercises.length} exercises · {setCountOf(day.exercises)} sets · ~
            {fmtDuration(estimateMinutes(day.exercises) * 60)}
          </span>
        </span>
        <Icon
          name="chevron-down"
          size={18}
          className={`shrink-0 text-[var(--color-fg-muted)] transition-transform duration-200 motion-reduce:transition-none ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {open ? (
        <ul id={panelId} className="flex flex-col gap-1.5 px-3 pb-3 text-sm">
          {day.exercises.length === 0 ? (
            <li className="text-[var(--color-fg-muted)]">No exercises yet.</li>
          ) : null}
          {day.exercises.map((e, j) => {
            const rest = e.restSec ? fmtDuration(e.restSec) : null
            return (
              <li key={`${e.exerciseId}-${j}`} className="flex items-center gap-2 py-0.5">
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: MUSCLE_COLORS[e.muscle] }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                <span className="tabular shrink-0 text-xs text-[var(--color-fg-muted)]">
                  {exerciseTargetLabel(e)}
                  {rest ? ` · ${rest} rest` : ''}
                </span>
              </li>
            )
          })}
        </ul>
      ) : null}
    </li>
  )
}

/** Tap a day to see its exercises (sets × rep target · rest). Rest days stay flat. */
export function DayAccordion({ days }: { days: PlanDay[] }) {
  const first = days.findIndex((d) => d.kind === 'workout')
  return (
    <ol className="flex flex-col gap-2" aria-label="Days in the cycle">
      {days.map((d, i) => (
        <DayRow key={d.id} day={d} index={i} defaultOpen={i === first} />
      ))}
    </ol>
  )
}

/* -------------------------------------------------------------------------- */
/* Source pill                                                                 */
/* -------------------------------------------------------------------------- */

/** Where a plan came from: Published by me, or a followed / customised copy. */
export function PlanSourcePill({ plan }: { plan: Plan }) {
  const { actionFor } = usePlanSync()
  if (plan.publishedId) {
    return (
      <Badge className="mt-1 gap-1 bg-brand-500/15 text-brand-400 normal-case tracking-normal">
        <Icon name="users" size={14} />
        Published
      </Badge>
    )
  }
  if (plan.sharedFrom) return <FollowPill plan={plan} action={actionFor(plan)} />
  return null
}

/* -------------------------------------------------------------------------- */
/* Switch / start sheet                                                        */
/* -------------------------------------------------------------------------- */

type When = 'today' | 'tomorrow' | 'pick'

function SwitchInner({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const toast = useToast()
  const { activatePlan, activePlan } = usePlans()
  const [when, setWhen] = useState<When>('today')
  const [picked, setPicked] = useState(dayKey())
  const [dayIndex, setDayIndex] = useState(0)
  const [busy, setBusy] = useState(false)

  const today = dayKey()
  const chosen: DayKey | '' = when === 'today' ? today : when === 'tomorrow' ? dayKey(addDays(new Date(), 1)) : picked
  const days = plan?.days ?? []
  const day = days[dayIndex]

  async function start() {
    if (!plan || !chosen) return
    setBusy(true)
    try {
      await activatePlan(plan.id, startDateFor(chosen, dayIndex))
      toast(`${plan.name} is now your plan.`)
      onClose()
    } catch {
      toast('Could not start the plan. Try again.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const switching = !!activePlan && activePlan.id !== plan?.id

  return (
    <Sheet
      open={plan !== null}
      onClose={busy ? () => undefined : onClose}
      title={plan ? `Start ${plan.name}` : 'Start plan'}
      footer={
        <Button full variant="go" size="lg" icon="check" loading={busy} disabled={!chosen} onClick={() => void start()}>
          {switching ? 'Switch to this plan' : 'Start plan'}
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-2" aria-label="Start date">
          <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-fg-muted)]">Start date</h3>
          <Segmented
            label="Start date"
            value={when}
            onChange={setWhen}
            options={[
              { value: 'today', label: 'Today' },
              { value: 'tomorrow', label: 'Tomorrow' },
              { value: 'pick', label: 'Pick a date' },
            ]}
          />
          {when === 'pick' ? (
            <Field
              label="Date"
              type="date"
              value={picked}
              onChange={(e) => setPicked(e.target.value)}
              className="[color-scheme:dark] [html.light_&]:[color-scheme:light]"
            />
          ) : null}
        </section>

        <section className="flex flex-col gap-2" aria-label="Starting day">
          <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-fg-muted)]">
            Starting day
          </h3>
          <div role="radiogroup" aria-label="Starting day" className="flex flex-wrap gap-2">
            {days.map((d, i) => {
              const on = i === dayIndex
              return (
                <button
                  key={d.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setDayIndex(i)}
                  className={`min-h-11 cursor-pointer rounded-xl border px-3 text-sm font-semibold transition-colors duration-200 ${
                    on
                      ? 'border-brand-500 bg-brand-500 text-ink-950'
                      : 'border-[var(--color-line)] bg-[var(--color-surface-2)] text-[var(--color-fg)] hover:border-brand-500/60'
                  }`}
                >
                  <span className="tabular opacity-70">{i + 1}</span> {d.kind === 'rest' ? 'Rest day' : d.name}
                </button>
              )
            })}
          </div>
          {chosen && day ? (
            <p className="text-sm text-[var(--color-fg-muted)]" aria-live="polite">
              {fmtLong(chosen)} is {day.kind === 'rest' ? 'a rest day' : day.name}
              {dayIndex > 0 ? `, so day 1 was ${fmtLong(startDateFor(chosen, dayIndex))}` : ''}.
            </p>
          ) : null}
        </section>

        {switching && activePlan ? (
          <p className="text-sm text-[var(--color-fg-muted)]">
            This replaces {activePlan.name} as your active plan. Both stay in your library.
          </p>
        ) : null}
      </div>
    </Sheet>
  )
}

/** "Start <plan>": pick when it begins and which day of the cycle to open on. */
export function SwitchPlanSheet({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  // Re-keyed per plan so a reopened sheet always starts from today / day 1.
  return <SwitchInner key={plan?.id ?? 'none'} plan={plan} onClose={onClose} />
}

/* -------------------------------------------------------------------------- */
/* Delete sheet                                                                */
/* -------------------------------------------------------------------------- */

function DeleteInner({
  plan,
  onClose,
  onDeleted,
}: {
  plan: Plan | null
  onClose: () => void
  onDeleted?: () => void
}) {
  const toast = useToast()
  const { deletePlan, activePlan } = usePlans()
  const { unpublish, stopUsing } = usePublicPlanActions()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const ok = matchesDeletePhrase(typed)
  const wasActive = !!plan && activePlan?.id === plan.id

  async function remove() {
    if (!plan || !ok) return
    setBusy(true)
    try {
      if (plan.publishedId) await unpublish(plan.id)
      if (plan.sharedFrom) void stopUsing(plan.sharedFrom.publicPlanId)
      await deletePlan(plan.id)
      toast('Plan deleted.')
      onClose()
      onDeleted?.()
    } catch {
      toast('Could not delete the plan. Try again.', 'error')
      setBusy(false)
    }
  }

  const effects: string[] = [
    ...(wasActive ? ['It stops being your active plan.'] : []),
    ...(plan?.publishedId ? ['It is unpublished from the library.'] : []),
    'Workouts you already logged are kept.',
  ]

  return (
    <Sheet
      open={plan !== null}
      onClose={busy ? () => undefined : onClose}
      title="Delete plan"
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" full disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" full icon="trash" loading={busy} disabled={!ok} onClick={() => void remove()}>
            Delete plan
          </Button>
        </div>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void remove()
        }}
      >
        <p className="text-[var(--color-fg-muted)]">
          <strong className="text-[var(--color-fg)]">{plan?.name}</strong> will be permanently removed.
        </p>
        <ul className="flex flex-col gap-1.5 text-sm">
          {effects.map((t) => (
            <li key={t} className="flex items-start gap-2">
              <Icon name="check" size={16} className="mt-0.5 shrink-0 text-rose-400" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
        <Field
          label={`Type “${DELETE_PHRASE}” to confirm`}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          placeholder={DELETE_PHRASE}
        />
      </form>
    </Sheet>
  )
}

/** Destructive, so the red button stays disabled until the phrase is typed. */
export function DeletePlanSheet({
  plan,
  onClose,
  onDeleted,
}: {
  plan: Plan | null
  onClose: () => void
  onDeleted?: () => void
}) {
  return <DeleteInner key={plan?.id ?? 'none'} plan={plan} onClose={onClose} onDeleted={onDeleted} />
}
