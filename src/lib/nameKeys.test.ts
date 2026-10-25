import { describe, expect, it } from 'vitest'
import { nameKeys, rankSearch, searchText } from './social'

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

describe('rankSearch', () => {
  const p = (uid: string, username: string, displayName: string) => ({ uid, username, displayName, freeChange: false })
  const jason = p('j', 'thebiggestlamb', 'Jason Lamb')
  const others = [p('a', 'lambo', 'Andy Car'), p('b', 'bob', 'Bob Jones')]

  it('finds by full name, any word, or the middle of a handle', () => {
    for (const q of ['jason lamb', 'Jason', 'lamb', 'biggest', '@thebiggest', 'Lamb Jason']) {
      expect(rankSearch([jason, ...others], q).map((x) => x.uid)).toContain('j')
    }
    expect(rankSearch([jason, ...others], 'jason jones')).toEqual([])
  })

  it('puts handle prefix matches first', () => {
    expect(rankSearch([jason, ...others], 'lamb').map((x) => x.uid)).toEqual(['a', 'j'])
  })
})
