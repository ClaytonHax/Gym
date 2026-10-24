import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUpdateScheduler, IDLE_MS } from './swUpdate'

let sched: ReturnType<typeof createUpdateScheduler>

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  sched?.stop()
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('update scheduler', () => {
  it('applies only after 5s idle', () => {
    const apply = vi.fn()
    sched = createUpdateScheduler(apply)
    sched.notify()
    vi.advanceTimersByTime(IDLE_MS - 1)
    expect(apply).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('resets the timer on interaction', () => {
    const apply = vi.fn()
    sched = createUpdateScheduler(apply)
    sched.notify()
    vi.advanceTimersByTime(3000)
    window.dispatchEvent(new Event('input'))
    vi.advanceTimersByTime(3000)
    expect(apply).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2000)
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('does not apply while an input is focused, then applies after blur + idle', () => {
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    const apply = vi.fn()
    sched = createUpdateScheduler(apply)
    sched.notify()
    vi.advanceTimersByTime(IDLE_MS * 3)
    expect(apply).not.toHaveBeenCalled()
    input.blur()
    vi.advanceTimersByTime(IDLE_MS)
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('applies immediately when the page is hidden', () => {
    const apply = vi.fn()
    sched = createUpdateScheduler(apply)
    sched.notify()
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(apply).toHaveBeenCalledTimes(1)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })
})
