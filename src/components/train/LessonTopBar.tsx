import { Icon } from '../Icon'
import { IconButton } from '../ui'

/**
 * Sticky header of the workout "lesson": leave, chunky progress bar, XP counter, menu.
 * The line under it carries the name (tap to rename) and the live numbers.
 */
export function LessonTopBar({
  name,
  renaming,
  onNameChange,
  onRenameStart,
  onRenameEnd,
  dayLabel,
  doneSets,
  totalSets,
  sessionXp,
  stats,
  onLeave,
  onMenu,
}: {
  name: string
  renaming: boolean
  onNameChange: (name: string) => void
  onRenameStart: () => void
  onRenameEnd: () => void
  /** e.g. "Day 3 · Round 2" for plan sessions. */
  dayLabel?: string
  doneSets: number
  totalSets: number
  sessionXp: number
  /** Pre-formatted "12:30 · 8 sets · 4,200 kg" line. */
  stats: string
  onLeave: () => void
  onMenu: () => void
}) {
  const pct = totalSets ? Math.round((doneSets / totalSets) * 100) : 0

  return (
    <header className="sticky top-[env(safe-area-inset-top)] z-20 -mx-4 bg-[var(--color-canvas)]/90 px-4 pb-2 pt-1 backdrop-blur">
      <div className="flex items-center gap-1.5">
        <IconButton icon="minimize" label="Leave workout, it keeps running" onClick={onLeave} className="-ml-2" />
        <div
          role="progressbar"
          aria-label="Sets completed"
          aria-valuemin={0}
          aria-valuemax={totalSets}
          aria-valuenow={doneSets}
          className="relative h-4 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-2)]"
        >
          <div
            className="relative h-full overflow-hidden rounded-full bg-go-500 transition-[width] duration-500 motion-reduce:transition-none"
            style={{ width: `${pct}%`, minWidth: doneSets > 0 ? '1rem' : 0 }}
          >
            <span className="animate-shine absolute inset-0" aria-hidden="true" />
            <span className="absolute inset-x-2 top-1 h-1 rounded-full bg-white/30" />
          </div>
        </div>
        <span
          key={sessionXp}
          aria-label={`${sessionXp} XP this workout`}
          className="animate-pop tabular inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[var(--color-xp-400)]/15 px-2 py-1 text-sm font-bold text-[var(--color-xp-500)]"
        >
          <Icon name="zap" size={14} />
          {sessionXp}
        </span>
        <IconButton icon="more" label="Workout menu" onClick={onMenu} className="-mr-2" />
      </div>

      <div className="mt-0.5 flex min-w-0 items-center gap-2 text-sm text-[var(--color-fg-muted)]">
        {renaming ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            onBlur={onRenameEnd}
            onKeyDown={(e) => e.key === 'Enter' && onRenameEnd()}
            aria-label="Workout name"
            className="min-w-0 flex-1 rounded-lg border border-brand-500 bg-[var(--color-surface-2)] px-2 py-1 text-base font-semibold text-[var(--color-fg)] outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={onRenameStart}
            aria-label={`Workout name: ${name}. Tap to rename`}
            className="flex min-h-8 min-w-0 max-w-[55%] shrink items-center gap-1 text-left font-semibold text-[var(--color-fg)]"
          >
            <span className="truncate">{name}</span>
            <Icon name="pencil" size={13} className="shrink-0 text-[var(--color-fg-muted)]" />
          </button>
        )}
        {!renaming ? (
          <span className="tabular flex min-w-0 flex-1 items-center gap-1.5 truncate">
            <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-go-500 motion-reduce:animate-none" />
            <span className="truncate">{stats}</span>
          </span>
        ) : null}
      </div>
      {dayLabel && !renaming ? (
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-400">{dayLabel}</p>
      ) : null}
    </header>
  )
}
