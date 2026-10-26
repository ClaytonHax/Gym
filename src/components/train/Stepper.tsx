import { useEffect, useState, type KeyboardEvent } from 'react'

/** Two decimals max, so float noise (0.1 + 0.2) never reaches the screen. */
const round2 = (n: number) => Math.round(n * 100) / 100

/** 62.5 and 60, never 62.50 or 60.00. */
const fmt = (n: number) => String(round2(n))

/** Empty or half-typed text ("", ".") counts as 0 rather than NaN. */
const parse = (text: string) => {
  const n = Number(text)
  return Number.isFinite(n) ? n : 0
}

/** Digits only, plus one '.' when decimals. A ',' is read as '.'. */
const sanitize = (raw: string, decimals: boolean) => {
  if (!decimals) return raw.replace(/\D/g, '')
  const [whole, ...rest] = raw.replace(/,/g, '.').replace(/[^\d.]/g, '').split('.')
  return rest.length ? `${whole}.${rest.join('')}` : whole
}

/**
 * Big number in a plain, always-visible text box. Used for weight (decimals) and
 * reps (whole numbers). There are no − / + buttons: on phones they covered the
 * digits. `step` is still accepted so callers don't change, but it is ignored.
 */
export function Stepper({
  label,
  value,
  suggested = false,
  min = 0,
  decimals = false,
  onChange,
  ariaLabel,
}: {
  label: string
  value: number
  /** A suggestion the person hasn't confirmed yet: shown as a muted, italic placeholder. */
  suggested?: boolean
  /** Unused. Kept so existing callers still compile. */
  step?: number
  min?: number
  /** Allow fractional values (weight) rather than whole numbers (reps). */
  decimals?: boolean
  onChange: (n: number) => void
  ariaLabel: string
}) {
  // What's typed is kept locally so a half-typed "62." isn't mangled by the round trip through `value`.
  const [text, setText] = useState(suggested ? '' : fmt(value))

  // Re-sync only when the stored value genuinely differs from what's typed,
  // e.g. a unit switch, "copy last time", or the suggestion changing.
  useEffect(() => {
    setText((prev) => {
      if (parse(prev) === value) return prev
      return suggested ? '' : fmt(value)
    })
  }, [value, suggested])

  const clamp = (n: number) => {
    const rounded = decimals ? round2(n) : Math.round(n)
    return Math.max(min, rounded)
  }

  const onInput = (raw: string) => {
    const clean = sanitize(raw, decimals)
    setText(clean)
    onChange(clamp(parse(clean)))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur()
  }

  return (
    <div className="flex flex-col items-center rounded-2xl bg-[var(--color-surface-2)] p-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">
        {label}
      </span>
      <input
        type="text"
        inputMode={decimals ? 'decimal' : 'numeric'}
        enterKeyHint="done"
        aria-label={ariaLabel}
        value={text}
        placeholder={suggested ? fmt(value) : undefined}
        onChange={(e) => onInput(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={onKeyDown}
        className="num-display tabular mt-1 min-h-16 w-full scroll-my-40 rounded-xl border-2 border-transparent bg-[var(--color-surface)] px-1 text-center text-4xl text-[var(--color-fg)] outline-none focus:border-brand-500 placeholder:italic placeholder:text-[var(--color-fg-muted)]"
      />
    </div>
  )
}
