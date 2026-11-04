import { useState } from 'react'

export type RepsMode = 'fixed' | 'range' | 'failure'

export function repsMode(v: string): RepsMode {
  const t = v.trim().toLowerCase()
  if (t === 'failure') return 'failure'
  return t.includes('-') ? 'range' : 'fixed'
}

const REPS_MODES: Array<[RepsMode, string]> = [
  ['fixed', 'Fixed'],
  ['range', 'Range'],
  ['failure', 'Failure'],
]

const REPS_INPUT =
  'min-h-11 w-full rounded-lg border border-transparent bg-[var(--color-surface)] px-3 text-center text-base font-semibold outline-none focus:border-brand-500'

/** Three ways to set a rep target: one number, a low–high range, or to failure. */
export function RepsEditor({ name, value, onChange }: { name: string; value: string; onChange: (v: string) => void }) {
  const [mode, setMode] = useState<RepsMode>(() => repsMode(value))
  const [lo, hi] = value.split('-').map((x) => x.trim())
  const digits = (x: string) => x.replace(/\D/g, '').slice(0, 3)

  function pick(m: RepsMode) {
    setMode(m)
    const n = digits(lo ?? '')
    onChange(m === 'failure' ? 'failure' : m === 'range' ? `${n}-` : n)
  }

  return (
    <div className="mt-3">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">Reps</span>
      <div role="group" aria-label={`Rep type for ${name}`} className="mb-2 grid grid-cols-3 gap-1 rounded-lg bg-[var(--color-surface)] p-1">
        {REPS_MODES.map(([m, label]) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => pick(m)}
            className={`min-h-9 rounded-md text-sm font-semibold ${
              mode === m ? 'bg-brand-500 text-white' : 'text-[var(--color-fg-muted)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === 'fixed' ? (
        <input
          inputMode="numeric"
          value={mode === 'fixed' ? digits(value) : ''}
          onChange={(e) => onChange(digits(e.target.value))}
          placeholder="10"
          aria-label={`Reps for ${name}`}
          className={REPS_INPUT}
        />
      ) : mode === 'range' ? (
        <div className="flex items-center gap-2">
          <input
            inputMode="numeric"
            value={digits(lo ?? '')}
            onChange={(e) => onChange(`${digits(e.target.value)}-${digits(hi ?? '')}`)}
            placeholder="8"
            aria-label={`Minimum reps for ${name}`}
            className={REPS_INPUT}
          />
          <span className="font-semibold text-[var(--color-fg-muted)]">–</span>
          <input
            inputMode="numeric"
            value={digits(hi ?? '')}
            onChange={(e) => onChange(`${digits(lo ?? '')}-${digits(e.target.value)}`)}
            placeholder="12"
            aria-label={`Maximum reps for ${name}`}
            className={REPS_INPUT}
          />
        </div>
      ) : (
        <p className="min-h-11 rounded-lg bg-[var(--color-surface)] px-3 py-2.5 text-center text-base font-semibold">
          To failure
        </p>
      )}
    </div>
  )
}

