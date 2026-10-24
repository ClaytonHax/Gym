import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, it } from 'vitest'
import { Toggle } from './ui'

afterEach(cleanup)

function Harness() {
  const [on, setOn] = useState(false)
  return <Toggle checked={on} onChange={setOn} label="Sound" description="Beep" />
}

it('toggles aria-checked on click', () => {
  render(<Harness />)
  const sw = screen.getByRole('switch', { name: 'Sound' })
  expect(sw.getAttribute('aria-checked')).toBe('false')
  fireEvent.click(sw)
  expect(sw.getAttribute('aria-checked')).toBe('true')
  fireEvent.click(sw)
  expect(sw.getAttribute('aria-checked')).toBe('false')
})
