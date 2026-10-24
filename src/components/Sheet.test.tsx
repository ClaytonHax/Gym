import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useState } from 'react'
import { Sheet } from './ui'

function Harness() {
  const [text, setText] = useState('')
  // Inline arrow on purpose: re-created every render, like real callers.
  return (
    <Sheet open onClose={() => setText('')} title="Test">
      <input aria-label="q" value={text} onChange={(e) => setText(e.target.value)} />
    </Sheet>
  )
}

describe('Sheet', () => {
  afterEach(() => {
    cleanup()
    // @ts-expect-error test cleanup
    delete window.visualViewport
  })

  it('keeps focus on an input while typing with an inline onClose', async () => {
    render(<Harness />)
    const input = screen.getByLabelText('q') as HTMLInputElement
    input.focus()
    for (const v of ['a', 'ab', 'abc', 'abcd']) {
      fireEvent.change(input, { target: { value: v } })
      // let any effect-scheduled rAF focus run
      await act(() => new Promise((r) => setTimeout(r, 40)))
      expect(document.activeElement).toBe(input)
    }
    expect(input.value).toBe('abcd')
  })

  it('constrains the overlay to the visual viewport', () => {
    const vv = Object.assign(new EventTarget(), { height: 800, offsetTop: 0 })
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
    render(
      <Sheet open onClose={() => {}} title="T">
        <p>body</p>
      </Sheet>
    )
    const overlay = screen.getByRole('dialog').parentElement as HTMLElement
    expect(overlay.style.height).toBe('800px')
    act(() => {
      vv.height = 400
      vv.offsetTop = 0
      vv.dispatchEvent(new Event('resize'))
    })
    expect(overlay.style.height).toBe('400px')
    expect(overlay.style.top).toBe('0px')
    act(() => {
      vv.offsetTop = 30
      vv.dispatchEvent(new Event('scroll'))
    })
    expect(overlay.style.top).toBe('30px')
  })

  it('falls back to a full-screen overlay without visualViewport', () => {
    render(
      <Sheet open onClose={() => {}} title="T">
        <p>body</p>
      </Sheet>
    )
    const overlay = screen.getByRole('dialog').parentElement as HTMLElement
    expect(overlay.style.bottom).toBe('0px')
  })
})
