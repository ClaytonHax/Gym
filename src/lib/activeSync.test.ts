import { describe, expect, it } from 'vitest'
import { reconcileRemote } from './activeSync'
import type { ActiveWorkout } from '../types'

const w = (startedAt: string, name = 'W'): ActiveWorkout => ({ name, startedAt, exercises: [] })
const base = { lastMirrored: null, tombstone: null, remotePending: false, fromCache: false }

describe('reconcileRemote', () => {
  it('clears local when the mirrored session was deleted elsewhere', () => {
    const local = w('2026-01-01T10:00:00Z')
    expect(reconcileRemote({ ...base, local, remote: null, lastMirrored: local.startedAt })).toBeNull()
  })

  it('keeps a local session that never reached Firestore', () => {
    const local = w('2026-01-01T10:00:00Z')
    expect(reconcileRemote({ ...base, local, remote: null })).toBe(local)
  })

  it('does not treat an empty offline cache as a deletion', () => {
    const local = w('2026-01-01T10:00:00Z')
    expect(reconcileRemote({ ...base, local, remote: null, lastMirrored: local.startedAt, fromCache: true })).toBe(local)
  })

  it('adopts a remote session when nothing is local', () => {
    const remote = w('2026-01-01T10:00:00Z')
    expect(reconcileRemote({ ...base, local: null, remote })).toBe(remote)
  })

  it('ignores a stale snapshot of a session that was just saved', () => {
    const remote = w('2026-01-01T10:00:00Z')
    expect(reconcileRemote({ ...base, local: null, remote, tombstone: remote.startedAt })).toBeNull()
  })

  it('prefers the newer session, and local edits over their own echo', () => {
    const older = w('2026-01-01T10:00:00Z')
    const newer = w('2026-01-02T10:00:00Z')
    expect(reconcileRemote({ ...base, local: older, remote: newer })).toBe(newer)
    expect(reconcileRemote({ ...base, local: newer, remote: older })).toBe(newer)
    const echo = { ...newer, name: 'old echo' }
    expect(reconcileRemote({ ...base, local: newer, remote: echo, remotePending: true })).toBe(newer)
    expect(reconcileRemote({ ...base, local: newer, remote: echo })).toBe(echo)
  })
})
