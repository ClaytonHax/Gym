import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ExerciseListEditor } from '../components/ExerciseListEditor'
import { Icon } from '../components/Icon'
import { Button, ConfirmSheet, IconButton, Segmented, Sheet, Skeleton } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { getTemplate } from '../data/programs'
import { usePlans } from '../hooks/usePlans'
import { usePublicPlan, usePublicPlanActions } from '../hooks/usePublicPlans'
import { StopsUpdatesNotice } from '../components/plans'
import { dayKey } from '../lib/date'
import {
  blankPlanDays,
  cloneDays,
  newRestDay,
  newWorkoutDay,
  planSummary,
  setCountOf,
  templateToPlanDays,
} from '../lib/plans'
import type { PlanDay } from '../types'

interface Draft {
  name: string
  templateId?: string
  days: PlanDay[]
}

/**
 * Create a plan from a template or blank, or edit a saved one, then add it to my plan.
 * At /plans/public/:pid/edit it edits a plan I published in the library directly.
 */
export function PlanEditor() {
  const { id, pid } = useParams()
  const { user } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { plans, loading, activePlan, savePlan, updatePlan, activatePlan } = usePlans()

  const { savePublic } = usePublicPlanActions()
  const { plan: publicPlan, loading: publicLoading } = usePublicPlan(pid)

  const isPublic = !!pid
  const isNew = !isPublic && (!id || id === 'new')
  const saved = isNew || isPublic ? null : (plans.find((p) => p.id === id) ?? null)
  const canEditPublic = !!publicPlan && publicPlan.authorUid === user?.uid

  const [draft, setDraft] = useState<Draft | null>(null)
  const [startDate, setStartDate] = useState(dayKey())
  const [editingDay, setEditingDay] = useState<string | null>(null)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const baseline = useRef('')

  // Seed the draft once: from a template, a blank plan, or the saved plan being edited.
  useEffect(() => {
    if (draft) return
    let seed: Draft | null = null
    if (isNew) {
      const template = getTemplate(params.get('template') ?? '')
      seed = template
        ? { name: template.name, templateId: template.id, days: templateToPlanDays(template) }
        : { name: 'My plan', days: blankPlanDays() }
    } else if (isPublic) {
      if (canEditPublic && publicPlan) seed = { name: publicPlan.name, days: cloneDays(publicPlan.days) }
    } else if (saved) {
      seed = { name: saved.name, templateId: saved.templateId, days: cloneDays(saved.days) }
    }
    if (!seed) return
    baseline.current = JSON.stringify({ name: seed.name, days: seed.days })
    setDraft(seed)
  }, [draft, isNew, isPublic, canEditPublic, publicPlan, saved, params])

  const dirty = useMemo(
    () => (draft ? JSON.stringify({ name: draft.name, days: draft.days }) !== baseline.current : false),
    [draft]
  )

  // Warn before the tab closes with edits that would be lost.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  if (!draft) {
    const missing = isPublic ? !publicLoading && !canEditPublic : !isNew && !loading && !saved
    if (missing) {
      return (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="font-semibold">
            {isPublic && publicPlan ? 'Only the author can edit this plan.' : 'That plan no longer exists.'}
          </p>
          <Button onClick={() => navigate('/plans', { replace: true })}>Back to plans</Button>
        </div>
      )
    }
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-12" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    )
  }

  const { workouts, rests, length } = planSummary(draft)
  const editing = draft.days.find((d) => d.id === editingDay) ?? null

  function patchDraft(patch: Partial<Draft>) {
    setDraft((d) => (d ? { ...d, ...patch } : d))
  }

  function patchDay(dayId: string, patch: Partial<PlanDay>) {
    setDraft((d) => (d ? { ...d, days: d.days.map((x) => (x.id === dayId ? { ...x, ...patch } : x)) } : d))
  }

  function moveDay(i: number, dir: -1 | 1) {
    setDraft((d) => {
      if (!d) return d
      const t = i + dir
      if (t < 0 || t >= d.days.length) return d
      const days = [...d.days]
      ;[days[i], days[t]] = [days[t], days[i]]
      return { ...d, days }
    })
  }

  function setKind(day: PlanDay, kind: 'workout' | 'rest') {
    if (day.kind === kind) return
    patchDay(day.id, kind === 'rest' ? { kind, name: 'Rest', exercises: [], focus: undefined } : { kind, name: 'Workout' })
  }

  function leave() {
    if (dirty) setLeaveOpen(true)
    else navigate(-1)
  }

  function validate(): string | null {
    if (!draft!.name.trim()) return 'Give the plan a name.'
    if (workouts === 0) return 'Add at least one workout day.'
    if (draft!.days.some((d) => d.kind === 'workout' && !d.name.trim())) return 'Every workout day needs a name.'
    return null
  }

  /** Persist the draft; `activate` also makes it the active plan from the chosen date. */
  async function commit(activate: boolean) {
    const problem = validate()
    if (problem) return toast(problem, 'error')
    setSaving(true)
    const name = draft!.name.trim()
    const days = draft!.days.map((d) => ({ ...d, name: d.name.trim() || d.name }))
    try {
      if (isPublic && pid) {
        await savePublic(pid, { name, days })
        baseline.current = JSON.stringify({ name: draft!.name, days: draft!.days })
        toast('Published plan updated.')
        navigate('/plans', { replace: true })
        return
      }
      let planId = saved?.id ?? ''
      // Editing a followed copy makes it the user's own: automatic updates stop.
      const customizes = !!saved?.sharedFrom && !saved.publishedId && dirty
      if (saved) await updatePlan(saved.id, { name, days }, { customized: customizes })
      else planId = await savePlan({ name, days, ...(draft!.templateId ? { templateId: draft!.templateId } : {}) })
      if (activate) await activatePlan(planId, startDate)
      baseline.current = JSON.stringify({ name: draft!.name, days: draft!.days })
      // Published plans go live in the same save. The private save stands if this fails;
      // the Plans page keeps an "Update published" button as the retry.
      let publishFailed = false
      if (saved?.publishedId) {
        try {
          await savePublic(saved.publishedId, { name, days })
        } catch {
          publishFailed = true
        }
      }
      if (publishFailed) toast('Saved, but the published copy could not be updated. Retry from Plans.', 'error')
      else toast(activate ? 'Added to your plan.' : saved?.publishedId ? 'Saved and live for everyone.' : 'Plan saved.')
      navigate(activate ? '/' : '/plans', { replace: true })
    } catch {
      toast('Could not save the plan.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const isActive = saved && activePlan?.id === saved.id

  return (
    <div className="animate-rise flex flex-col gap-5">
      <header className="flex items-center gap-1">
        <IconButton icon="chevron-left" label="Back" onClick={leave} className="-ml-2" />
        <div className="min-w-0 flex-1">
          <h1 className="num-display truncate text-3xl">{isNew ? 'New plan' : isPublic ? 'Edit published plan' : 'Edit plan'}</h1>
          <p className="tabular text-xs text-[var(--color-fg-muted)]">
            {length}-day cycle · {workouts} workouts · {rests} rest
          </p>
        </div>
      </header>

      {saved?.sharedFrom && !saved.publishedId && !saved.sharedFrom.customized ? (
        <StopsUpdatesNotice authorUid={saved.sharedFrom.authorUid} />
      ) : null}

      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Plan name
        <input
          enterKeyHint="done"
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          value={draft.name}
          onChange={(e) => patchDraft({ name: e.target.value })}
          placeholder="e.g. Push / Pull / Legs"
          maxLength={60}
          className="min-h-12 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 text-base outline-none focus:border-brand-500"
        />
      </label>

      <section aria-label="Cycle days">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 className="text-lg font-semibold">Cycle days</h2>
          <p className="text-xs text-[var(--color-fg-muted)]">Repeats after day {length}</p>
        </div>
        <ol className="flex flex-col gap-3">
          {draft.days.map((day, i) => {
            const rest = day.kind === 'rest'
            return (
              <li
                key={day.id}
                className={`card p-3 ${rest ? 'border-rest/50' : 'border-l-4 border-l-brand-500'}`}
              >
                <div className="flex items-center gap-1">
                  <span
                    className={`tabular grid size-9 shrink-0 place-items-center rounded-lg font-display text-lg font-bold ${
                      rest ? 'bg-rest/15 text-rest' : 'bg-brand-500/15 text-brand-400'
                    }`}
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  {rest ? (
                    <p className="flex min-h-11 flex-1 items-center gap-2 px-2 font-semibold text-rest">
                      <Icon name="moon" size={18} />
                      Rest day
                    </p>
                  ) : (
                    <input
                      value={day.name}
                      onChange={(e) => patchDay(day.id, { name: e.target.value })}
                      aria-label={`Name of day ${i + 1}`}
                      className="min-h-11 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 font-display text-xl font-semibold outline-none focus:border-brand-500"
                    />
                  )}
                  <IconButton
                    icon="arrow-up"
                    label={`Move day ${i + 1} up`}
                    disabled={i === 0}
                    onClick={() => moveDay(i, -1)}
                  />
                  <IconButton
                    icon="arrow-down"
                    label={`Move day ${i + 1} down`}
                    disabled={i === draft.days.length - 1}
                    onClick={() => moveDay(i, 1)}
                  />
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <Segmented
                      label={`Day ${i + 1} type`}
                      value={day.kind}
                      onChange={(k) => setKind(day, k)}
                      options={[
                        { value: 'workout', label: 'Workout' },
                        { value: 'rest', label: 'Rest' },
                      ]}
                    />
                  </div>
                  <IconButton
                    icon="trash"
                    label={`Remove day ${i + 1}`}
                    disabled={draft.days.length <= 1}
                    onClick={() => patchDraft({ days: draft.days.filter((d) => d.id !== day.id) })}
                    className="hover:bg-rose-500/15 hover:text-rose-400"
                  />
                </div>

                {rest ? null : (
                  <button
                    type="button"
                    onClick={() => setEditingDay(day.id)}
                    className="mt-2 flex min-h-12 w-full items-center gap-2 rounded-xl bg-[var(--color-surface-2)] px-3 text-left transition-colors duration-200 hover:bg-[var(--color-line)]"
                  >
                    <Icon name="dumbbell" size={18} className="shrink-0 text-brand-400" />
                    <span className="tabular min-w-0 flex-1 truncate text-sm">
                      {day.exercises.length === 0
                        ? 'Add exercises'
                        : `${day.exercises.length} exercises · ${setCountOf(day.exercises)} sets`}
                    </span>
                    <span className="text-xs font-semibold text-brand-400">Edit</span>
                    <Icon name="chevron-right" size={16} className="text-[var(--color-fg-muted)]" />
                  </button>
                )}
              </li>
            )
          })}
        </ol>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <Button
            variant="secondary"
            icon="plus"
            onClick={() =>
              patchDraft({ days: [...draft.days, newWorkoutDay(`Day ${draft.days.length + 1}`)] })
            }
          >
            Workout day
          </Button>
          <Button
            variant="secondary"
            icon="moon"
            onClick={() => patchDraft({ days: [...draft.days, newRestDay()] })}
          >
            Rest day
          </Button>
        </div>
      </section>

      <div className="card-accent">
        <div className="flex flex-col gap-2 p-4">
          {isPublic ? (
            <>
              <p className="text-sm text-[var(--color-fg-muted)]">
                This updates the plan in the public library. People following it get your changes
                automatically, unless they customised their copy.
              </p>
              <Button full variant="go" size="lg" icon="check" loading={saving} onClick={() => commit(false)}>
                Save changes
              </Button>
            </>
          ) : (
            <>
              {saved?.publishedId ? (
                <p className="flex items-start gap-2 text-sm font-semibold text-go-400">
                  <Icon name="share" size={16} className="mt-0.5 shrink-0" />
                  Edits go live for everyone
                </p>
              ) : null}
              <label className="flex items-center justify-between gap-3 text-sm font-semibold">
                Start date
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => e.target.value && setStartDate(e.target.value)}
                  className="min-h-11 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 outline-none focus:border-brand-500"
                />
              </label>
              {isNew ? (
                <Button full variant="go" size="lg" icon="check" loading={saving} onClick={() => commit(true)}>
                  Add to my plan
                </Button>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="secondary" size="lg" loading={saving} onClick={() => commit(false)}>
                    Save changes
                  </Button>
                  <Button variant="go" size="lg" loading={saving} onClick={() => commit(true)}>
                    {isActive ? 'Save and restart' : 'Make active'}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Sheet
        open={editing !== null}
        onClose={() => setEditingDay(null)}
        title={editing ? `${editing.name || 'Workout'} exercises` : 'Exercises'}
        footer={
          <Button full onClick={() => setEditingDay(null)}>
            Done
          </Button>
        }
      >
        {editing ? (
          <ExerciseListEditor
            items={editing.exercises}
            onChange={(exercises) => patchDay(editing.id, { exercises })}
          />
        ) : null}
      </Sheet>

      <ConfirmSheet
        open={leaveOpen}
        title="Discard changes?"
        message="You have unsaved edits to this plan. Leaving now will lose them."
        confirmLabel="Discard"
        onCancel={() => setLeaveOpen(false)}
        onConfirm={() => {
          setLeaveOpen(false)
          navigate(-1)
        }}
      />
    </div>
  )
}
