import { useEffect, useState } from 'react'
import { Button, Sheet } from './ui'
import { useUnit } from '../contexts/SettingsContext'
import { BAR_WEIGHTS, platesFor } from '../lib/plates'
import { kgTo } from '../lib/units'

/** "What do I put on the bar?" — plates per side for a target load. */
export function PlateCalculator({
  open,
  onClose,
  initialKg,
}: {
  open: boolean
  onClose: () => void
  initialKg: number
}) {
  const unit = useUnit()
  const [target, setTarget] = useState('')
  const [bar, setBar] = useState(BAR_WEIGHTS[unit][0])

  useEffect(() => {
    if (!open) return
    setTarget(initialKg > 0 ? String(Math.round(kgTo(unit, initialKg) * 100) / 100) : '')
    setBar(BAR_WEIGHTS[unit][0])
  }, [open, initialKg, unit])

  const n = Number(target)
  const result = n > bar ? platesFor(n, bar, unit) : null

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Plate calculator"
      footer={
        <Button full onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Target weight ({unit})
          <input
            type="number"
            inputMode="decimal"
            enterKeyHint="done"
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="tabular min-h-12 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 text-lg font-semibold outline-none focus:border-brand-500"
          />
        </label>

        <div role="group" aria-label="Bar weight" className="flex gap-2">
          {BAR_WEIGHTS[unit].map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setBar(w)}
              aria-pressed={bar === w}
              className={`tabular min-h-11 flex-1 rounded-xl border text-sm font-semibold transition-colors duration-200 ${
                bar === w
                  ? 'border-brand-500 bg-brand-500/15 text-brand-400'
                  : 'border-[var(--color-line)] text-[var(--color-fg-muted)]'
              }`}
            >
              {w} {unit} bar
            </button>
          ))}
        </div>

        <div className="rounded-xl bg-[var(--color-surface-2)] p-4" aria-live="polite">
          {result ? (
            <>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">
                Each side
              </p>
              {result.perSide.length === 0 ? (
                <p className="text-sm text-[var(--color-fg-muted)]">Just the bar.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {result.perSide.map(({ plate, count }) => (
                    <li
                      key={plate}
                      className="tabular rounded-lg bg-brand-500/15 px-3 py-1.5 font-display text-lg font-semibold text-brand-400"
                    >
                      {count} × {plate}
                    </li>
                  ))}
                </ul>
              )}
              {result.remainder > 0 ? (
                <p className="mt-3 text-xs text-amber-400">
                  Closest loadable weight is {result.achieved} {unit} — {result.remainder} {unit}{' '}
                  short of the target.
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-[var(--color-fg-muted)]">
              Enter a weight above the {bar} {unit} bar.
            </p>
          )}
        </div>
      </div>
    </Sheet>
  )
}
