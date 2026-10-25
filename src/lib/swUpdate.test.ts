import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyUpdate, BOOT_MS, registerApply, setUpdateAvailable, subscribeUpdate, updateAction } from './swUpdate'

afterEach(() => {
  setUpdateAvailable(false)
  document.body.innerHTML = ''
})

describe('update flow', () => {
  it('applies immediately when found right at startup', () => {
    expect(updateAction(500, false)).toBe('apply')
    expect(updateAction(BOOT_MS - 1, false)).toBe('apply')
  })

  it('prompts when found mid-session', () => {
    expect(updateAction(BOOT_MS, false)).toBe('prompt')
    expect(updateAction(60_000, false)).toBe('prompt')
  })

  it('prompts instead of reloading if the user is already typing at startup', () => {
    expect(updateAction(500, true)).toBe('prompt')
  })

  it('notifies subscribers and replays the current state', () => {
    const seen: boolean[] = []
    const off = subscribeUpdate((v) => seen.push(v))
    setUpdateAvailable(true)
    off()
    setUpdateAvailable(false)
    expect(seen).toEqual([false, true])
    const late = vi.fn()
    setUpdateAvailable(true)
    subscribeUpdate(late)()
    expect(late).toHaveBeenCalledWith(true)
  })

  it('applyUpdate calls the registered activator', () => {
    const fn = vi.fn()
    registerApply(fn)
    applyUpdate()
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
