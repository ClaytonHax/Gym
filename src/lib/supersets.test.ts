import { describe, expect, it } from 'vitest'
import { linkedToNext, moveItem, tidySupersets, toggleSupersetWithNext } from './supersets'

const ids = (xs: { supersetId?: string }[]) => xs.map((x) => x.supersetId ?? '-')
let n = 0
const fresh = () => `s${++n}`

describe('supersets', () => {
  it('joins and splits neighbours', () => {
    n = 0
    const list = [{}, {}, {}]
    const joined = toggleSupersetWithNext(list, 0, fresh)
    expect(ids(joined)).toEqual(['s1', 's1', '-'])
    const three = toggleSupersetWithNext(joined, 1, fresh)
    expect(ids(three)).toEqual(['s1', 's1', 's1'])
    // Breaking the first link leaves the first item on its own, so it loses its id.
    const split = toggleSupersetWithNext(three, 0, fresh)
    expect(ids(split)).toEqual(['-', 's2', 's2'])
    expect(linkedToNext(split, 1)).toBe(true)
  })

  it('drops a superset that a move broke up', () => {
    const list = [{ supersetId: 'a' }, { supersetId: 'a' }, {}]
    expect(ids(moveItem(list, 0, 2))).toEqual(['-', '-', '-'])
    expect(ids(moveItem(list, 2, 0))).toEqual(['-', 'a', 'a'])
  })

  it('keeps untouched items identical', () => {
    const a = { supersetId: 'x' }
    const b = { supersetId: 'x' }
    const out = tidySupersets([a, b, {}])
    expect(out[0]).toBe(a)
  })
})
