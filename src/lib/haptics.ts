// Set from the profile's "Vibration feedback" setting (missing = on).
let enabled = true

export function setHapticsEnabled(on: boolean): void {
  enabled = on
}

/** A short buzz for taps and logged sets. Silently does nothing where unsupported. */
export function haptic(pattern: number | number[] = 12): void {
  if (!enabled) return
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // Some browsers throw outside a user gesture; feedback is a nicety.
  }
}
