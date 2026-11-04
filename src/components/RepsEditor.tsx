export type RepsMode = 'fixed' | 'range' | 'failure'

export function repsMode(v: string): RepsMode {
  const t = v.trim().toLowerCase()
  if (t === 'failure') return 'failure'
  return t.includes('-') ? 'range' : 'fixed'
}

const PRESETS = ['5', '8', '10', '12', '15', '6-8', '8-12', '10-15', '12-15', 'failure']

const REPS_INPUT =
  'min-h-11 w-full rounded-lg border border-transparent bg-[var(--color-surface)] px-3 text-center text-base font-semibold outline-none focus:border-brand-500'

const digits = (x: string) => x.replace(/\D/g, '').slice(0, 3)

function chipLabel(p: string): string {
  return p === 'failure' ? 'To failure' : p.replace('-', '–')
}

/** Rep target picker: preset chips for the usual numbers, plus a custom min/max pair. */
export function RepsEditor({ name, value, onChange }: { name: string; value: string; onChange: (v: string) => void }) {
  const failure = repsMode(value) === 'failure'
  const [lo = '', hi = ''] = failure ? [] : value.split('-').map((x) => digits(x.trim()))
  const current = value.trim().toLowerCase()

  // Only a min makes a fixed target; a half-typed range collapses to its min.
  function emit(nextLo: string, nextHi: string) {
    // A max with no min would store "-12"; treat it as a fixed target instead.
    onChange(nextLo && nextHi ? `${nextLo}-${nextHi}` : nextLo || nextHi)
  }

  return (
    <div>
      <div role="group" aria-label={`Rep target for ${name}`} className="flex flex-wrap gap-2">
        {PRESETS.map((p) => {
          const on = current === p
          return (
            <button
              key={p}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(p)}
              className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors duration-200 motion-reduce:transition-none ${
                on
                  ? 'border-brand-500 bg-brand-500 text-ink-950'
                  : 'border-[var(--color-line)] bg-[var(--color-surface-2)]'
              }`}
            >
              {chipLabel(p)}
            </button>
          )
        })}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="w-16 shrink-0 text-xs font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">Custom</span>
        <input
          inputMode="numeric"
          value={lo}
          onChange={(e) => emit(digits(e.target.value), hi)}
          placeholder="min"
          aria-label={`Minimum reps for ${name}`}
          className={REPS_INPUT}
        />
        <span className="font-semibold text-[var(--color-fg-muted)]">&ndash;</span>
        <input
          inputMode="numeric"
          value={hi}
          onChange={(e) => emit(lo, digits(e.target.value))}
          placeholder="max (optional)"
          aria-label={`Maximum reps for ${name}`}
          className={REPS_INPUT}
        />
      </div>
    </div>
  )
}
