import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { DayAccordion, PlanStats, SwitchPlanSheet } from '../components/planUi'
import { AuthorLink, ByLine, DayChips } from '../components/plans'
import { displayOf } from '../components/social'
import { Badge, Button, EmptyState, IconButton, SectionHeader, Sheet, Skeleton } from '../components/ui'
import { useProfiles } from '../contexts/SocialContext'
import { useToast } from '../contexts/ToastContext'
import { PLAN_TEMPLATES } from '../data/programs'
import { usePlans } from '../hooks/usePlans'
import {
  useAllPublicPlans,
  usePublicPlanActions,
  usedByCount,
  useRecommendedPlans,
} from '../hooks/usePublicPlans'
import { templateToPlanDays } from '../lib/plans'
import { infoLine, partitionStarred } from '../lib/planUiLogic'
import type { Plan, PlanDay, PlanTemplate, PublicPlan } from '../types'

/** One card's worth of data, whether it came from the library or the built-in templates. */
interface Item {
  key: string
  name: string
  about: string
  days: PlanDay[]
  starred: boolean
  authorUid?: string
  usedBy?: number
  pub?: PublicPlan
  template?: PlanTemplate
}

const fromPublic = (p: PublicPlan): Item => ({
  key: p.id,
  name: p.name,
  about: p.description || p.tagline || '',
  days: p.days,
  starred: p.starred === true,
  authorUid: p.authorUid,
  usedBy: usedByCount(p),
  pub: p,
})

const fromTemplate = (t: PlanTemplate): Item => ({
  key: `tpl-${t.id}`,
  name: t.name,
  about: t.description || t.tagline,
  days: t.days,
  starred: false,
  template: t,
})

function LibraryCard({ item, onOpen }: { item: Item; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`View ${item.name}`}
      className={`${item.starred ? 'card-accent' : 'card'} flex h-full w-full cursor-pointer flex-col gap-2 p-4 text-left
        transition-[border-color,transform] duration-200 hover:border-brand-500/70 active:scale-[0.99]
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 motion-reduce:transition-none`}
    >
      <span className="flex w-full items-start gap-2">
        <span className="min-w-0 flex-1">
          {item.starred ? (
            <Badge className="mb-1.5 gap-1 bg-brand-500/15 text-brand-400">
              <Icon name="star" size={12} />
              Recommended
            </Badge>
          ) : null}
          <span className="num-display block text-2xl">{item.name}</span>
        </span>
        <Icon name="chevron-right" size={20} className="mt-1 shrink-0 text-[var(--color-fg-muted)]" />
      </span>
      {item.about ? (
        <span className="line-clamp-2 text-sm text-[var(--color-fg-muted)]">{item.about}</span>
      ) : null}
      <span className="tabular text-xs font-semibold">{infoLine(item.days)}</span>
      <DayChips days={item.days} />
      <span className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs text-[var(--color-fg-muted)]">
        <span className="min-w-0 truncate font-semibold">
          {item.authorUid ? <ByLine uid={item.authorUid} /> : 'Built-in'}
        </span>
        {item.usedBy !== undefined && item.usedBy >= 2 ? (
          <span className="tabular flex shrink-0 items-center gap-1">
            <Icon name="users" size={14} />
            Used by {item.usedBy}
          </span>
        ) : null}
      </span>
    </button>
  )
}

function CardGrid({ items, onOpen }: { items: Item[]; onOpen: (i: Item) => void }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map((i) => (
        <li key={i.key}>
          <LibraryCard item={i} onOpen={() => onOpen(i)} />
        </li>
      ))}
    </ul>
  )
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Skeleton className="h-48" />
      <Skeleton className="h-48" />
    </div>
  )
}

/** Full detail of a library plan with the sticky "Add to my plans" action. */
function DetailSheet({
  item,
  mine,
  onClose,
  onAdded,
}: {
  item: Item | null
  mine: Plan | undefined
  onClose: () => void
  onAdded: (planId: string) => void
}) {
  const navigate = useNavigate()
  const toast = useToast()
  const { adopt } = usePublicPlanActions()
  const { savePlan } = usePlans()
  const [busy, setBusy] = useState(false)

  async function add() {
    if (!item) return
    if (mine) {
      onClose()
      return navigate(`/plans/view/${mine.id}`)
    }
    setBusy(true)
    try {
      const id = item.pub
        ? await adopt(item.pub)
        : await savePlan({
            name: item.name,
            days: templateToPlanDays(item.template!),
            templateId: item.template!.id,
          })
      onAdded(id)
    } catch {
      toast('Could not add the plan. Try again.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={item !== null}
      onClose={onClose}
      size="full"
      title={item?.name ?? 'Plan'}
      footer={
        item ? (
          <Button
            full
            variant="go"
            size="lg"
            icon={mine ? 'check' : 'plus'}
            loading={busy}
            onClick={() => void add()}
          >
            {mine ? 'In your plans · Open' : 'Add to my plans'}
          </Button>
        ) : null
      }
    >
      {item ? (
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-2" aria-label="About">
            {item.starred ? (
              <Badge className="w-fit gap-1 bg-brand-500/15 text-brand-400">
                <Icon name="star" size={12} />
                Recommended
              </Badge>
            ) : null}
            <p className="whitespace-pre-line text-sm">{item.about || 'No description yet.'}</p>
            <div className="flex items-center justify-between gap-2">
              {item.authorUid ? <AuthorLink uid={item.authorUid} /> : <span className="text-sm text-[var(--color-fg-muted)]">Built-in plan</span>}
              {item.usedBy !== undefined && item.usedBy >= 2 ? (
                <span className="tabular flex shrink-0 items-center gap-1 text-xs text-[var(--color-fg-muted)]">
                  <Icon name="users" size={14} />
                  Used by {item.usedBy}
                </span>
              ) : null}
            </div>
          </section>
          <section aria-label="Structure" className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-fg-muted)]">
              How it is laid out
            </h3>
            <PlanStats days={item.days} />
            <DayChips days={item.days} />
          </section>
          <section aria-label="Days" className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-fg-muted)]">
              Day by day
            </h3>
            <DayAccordion days={item.days} />
          </section>
        </div>
      ) : null}
    </Sheet>
  )
}

/** Browse the public plan library: the owner's recommended picks, then everything else. */
export function PlanLibrary() {
  const navigate = useNavigate()
  const toast = useToast()
  const recommended = useRecommendedPlans()
  const all = useAllPublicPlans()
  const { plans, activePlan } = usePlans()
  const [search, setSearch] = useState('')
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [startId, setStartId] = useState<string | null>(null)

  const { starred, others } = useMemo(() => {
    const seen = new Set<string>()
    const merged = [...recommended.data, ...all.data].filter((p) => !seen.has(p.id) && !!seen.add(p.id))
    return partitionStarred(merged)
  }, [recommended.data, all.data])

  const loading = recommended.loading || all.loading
  const offline = !loading && (all.error || recommended.error) && starred.length + others.length === 0
  const empty = !loading && !offline && starred.length + others.length === 0
  // Built-ins stand in when the library can't be reached or is empty.
  const useTemplates = offline || empty

  const profileOf = useProfiles([...starred, ...others].map((p) => p.authorUid))
  const q = search.trim().toLowerCase()
  const matches = (i: Item) => {
    if (!q) return true
    const a = i.authorUid ? displayOf(profileOf(i.authorUid)) : null
    return [i.name, i.about, a?.handle, a?.name].some((s) => s?.toLowerCase().includes(q))
  }

  const recItems = starred.map(fromPublic).filter(matches)
  const allItems = (useTemplates ? PLAN_TEMPLATES.map(fromTemplate) : others.map(fromPublic)).filter(matches)
  const everything = [...recItems, ...allItems]
  const opened = everything.find((i) => i.key === openKey) ?? null

  const copyFor = (i: Item | null) =>
    !i ? undefined : i.pub ? plans.find((p) => p.sharedFrom?.publicPlanId === i.pub!.id) : plans.find((p) => p.templateId === i.template?.id)

  // The new copy arrives through the plans listener; the start sheet opens once it does.
  const startPlan = startId ? (plans.find((p) => p.id === startId) ?? null) : null

  function added(id: string) {
    setOpenKey(null)
    if (!activePlan) {
      setStartId(id)
    } else {
      toast('Added to your plans.')
    }
  }

  return (
    <div className="animate-rise flex flex-col gap-5">
      <header className="flex items-center gap-1">
        <IconButton icon="chevron-left" label="Back to plans" onClick={() => navigate('/plans')} className="-ml-2" />
        <div className="min-w-0 flex-1">
          <h1 className="num-display truncate text-3xl">Plan library</h1>
          <p className="text-xs text-[var(--color-fg-muted)]">Proven splits and community plans. Add one and make it yours.</p>
        </div>
      </header>

      <div className="sticky top-[env(safe-area-inset-top)] z-20 -mx-4 bg-[var(--color-canvas)] px-4 py-2">
        <label className="relative block">
          <span className="sr-only">Search plans by name or author</span>
          <Icon
            name="search"
            size={18}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-fg-muted)]"
          />
          <input
            type="search"
            enterKeyHint="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            placeholder="Search plans or authors"
            className="min-h-12 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] pl-10 pr-3 text-base outline-none placeholder:text-[var(--color-fg-muted)] focus:border-brand-500"
          />
        </label>
      </div>

      {loading ? (
        <GridSkeleton />
      ) : (
        <>
          {offline ? (
            <p className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm font-semibold text-amber-400">
              <Icon name="wifi-off" size={16} className="shrink-0" />
              Can’t reach the library. Showing built-in plans.
            </p>
          ) : null}

          {recItems.length > 0 ? (
            <section aria-label="Recommended">
              <SectionHeader title="Recommended" />
              <CardGrid items={recItems} onOpen={(i) => setOpenKey(i.key)} />
            </section>
          ) : null}

          <section aria-label="All plans">
            <SectionHeader title={useTemplates ? 'Built-in plans' : 'All plans'} />
            {allItems.length === 0 ? (
              <EmptyState
                icon="layers"
                title={q ? 'No matching plans' : 'No plans yet'}
                message={
                  q
                    ? all.hasMore
                      ? 'Nothing loaded matches. Load more plans to search further.'
                      : 'Try a different name or author.'
                    : 'Publish one of your plans from the Plans tab and it shows up here.'
                }
              />
            ) : (
              <CardGrid items={allItems} onOpen={(i) => setOpenKey(i.key)} />
            )}
            {!useTemplates && all.hasMore ? (
              <Button
                variant="secondary"
                full
                className="mt-3"
                loading={all.loadingMore}
                onClick={() => void all.loadMore().catch(() => toast('Could not load more plans.', 'error'))}
              >
                Load more
              </Button>
            ) : null}
          </section>

          <Link
            to="/plans/new"
            className="min-h-11 self-center rounded-xl px-3 py-2.5 text-sm font-semibold text-[var(--color-fg-muted)] hover:text-brand-400"
          >
            Or build your own plan
          </Link>
        </>
      )}

      <DetailSheet item={opened} mine={copyFor(opened)} onClose={() => setOpenKey(null)} onAdded={added} />
      <SwitchPlanSheet plan={startPlan} onClose={() => setStartId(null)} />
    </div>
  )
}
