import { fmtExact, toKg } from './units'
import { describe, expect, it } from 'vitest'
import { assistedPatch, effectiveKg, isAssisted, settleAssisted } from './assisted'
import { estimate1rm, volumeOf } from './stats'
import { shownValues } from '../components/train/setValues'
import type { WorkoutExercise, WorkoutSet } from '../types'

const set = (o: Partial<WorkoutSet> = {}): WorkoutSet => ({ weightKg: 0, reps: 0, done: false, ...o })
const ex = (sets: WorkoutSet[], id = 'assisted-pull-up'): WorkoutExercise =>
  ({ exerciseId: id, name: 'X', muscle: 'Back', tracksWeight: true, sets }) as WorkoutExercise

describe('assisted maths', () => {
  it('identifies by id', () => {
    expect(isAssisted({ exerciseId: 'assisted-pull-up' })).toBe(true)
    expect(isAssisted({ exerciseId: 'pull-up' })).toBe(false)
    expect(isAssisted({})).toBe(false)
  })
  it('effectiveKg clamps at zero', () => {
    expect(effectiveKg(80, 30)).toBe(50)
    expect(effectiveKg(80, 80)).toBe(0)
    expect(effectiveKg(80, 100)).toBe(0)
  })
  it('builds the patch', () => {
    expect(assistedPatch(80, 30)).toEqual({ assistKg: 30, bodyweightKg: 80, weightKg: 50 })
  })
})

describe('settleAssisted', () => {
  it('fills missing body weight on done sets and defaults assist to 0', () => {
    const out = settleAssisted([ex([set({ done: true, reps: 5, assistKg: 20 }), set({ done: true, reps: 5 })])], 80)
    expect(out[0].sets[0]).toMatchObject({ assistKg: 20, bodyweightKg: 80, weightKg: 60 })
    expect(out[0].sets[1]).toMatchObject({ assistKg: 0, bodyweightKg: 80, weightKg: 80 })
  })
  it('leaves frozen sets and undone sets alone', () => {
    const frozen = set({ done: true, reps: 5, assistKg: 20, bodyweightKg: 90, weightKg: 70 })
    const open = set({ reps: 5 })
    const input = [ex([frozen, open])]
    expect(settleAssisted(input, 80)).toBe(input)
  })
  it('is a no-op with unknown body weight', () => {
    const input = [ex([set({ done: true, reps: 5 })])]
    expect(settleAssisted(input, null)).toBe(input)
  })
  it('ignores other exercises', () => {
    const input = [ex([set({ done: true, reps: 5, weightKg: 40 })], 'pull-up')]
    expect(settleAssisted(input, 80)).toBe(input)
  })
})

describe('shownValues for assisted', () => {
  it('keeps a typed 0 assist instead of using the suggestion', () => {
    const e = ex([set({ assistKg: 0, reps: 5 })])
    const v = shownValues(e, 0, [{ weightKg: 50, reps: 8, assistKg: 30 }], 80)
    expect(v.assistKg).toBe(0)
    expect(v.assistSuggested).toBe(false)
    expect(v.weightKg).toBe(80)
  })
  it('carries the suggested assist and flags it', () => {
    const e = ex([set()])
    const v = shownValues(e, 0, [{ weightKg: 50, reps: 8, assistKg: 30 }], 80)
    expect(v).toMatchObject({ assistKg: 30, assistSuggested: true, weightKg: 50, reps: 8, bodyKg: 80 })
  })
  it('gives weight 0 when body weight is unknown', () => {
    const v = shownValues(ex([set({ assistKg: 20 })]), 0, undefined, null)
    expect(v.weightKg).toBe(0)
    expect(v.bodyKg).toBeNull()
  })
  it('uses the frozen body weight on a done set', () => {
    const e = ex([set({ done: true, reps: 6, assistKg: 20, bodyweightKg: 90, weightKg: 70 })])
    const v = shownValues(e, 0, undefined, 75)
    expect(v.bodyKg).toBe(90)
    expect(v.weightKg).toBe(70)
  })
})

describe('stats read the effective weight', () => {
  it('volume and e1RM use weightKg', () => {
    const s = set({ done: true, reps: 8, ...assistedPatch(80, 30) })
    expect(volumeOf([ex([s])])).toBe(50 * 8)
    expect(estimate1rm(s.weightKg, s.reps)).toBe(estimate1rm(50, 8))
  })
})

describe('fmtExact', () => {
  it('keeps the maths on screen adding up', () => {
    expect(fmtExact(90.95, 'kg')).toBe('90.95 kg')
    expect(fmtExact(effectiveKg(90.95, 40), 'kg')).toBe('50.95 kg')
    expect(fmtExact(40, 'kg', false)).toBe('40')
  })
  it('reads a weight typed in lb back exactly', () => {
    expect(fmtExact(toKg('lb', 200), 'lb')).toBe('200 lb')
    expect(fmtExact(effectiveKg(toKg('lb', 200), toKg('lb', 65)), 'lb')).toBe('135 lb')
  })
})
