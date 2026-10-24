import { describe, expect, it } from 'vitest'
import { matchesDeletePhrase, partitionStarred, startDateFor } from './planUiLogic'

describe('startDateFor', () => {
  it('day 1 starts on the chosen date', () => {
    expect(startDateFor('2026-03-10', 0)).toBe('2026-03-10')
  })
  it('steps back one day per day index', () => {
    expect(startDateFor('2026-03-10', 2)).toBe('2026-03-08')
  })
  it('crosses month, year and DST boundaries', () => {
    expect(startDateFor('2026-03-02', 3)).toBe('2026-02-27')
    expect(startDateFor('2026-01-01', 1)).toBe('2025-12-31')
    expect(startDateFor('2026-03-09', 2)).toBe('2026-03-07')
    expect(startDateFor('2026-11-02', 2)).toBe('2026-10-31')
  })
})

describe('matchesDeletePhrase', () => {
  it('accepts the phrase regardless of case and padding', () => {
    expect(matchesDeletePhrase('delete my plan')).toBe(true)
    expect(matchesDeletePhrase('  Delete My Plan ')).toBe(true)
    expect(matchesDeletePhrase('DELETE  MY PLAN')).toBe(true)
  })
  it('rejects anything else', () => {
    expect(matchesDeletePhrase('')).toBe(false)
    expect(matchesDeletePhrase('delete my')).toBe(false)
    expect(matchesDeletePhrase('delete my plans')).toBe(false)
  })
})

const t = (n: number) => ({ toMillis: () => n })
const p = (name: string, o: { starred?: boolean; starOrder?: number; at?: number } = {}) => ({
  name,
  starred: o.starred,
  starOrder: o.starOrder,
  createdAt: t(o.at ?? 0),
  updatedAt: t(o.at ?? 0),
})

describe('partitionStarred', () => {
  it('only starred === true counts, sorted by starOrder then name', () => {
    const { starred } = partitionStarred([
      p('Zed', { starred: true }),
      p('B', { starred: true, starOrder: 2 }),
      p('A', { starred: true, starOrder: 2 }),
      p('First', { starred: true, starOrder: 1 }),
    ])
    expect(starred.map((x) => x.name)).toEqual(['First', 'A', 'B', 'Zed'])
  })
  it('puts the rest newest first and never leaks starred ones', () => {
    const { starred, others } = partitionStarred([
      p('old', { at: 1 }),
      p('new', { at: 9 }),
      p('no', { starred: false, at: 5 }),
      p('star', { starred: true, at: 7 }),
    ])
    expect(starred.map((x) => x.name)).toEqual(['star'])
    expect(others.map((x) => x.name)).toEqual(['new', 'no', 'old'])
  })
  it('an empty library yields no recommended section', () => {
    expect(partitionStarred([p('x')]).starred).toEqual([])
  })
})

describe('infoLine', () => {
  it('summarises the cycle', async () => {
    const { infoLine } = await import('./planUiLogic')
    const ex = { exerciseId: 'x', name: 'X', muscle: 'chest', tracksWeight: true, targets: ['8', '8', '8'], restSec: 75 }
    const days = [
      { id: 'a', kind: 'workout', name: 'Push', exercises: [ex] },
      { id: 'b', kind: 'rest', name: 'Rest', exercises: [] },
    ] as never
    expect(infoLine(days)).toBe('2-day cycle · 1 workouts · 1 rest · ~5 min')
  })
})
