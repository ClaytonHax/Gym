import { describe, expect, it } from 'vitest'
import { fmtDuration, fmtTargetDuration, parseDuration } from './logMode'
import { estimateMinutes, exerciseTargetLabel, setCountOf } from './plans'
import { fmtPace } from './units'
import type { PlanExercise } from '../types'

const timed: PlanExercise = {
  exerciseId: 'tm',
  name: 'Treadmill',
  muscle: 'Cardio',
  tracksWeight: false,
  logBy: 'time',
  targetDurationSec: 1200,
  targets: [],
  restSec: 120,
}
const lift: PlanExercise = {
  exerciseId: 'bp',
  name: 'Bench',
  muscle: 'Chest',
  tracksWeight: true,
  targets: ['8-12', '8-12', '8-12'],
  restSec: 90,
}

describe('parseDuration', () => {
  it('reads bare numbers as minutes', () => expect(parseDuration('25')).toBe(1500))
  it('reads mm:ss', () => expect(parseDuration('25:30')).toBe(1530))
  it('reads h:mm:ss', () => expect(parseDuration('1:02:30')).toBe(3750))
  it('rejects bad seconds', () => expect(parseDuration('1:75')).toBeNull())
  it('rejects empty and junk', () => {
    expect(parseDuration('')).toBeNull()
    expect(parseDuration('abc')).toBeNull()
  })
})

describe('formatting', () => {
  it('fmtDuration', () => {
    expect(fmtDuration(1500)).toBe('25:00')
    expect(fmtDuration(3750)).toBe('1:02:30')
    expect(fmtDuration(5)).toBe('0:05')
  })
  it('fmtTargetDuration', () => {
    expect(fmtTargetDuration(1200)).toBe('20 min')
    expect(fmtTargetDuration(45)).toBe('45 s')
    expect(fmtTargetDuration(5400)).toBe('1 h 30 min')
    expect(fmtTargetDuration(3600)).toBe('1 h')
  })
  it('fmtPace', () => {
    expect(fmtPace(1560, 5, 'kg')).toBe('5:12 /km')
    expect(fmtPace(0, 5, 'kg')).toBeNull()
    expect(fmtPace(1560, 0, 'kg')).toBeNull()
    expect(fmtPace(1609, 1.609344, 'lb')).toMatch(/\/mi$/)
  })
})

describe('plans with timed exercises', () => {
  it('counts a timed exercise as one set', () => {
    expect(setCountOf([timed])).toBe(1)
    expect(setCountOf([timed, lift])).toBe(4)
  })
  it('estimates minutes from the target time, no rest', () => {
    expect(estimateMinutes([timed])).toBe(20)
    expect(estimateMinutes([{ ...timed, targetDurationSec: undefined }])).toBe(10)
  })
  it('labels targets', () => {
    expect(exerciseTargetLabel(timed)).toBe('20 min')
    expect(exerciseTargetLabel(lift)).toBe('3×8-12')
  })
})
