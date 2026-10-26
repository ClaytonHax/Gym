import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../Icon'
import { Spinner } from '../ui'
import { Toggle } from '../ui'
import { Confetti } from './Celebrate'
import { haptic } from '../../lib/haptics'
import { fmtMinutes } from '../../lib/workoutExercise'
import { XP_RULES, type LevelInfo } from '../../lib/xp'
import type { Quest } from '../../lib/quests'

export interface FinishFlowProps {
  open: boolean
  onClose: () => void
  onSave: () => void
  saving: boolean
  saveError: string | null
  stats: {
    durationSec: number
    sets: number
    volumeLabel: string
    kcal: number
    usingDefaultWeight: boolean
    defaultWeightKg: number
  }
  xp: { session: number; prs: number; levelBefore: LevelInfo; levelAfter: LevelInfo }
  streak: { current: number; unit: 'day' | 'week'; extends: boolean }
  quests: Quest[]
  proofBattles: Array<{ id: string; title: string }>
  proofSlot: ReactNode
  saveAsRoutine: boolean
  onSaveAsRoutine: (b: boolean) => void
}

const COUNT_MS = 900
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/** Counts 0 -> target with an ease-out curve; jumps straight there for reduced motion. */
function useCountUp(target: number, run: boolean): number {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!run) return
    if (reducedMotion()) {
      setValue(target)
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_MS)
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, run])
  return value
}

/** Staggered entrance; the delay is skipped under reduced motion via CSS or the check below. */
function rise(delayMs: number): { className: string; style: CSSProperties } {
  return {
    className: 'animate-rise',
    style: { animationDelay: `${delayMs}ms`, animationFillMode: 'backwards' },
  }
}

function StatTile({
  label,
  value,
  color,
  delay,
}: {
  label: string
  value: string
  color: string
  delay: number
}) {
  const r = rise(delay)
  return (
    <div
      className={`${r.className} min-w-0 overflow-hidden rounded-2xl border-2 bg-[var(--color-surface)]`}
      style={{ ...r.style, borderColor: color }}
    >
      <div
        className="px-1 py-1 text-center text-xs font-bold uppercase tracking-wider text-[var(--color-ink-950)]"
        style={{ background: color }}
      >
        {label}
      </div>
      <div className="num-display tabular truncate px-1 py-3 text-center text-3xl" style={{ color }}>
        {value}
      </div>
    </div>
  )
}

function QuestRow({ quest }: { quest: Quest }) {
  const pct = Math.min(100, Math.round((quest.progress / Math.max(1, quest.target)) * 100))
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-[var(--color-surface-2)] p-3">
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
          quest.done ? 'bg-go-500 text-[var(--color-ink-950)]' : 'bg-[var(--color-surface)] text-xp-400'
        }`}
      >
        <Icon name={quest.icon} size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-semibold">{quest.label}</span>
          <span className="tabular shrink-0 text-xs font-bold text-[var(--color-fg-muted)]">
            {Math.min(quest.progress, quest.target)} / {quest.target}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={quest.label}
          aria-valuemin={0}
          aria-valuemax={quest.target}
          aria-valuenow={Math.min(quest.progress, quest.target)}
          className="mt-1.5 h-3 overflow-hidden rounded-full bg-[var(--color-surface)]"
        >
          <div
            className={`h-full rounded-full ${quest.done ? 'bg-go-500' : 'bg-xp-400'}`}
            style={{ width: `${pct}%`, transition: 'width 700ms ease-out' }}
          />
        </div>
      </div>
      {quest.done ? (
        <span
          aria-label="Done"
          className="animate-pop flex size-7 shrink-0 items-center justify-center rounded-full bg-go-500 text-[var(--color-ink-950)]"
        >
          <Icon name="check" size={16} />
        </span>
      ) : null}
    </li>
  )
}

export function FinishFlow({
  open,
  onClose,
  onSave,
  saving,
  saveError,
  stats,
  xp,
  streak,
  quests,
  proofBattles,
  proofSlot,
  saveAsRoutine,
  onSaveAsRoutine,
}: FinishFlowProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const [burst, setBurst] = useState(0)
  const xpShown = useCountUp(xp.session, open)

  // Trigger the celebration each time the flow opens.
  useEffect(() => {
    if (!open) return
    setBurst((b) => b + 1)
    haptic([30, 40, 30])
  }, [open])

  // Focus trap, Escape, scroll lock, and focus restore on close.
  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const items = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    const raf = requestAnimationFrame(() => dialogRef.current?.focus({ preventScroll: true }))

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      previouslyFocused?.focus?.({ preventScroll: true })
    }
  }, [open])

  if (!open) return null

  const leveledUp = xp.levelAfter.level > xp.levelBefore.level
  const streakUnit = streak.unit === 'week' ? 'week' : 'day'
  const barPct = Math.round(Math.min(1, Math.max(0, xp.levelAfter.progress)) * 100)
  const showStreak = streak.current > 0

  // Stagger sections; each gets a later delay than the one before.
  let step = 0
  const next = () => 250 * step++
  const headerDelay = next()
  const tilesDelay = next()
  const secondaryDelay = next()
  const levelDelay = next()
  const streakDelay = showStreak ? next() : 0
  const questDelay = quests.length > 0 ? next() : 0
  const optionsDelay = next()

  const header = rise(headerDelay)
  const secondary = rise(secondaryDelay)
  const level = rise(levelDelay)
  const streakAnim = rise(streakDelay)
  const questAnim = rise(questDelay)
  const options = rise(optionsDelay)

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col bg-[var(--color-canvas)] text-[var(--color-fg)] outline-none"
    >
      <Confetti burstKey={burst} intensity="big" />
      <div className="safe-top min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 pb-8 pt-8">
          <div className={`${header.className} flex flex-col items-center text-center`} style={header.style}>
            <div
              className="flex size-28 items-center justify-center rounded-full bg-xp-400 text-[var(--color-ink-950)]"
              style={{ boxShadow: '0 0 0 10px color-mix(in srgb, var(--color-xp-400) 20%, transparent), 0 0 48px 8px color-mix(in srgb, var(--color-xp-400) 45%, transparent)' }}
            >
              <Icon name="trophy" size={56} />
            </div>
            <h2 id={titleId} className="mt-6 font-display text-3xl font-bold leading-tight">
              Workout complete!
            </h2>
            <p className="mt-1 text-[var(--color-fg-muted)]">Nice work. Here’s how it went.</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <StatTile label="Total XP" value={`+${xpShown}`} color="var(--color-xp-400)" delay={tilesDelay} />
            <StatTile label="Time" value={fmtMinutes(stats.durationSec)} color="var(--color-rest)" delay={tilesDelay + 80} />
            <StatTile label="Lifted" value={stats.volumeLabel} color="var(--color-go-500)" delay={tilesDelay + 160} />
          </div>

          <div className={secondary.className} style={secondary.style}>
            <dl className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-2xl bg-[var(--color-surface-2)] p-3">
                <dt className="text-xs font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">Sets done</dt>
                <dd className="tabular mt-1 font-display text-xl font-semibold">{stats.sets}</dd>
              </div>
              <div className="rounded-2xl bg-[var(--color-surface-2)] p-3">
                <dt className="text-xs font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">Energy burned</dt>
                <dd className="tabular mt-1 font-display text-xl font-semibold">~{stats.kcal} kcal</dd>
              </div>
            </dl>
            <p className="mt-2 text-center text-sm text-[var(--color-fg-muted)]">
              Energy is an estimate.
              {stats.usingDefaultWeight
                ? ` Based on ${stats.defaultWeightKg} kg. Add your weight in Body for a better estimate.`
                : ''}
            </p>
            {xp.prs > 0 ? (
              <p className="mt-2 flex items-center justify-center gap-2 text-sm font-semibold text-xp-400">
                <Icon name="trophy" size={16} />
                {xp.prs} new {xp.prs === 1 ? 'record' : 'records'} (+{xp.prs * XP_RULES.pr} XP)
              </p>
            ) : null}
          </div>

          <div className={`${level.className} flex flex-col gap-3`} style={level.style}>
            {leveledUp ? (
              <div className="animate-pop flex flex-col items-center gap-1 rounded-2xl border-2 border-xp-400 bg-[var(--color-surface)] p-4 text-center">
                <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-xp-400">
                  <Icon name="sparkles" size={16} />
                  Level up!
                </span>
                <span className="num-display text-4xl text-xp-400">Level {xp.levelAfter.level}</span>
              </div>
            ) : null}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-sm font-bold">
                <span>Lv {xp.levelAfter.level}</span>
                <span className="tabular text-[var(--color-fg-muted)]">
                  {xp.levelAfter.xpIntoLevel} / {xp.levelAfter.levelSize} XP
                </span>
                <span className="text-[var(--color-fg-muted)]">Lv {xp.levelAfter.level + 1}</span>
              </div>
              <div
                role="progressbar"
                aria-label={`Progress to level ${xp.levelAfter.level + 1}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={barPct}
                className="h-4 overflow-hidden rounded-full bg-[var(--color-surface-2)]"
              >
                <div
                  className="animate-shine h-full rounded-full bg-xp-400"
                  style={{ width: `${barPct}%`, transition: 'width 900ms ease-out' }}
                />
              </div>
            </div>
          </div>

          {showStreak ? (
            <div
              className={`${streakAnim.className} flex items-center gap-4 rounded-2xl border-2 border-brand-500 bg-[var(--color-surface)] p-4`}
              style={streakAnim.style}
            >
              <span className="animate-flame flex size-14 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-500">
                <Icon name="flame" size={32} />
              </span>
              <div className="min-w-0">
                <p className="num-display text-2xl">
                  {streak.current} {streakUnit} streak
                </p>
                {streak.extends ? (
                  <span className="animate-pop mt-1 inline-block rounded-full bg-brand-500 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-[var(--color-ink-950)]">
                    Streak extended!
                  </span>
                ) : (
                  <p className="text-sm text-[var(--color-fg-muted)]">Keep it going.</p>
                )}
              </div>
            </div>
          ) : null}

          {quests.length > 0 ? (
            <section className={questAnim.className} style={questAnim.style} aria-label="Daily quests">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">
                Daily quests
              </h3>
              <ul className="flex flex-col gap-2">
                {quests.map((q) => (
                  <QuestRow key={q.id} quest={q} />
                ))}
              </ul>
            </section>
          ) : null}

          <div className={`${options.className} flex flex-col gap-4`} style={options.style}>
            {proofBattles.length > 0 ? (
              <div className="rounded-2xl border border-[var(--color-line)] p-3">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Icon name="camera" size={16} className="text-go-400" />
                  Add proof for {proofBattles.length} {proofBattles.length === 1 ? 'battle' : 'battles'}
                </p>
                <p className="mb-3 mt-0.5 text-sm text-[var(--color-fg-muted)]">
                  {proofBattles.map((c) => c.title).join(' · ')}. Without a photo this workout won’t count there.
                </p>
                {proofSlot}
              </div>
            ) : null}
            <Toggle
              checked={saveAsRoutine}
              onChange={onSaveAsRoutine}
              label="Save this workout to reuse later"
              description="It will show up under My routines on the Train tab."
            />
            {saveError ? (
              <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">
                {saveError}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="safe-bottom border-t border-[var(--color-line)] bg-[var(--color-canvas)] px-4 pb-3 pt-3">
        <div className="mx-auto flex w-full max-w-md flex-col items-stretch gap-1">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="btn-3d btn-3d-go flex min-h-14 w-full items-center justify-center gap-2 text-lg"
          >
            {saving ? <Spinner size={22} /> : null}
            {saveError ? 'TRY AGAIN' : 'SAVE WORKOUT'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl text-sm font-semibold text-[var(--color-fg-muted)]"
          >
            Keep going
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
