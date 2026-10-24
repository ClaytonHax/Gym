/**
 * Mirrors "an editable element is focused" onto <html data-editing> so CSS can
 * hide fixed bottom chrome while the on-screen keyboard is up.
 */
const EDITABLE = 'input:not([type=checkbox]):not([type=radio]):not([type=button]), textarea, select, [contenteditable="true"]'

export function trackEditingFocus() {
  const sync = () => {
    const el = document.activeElement
    const editing = el instanceof HTMLElement && el.matches(EDITABLE)
    document.documentElement.toggleAttribute('data-editing', editing)
  }
  document.addEventListener('focusin', sync)
  // activeElement is body mid-blur; defer so the next focusin wins.
  document.addEventListener('focusout', () => setTimeout(sync, 0))
}
