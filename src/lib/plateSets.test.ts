import { describe, expect, it } from 'vitest'
import { DEFAULT_PLATES, platesForSet } from './plateSets'

describe('platesForSet', () => {
  it('matches the classic breakdown with the default set', () => {
    const r = platesForSet(100, 20, DEFAULT_PLATES.kg)
    expect(r.perSide).toEqual([{ plate: 25, count: 1 }, { plate: 15, count: 1 }])
    expect(r.remainder).toBe(0)
  })

  it('works around plates the gym does not have', () => {
    const r = platesForSet(100, 20, [20, 10, 5])
    expect(r.perSide).toEqual([{ plate: 20, count: 2 }])
    expect(r.achieved).toBe(100)
  })

  it('reports what is short when the plates cannot make the weight', () => {
    const r = platesForSet(62.5, 20, [20])
    expect(r.achieved).toBe(60)
    expect(r.remainder).toBe(2.5)
  })
})
