import { expect, it } from 'vitest'
import { stripUndefined } from './clean'

it('drops undefined and non-finite values at any depth', () => {
  const input = {
    a: 1,
    b: undefined,
    c: { d: undefined, e: 'x', f: Number.NaN },
    g: [{ h: undefined, i: 2 }],
  }
  expect(stripUndefined(input)).toEqual({ a: 1, c: { e: 'x' }, g: [{ i: 2 }] })
})
