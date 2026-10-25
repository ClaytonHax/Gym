import { describe, expect, it } from 'vitest'
import { nameKeys, searchText } from './social'

describe('name search keys', () => {
  it('matches the start of the full name and of each word', () => {
    const keys = nameKeys('Clayton Banks')
    for (const q of ['cl', 'clay', 'clayton', 'clayton b', 'clayton banks', 'ba', 'banks']) expect(keys).toContain(q)
    expect(keys).not.toContain('c')
    expect(keys).not.toContain('anks')
  })

  it('normalises case, accents and spacing the same way as the query', () => {
    expect(nameKeys('  José   Núñez ')).toContain(searchText('jose nu'))
    expect(searchText('@Jake ')).toBe('jake')
  })

  it('stays small enough to store', () => {
    expect(nameKeys('Bartholomew Montgomery-Fitzgerald Junior').length).toBeLessThanOrEqual(80)
    expect(nameKeys('')).toEqual([])
  })
})

describe('long names', () => {
  it('still finds a later word past the 20-character cap', () => {
    expect(nameKeys('Bartholomew Alexander Banks')).toContain('banks')
    expect(nameKeys('Bartholomew Alexander Banks')).toContain(searchText('Bartholomew Alexander Banks'))
  })
})
