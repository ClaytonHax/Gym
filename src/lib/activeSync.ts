import type { ActiveWorkout } from '../types'

/**
 * Decides what the in-memory session should become when Firestore reports the
 * mirrored `activeWorkout` doc. Pure so the tricky cases are testable.
 *
 * - `lastMirrored`: startedAt of the session we know has been written to Firestore
 *   (persisted across reloads). A missing remote doc only means "deleted
 *   elsewhere" if it was there before; a session that never synced stays put.
 * - `tombstone`: startedAt of a session this device just finished/discarded, so a
 *   stale snapshot can't resurrect it.
 */
export function reconcileRemote(args: {
  local: ActiveWorkout | null
  remote: ActiveWorkout | null
  lastMirrored: string | null
  tombstone: string | null
  /** Snapshot still contains our own unacknowledged writes. */
  remotePending: boolean
  /** Snapshot came from the offline cache, so a missing doc proves nothing. */
  fromCache: boolean
}): ActiveWorkout | null {
  const { local, remote, lastMirrored, tombstone, remotePending, fromCache } = args

  if (!remote) {
    if (fromCache) return local
    if (local && lastMirrored && local.startedAt === lastMirrored) return null
    return local
  }
  if (tombstone && remote.startedAt === tombstone) return local
  if (!local) return remote
  if (remote.startedAt > local.startedAt) return remote
  if (remote.startedAt < local.startedAt) return local
  // Same session: our own pending edits are newer than the echo; otherwise another device edited.
  return remotePending ? local : remote
}
