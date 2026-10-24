import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { PublicPlanList } from '../components/plans'
import { Button, EmptyState, IconButton, SectionHeader, Skeleton } from '../components/ui'
import { useProfiles } from '../contexts/SocialContext'
import { useToast } from '../contexts/ToastContext'
import { useExplorePlans, useRecommendedPlans } from '../hooks/usePublicPlans'
import type { PublicPlan } from '../types'

/** Browse the public plan library: recommended picks first, then the newest edits. */
export function ExplorePlans() {
  const navigate = useNavigate()
  const toast = useToast()
  const recommended = useRecommendedPlans()
  const explore = useExplorePlans()
  const [search, setSearch] = useState('')

  const newest = useMemo(() => {
    const starred = new Set(recommended.data.map((p) => p.id))
    return explore.data.filter((p) => !p.starred && !starred.has(p.id))
  }, [explore.data, recommended.data])

  const profileOf = useProfiles([...recommended.data, ...newest].map((p) => p.authorUid))
  const q = search.trim().toLowerCase()
  const matches = (p: PublicPlan) => {
    if (!q) return true
    const author = profileOf(p.authorUid)
    return [p.name, p.tagline, author?.username, author?.displayName].some((s) => s?.toLowerCase().includes(q))
  }
  const recShown = recommended.data.filter(matches)
  const newShown = newest.filter(matches)

  return (
    <div className="animate-rise flex flex-col gap-5">
      <header className="flex items-center gap-1">
        <IconButton icon="chevron-left" label="Back to plans" onClick={() => navigate('/plans')} className="-ml-2" />
        <div className="min-w-0 flex-1">
          <h1 className="num-display truncate text-3xl">Explore plans</h1>
          <p className="text-xs text-[var(--color-fg-muted)]">Plans from the community. Add one and make it yours.</p>
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

      {recommended.loading ? (
        <section aria-label="Recommended">
          <SectionHeader title="Recommended" />
          <Skeleton className="h-36" />
        </section>
      ) : recShown.length > 0 ? (
        <section aria-label="Recommended">
          <SectionHeader title="Recommended" />
          <PublicPlanList plans={recShown} />
        </section>
      ) : null}

      <section aria-label="Newest">
        <SectionHeader title="Newest" />
        {explore.loading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
          </div>
        ) : explore.error ? (
          <EmptyState
            icon="wifi-off"
            title="Couldn’t load plans"
            message="Check your connection and try again."
            action={
              <Button variant="secondary" icon="rotate" onClick={() => window.location.reload()}>
                Reload
              </Button>
            }
          />
        ) : newShown.length === 0 ? (
          <EmptyState
            icon="layers"
            title={q ? 'No matching plans' : 'No plans yet'}
            message={
              q
                ? explore.hasMore
                  ? 'Nothing loaded matches. Load more plans to search further.'
                  : 'Try a different name or author.'
                : 'Publish one of your plans from the Plans tab and it shows up here.'
            }
          />
        ) : (
          <PublicPlanList plans={newShown} />
        )}
        {explore.hasMore && !explore.loading && !explore.error ? (
          <Button
            variant="secondary"
            full
            className="mt-3"
            loading={explore.loadingMore}
            onClick={() => void explore.loadMore().catch(() => toast('Could not load more plans.', 'error'))}
          >
            Load more
          </Button>
        ) : null}
      </section>
    </div>
  )
}
