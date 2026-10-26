import { useState } from 'react'
import { Icon } from '../Icon'
import { Sheet } from '../ui'
import { QuestList } from './QuestList'
import { XP_RULES, type LevelInfo } from '../../lib/xp'
import type { Quest } from '../../lib/quests'
import type { StreakStats } from '../../lib/streaks'

type Which = 'streak' | 'level' | 'quests'

const PILL =
  'flex min-h-14 min-w-0 items-center justify-center gap-2 rounded-2xl border-2 border-[var(--color-line)] bg-[var(--color-surface)] px-2 font-display text-xl font-bold transition-colors hover:border-brand-500/60'

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/** Duolingo-style top bar: streak, level and daily quests, each opening a detail sheet. */
export function TrainStatusBar({
  streak,
  level,
  quests,
}: {
  streak: StreakStats
  level: LevelInfo
  quests: Quest[]
}) {
  const [open, setOpen] = useState<Which | null>(null)
  const unit = streak.mode === 'plan' ? 'day' : 'week'
  const questsDone = quests.filter((q) => q.done).length
  const close = () => setOpen(null)

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => setOpen('streak')}
          aria-label={`${plural(streak.current, unit)} streak${streak.todayDone ? '' : ', not trained yet today'}`}
          className={`${PILL} ${streak.current > 0 ? 'text-flame' : 'text-[var(--color-fg-muted)]'}`}
        >
          <Icon name="flame" size={24} className={streak.todayDone ? 'animate-flame' : ''} />
          <span className="tabular">{streak.current}</span>
        </button>
        <button
          type="button"
          onClick={() => setOpen('level')}
          aria-label={`Level ${level.level}, ${Math.round(level.progress * 100)} percent to the next`}
          className={`${PILL} text-xp-400`}
        >
          <Icon name="zap" size={22} />
          <span className="flex min-w-0 flex-col items-start leading-none">
            <span className="tabular">Lv {level.level}</span>
            <span className="mt-1 h-1.5 w-12 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
              <span
                className="block h-full rounded-full bg-xp-400"
                style={{ width: `${Math.round(level.progress * 100)}%` }}
              />
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setOpen('quests')}
          aria-label={`Daily quests, ${questsDone} of ${quests.length} done`}
          className={`${PILL} ${questsDone === quests.length ? 'text-go-400' : 'text-brand-400'}`}
        >
          <Icon name="target" size={22} />
          <span className="tabular">
            {questsDone}/{quests.length}
          </span>
        </button>
      </div>

      <Sheet open={open === 'streak'} onClose={close} title="Your streak">
        <div className="flex flex-col items-center gap-1 pb-4 text-center">
          <Icon name="flame" size={56} className={`text-flame ${streak.todayDone ? 'animate-flame' : ''}`} />
          <p className="num-display text-5xl">{streak.current}</p>
          <p className="text-sm font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">
            {unit} streak
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-3">
          <div className="card p-3 text-center">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">Longest</dt>
            <dd className="tabular font-display text-2xl font-bold">{plural(streak.longest, unit)}</dd>
          </div>
          <div className="card p-3 text-center">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">
              This week
            </dt>
            <dd className="tabular font-display text-2xl font-bold">
              {streak.workoutsThisWeek} / {streak.weeklyGoal}
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-center text-sm font-semibold text-[var(--color-fg-muted)]">
          {streak.todayDone ? "You've trained today. Streak safe." : 'Train today to keep it alive.'}
        </p>
      </Sheet>

      <Sheet open={open === 'level'} onClose={close} title="Your level">
        <div className="flex flex-col items-center gap-2 pb-4 text-center">
          <span
            className="grid size-24 place-items-center rounded-full bg-xp-400 font-display text-4xl font-bold text-ink-950"
            style={{ boxShadow: '0 6px 0 var(--color-xp-600)' }}
          >
            {level.level}
          </span>
          <p className="mt-1 text-sm font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">Level</p>
        </div>
        <div
          role="progressbar"
          aria-label="Progress to next level"
          aria-valuemin={0}
          aria-valuemax={level.levelSize}
          aria-valuenow={level.xpIntoLevel}
          className="h-5 overflow-hidden rounded-full bg-[var(--color-surface-2)]"
        >
          <div
            className="animate-shine h-full rounded-full bg-xp-400"
            style={{ width: `${Math.round(level.progress * 100)}%` }}
          />
        </div>
        <p className="tabular mt-2 text-center text-sm font-semibold">
          {level.xpIntoLevel} / {level.levelSize} XP to Lv {level.level + 1}
        </p>
        <h3 className="mb-2 mt-5 text-sm font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">
          How to earn XP
        </h3>
        <ul className="flex flex-col gap-2 text-sm">
          {[
            ['Each set', XP_RULES.set],
            ['Each warm-up set', XP_RULES.warmup],
            ['Finish every set of an exercise', XP_RULES.exercise],
            ['Finish a workout', XP_RULES.finish],
            ['New personal record', XP_RULES.pr],
          ].map(([label, xp]) => (
            <li key={label} className="card flex min-h-11 items-center justify-between px-3">
              <span>{label}</span>
              <span className="tabular font-bold text-xp-400">+{xp} XP</span>
            </li>
          ))}
        </ul>
      </Sheet>

      <Sheet open={open === 'quests'} onClose={close} title="Daily quests">
        <QuestList quests={quests} />
        <p className="mt-4 text-center text-xs text-[var(--color-fg-muted)]">Resets at midnight.</p>
      </Sheet>
    </>
  )
}
