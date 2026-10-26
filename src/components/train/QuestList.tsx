import { Icon } from '../Icon'
import type { Quest } from '../../lib/quests'

/** Daily quest rows: icon, label, chunky progress bar and a check once done. */
export function QuestList({ quests }: { quests: Quest[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {quests.map((q) => {
        const pct = q.target > 0 ? Math.min(100, (q.progress / q.target) * 100) : 0
        return (
          <li key={q.id} className="flex items-center gap-3">
            <span
              className={`grid size-11 shrink-0 place-items-center rounded-xl ${
                q.done ? 'bg-go-500/15 text-go-400' : 'bg-[var(--color-surface-2)] text-[var(--color-fg-muted)]'
              }`}
            >
              <Icon name={q.icon} size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-sm font-bold">{q.label}</p>
                <p className="tabular shrink-0 text-xs font-semibold text-[var(--color-fg-muted)]">
                  {Math.round(q.progress)}/{q.target}
                </p>
              </div>
              <div
                role="progressbar"
                aria-label={q.label}
                aria-valuemin={0}
                aria-valuemax={q.target}
                aria-valuenow={Math.round(q.progress)}
                className="mt-1.5 h-4 overflow-hidden rounded-full bg-[var(--color-surface-2)]"
              >
                <div
                  className={`h-full rounded-full transition-[width] duration-500 ${
                    q.done ? 'bg-go-500' : 'bg-xp-400 animate-shine'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            <span
              className={`grid size-8 shrink-0 place-items-center rounded-full ${
                q.done ? 'animate-pop bg-go-500 text-ink-950' : 'border-2 border-[var(--color-line)] text-transparent'
              }`}
            >
              <Icon name="check" size={16} title={q.done ? 'Done' : undefined} />
            </span>
          </li>
        )
      })}
    </ul>
  )
}
