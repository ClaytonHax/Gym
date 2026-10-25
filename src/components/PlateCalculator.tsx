import { useEffect, useState } from 'react'
import { Button, Sheet } from './ui'
import { useUnit } from '../contexts/SettingsContext'
import { ALL_PLATES, BAR_WEIGHTS, loadPlates, platesForSet, savePlates } from '../lib/plateSets'
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
  // Which plates this gym actually has; remembered per unit.
  const [plates, setPlates] = useState(() => loadPlates(unit))

  useEffect(() => {
    if (!open) return
    setTarget(initialKg > 0 ? String(Math.round(kgTo(unit, initialKg) * 100) / 100) : '')
    setBar(BAR_WEIGHTS[unit][0])
    setPlates(loadPlates(unit))
  }, [open, initialKg, unit])

  function togglePlate(p: number) {
    const next = plates.includes(p) ? plates.filter((x) => x !== p) : [...plates, p].sort((a, b) => b - a)
    // Never allow an empty rack: the calculator would have nothing to say.
    if (next.length === 0) return
    setPlates(next)
    savePlates(unit, next)
  }

  const n = Number(target)
  const result = n > bar ? platesForSet(n, bar, plates) : null

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Plate math"
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

        <p className="-mb-2 text-sm font-semibold">How heavy is the bar?</p>
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
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">
                Put this on each side of the bar
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
                <p className="mt-3 text-sm text-amber-400">
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

        <fieldset>
          <legend className="text-sm font-semibold">Plates my gym has</legend>
          <p className="mb-2 text-sm text-[var(--color-fg-muted)]">
            Untick any plate your gym doesn’t stock. We remember this next time.
          </p>
          <div className="flex flex-wrap gap-2">
            {ALL_PLATES[unit].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => togglePlate(p)}
                aria-pressed={plates.includes(p)}
                className={`tabular min-h-11 min-w-14 rounded-xl border px-3 text-sm font-semibold transition-colors duration-200 ${
                  plates.includes(p)
                    ? 'border-brand-500 bg-brand-500/15 text-brand-400'
                    : 'border-[var(--color-line)] text-[var(--color-fg-muted)] line-through'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
    </Sheet>
  )
}
