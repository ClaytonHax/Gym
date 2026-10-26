import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { dayKey } from '../lib/date'
import { sendPush } from '../lib/push'
import {
  challengeState,
  daysSince,
  describeNotification,
  nameKeys,
  normalizeUsername,
  rankSearch,
  searchText,
  suggestUsername,
  toIso,
  utcDayNumber,
  type AppNotification,
  type Challenge,
  type ChallengeMetric,
  type Friend,
  type FriendRequest,
  type NotificationType,
  type PublicProfile,
  type PublicStats,
  type Reaction,
} from '../lib/social'
import { useAuth } from './AuthContext'
import { useSettings } from './SettingsContext'
import { useToast } from './ToastContext'

export interface PushState {
  /** Devices with push turned on for this account. */
  deviceCount: number
  prefs: Partial<Record<NotificationType, boolean>>
}

interface SocialValue {
  /** null until the public profile (and username) exists. */
  me: PublicProfile | null
  friends: Friend[]
  friendsLoading: boolean
  incoming: FriendRequest[]
  outgoing: FriendRequest[]
  notifications: AppNotification[]
  unread: number
  challenges: Challenge[]
  push: PushState
  isFriend: (uid: string) => boolean
  /**
   * Current public profile for any uid (you, friends, or anyone watched via
   * useProfile/useProfiles). undefined while loading or if it doesn't exist.
   */
  profileOf: (uid: string) => PublicProfile | undefined
  /** Start streaming a profile; returns the release function. Prefer the hooks. */
  watchProfile: (uid: string) => () => void
  lookupUsername: (name: string) => Promise<PublicProfile | null>
  searchUsers: (prefix: string) => Promise<PublicProfile[]>
  changeUsername: (next: string) => Promise<void>
  /** Keep the current (auto-assigned) username and end the free-change window. */
  confirmUsername: () => Promise<void>
  sendRequest: (target: PublicProfile) => Promise<'sent' | 'accepted'>
  acceptRequest: (req: FriendRequest) => Promise<void>
  declineRequest: (req: FriendRequest) => Promise<void>
  unfriend: (uid: string) => Promise<void>
  nudge: (uid: string, text: string) => Promise<'sent' | 'already'>
  /** A friend can be nudged until they've trained today, or you've already nudged them today. */
  canNudge: (uid: string, stats: PublicStats | undefined) => boolean
  react: (ownerUid: string, activityId: string, workoutName: string, reaction: Reaction | null) => Promise<void>
  createChallenge: (input: {
    title: string
    metric: ChallengeMetric
    days: number
    members: string[]
    myScore: number
    verify?: 'none' | 'photo'
  }) => Promise<void>
  joinChallenge: (c: Challenge, myScore: number) => Promise<void>
  declineChallenge: (c: Challenge) => Promise<void>
  /** Step out of a challenge you joined; you stay listed as "Left" and no longer rank. */
  leaveChallenge: (c: Challenge) => Promise<void>
  deleteChallenge: (c: Challenge) => Promise<void>
  postScore: (c: Challenge, score: number) => Promise<void>
  markRead: (ids?: string[]) => Promise<void>
  clearNotification: (id: string) => Promise<void>
  /** Notify every friend (fan-out) — used when you finish a workout. */
  notifyFriends: (type: NotificationType, suffix: string, extra?: { text?: string; ref?: string }) => void
}

const SocialContext = createContext<SocialValue | null>(null)

const DIRECTORY_TTL_MS = 5 * 60 * 1000
const DIRECTORY_CAP = 2000

function toProfile(uid: string, data: Record<string, unknown> | undefined): PublicProfile | undefined {
  if (!data?.username) return undefined
  return {
    uid,
    username: String(data.username),
    displayName: String(data.displayName ?? ''),
    joinedAt: data.joinedAt ? toIso(data.joinedAt) : undefined,
    usernameChangedAt: data.usernameChangedAt ? toIso(data.usernameChangedAt) : undefined,
    freeChange: Boolean(data.freeChange),
    nameKeys: Array.isArray(data.nameKeys) ? data.nameKeys.map(String) : undefined,
  }
}

function toRequest(id: string, d: Record<string, unknown>): FriendRequest {
  return {
    id,
    from: String(d.from),
    to: String(d.to),
    fromUsername: String(d.fromUsername ?? ''),
    fromName: String(d.fromName ?? ''),
    toUsername: String(d.toUsername ?? ''),
    toName: String(d.toName ?? ''),
    createdAt: toIso(d.createdAt),
  }
}

function fmtDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-${String(d.getDate()).padStart(2, '0')}`
}

export function SocialProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { profile } = useSettings()
  const toast = useToast()
  const uid = user?.uid ?? null

  const [me, setMe] = useState<PublicProfile | null>(null)
  const [friendIds, setFriendIds] = useState<Array<{ uid: string; since?: string }>>([])
  const [friendsLoading, setFriendsLoading] = useState(true)
  const [profiles, setProfiles] = useState<Record<string, PublicProfile | undefined>>({})
  const [stats, setStats] = useState<Record<string, PublicStats | undefined>>({})
  const [incoming, setIncoming] = useState<FriendRequest[]>([])
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([])
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [push, setPush] = useState<PushState>({ deviceCount: 0, prefs: {} })

  const meRef = useRef<PublicProfile | null>(null)
  meRef.current = me
  const profilesRef = useRef(profiles)
  profilesRef.current = profiles
  const friendIdsRef = useRef<string[]>([])
  friendIdsRef.current = friendIds.map((f) => f.uid)

  /* ---------------------------- public profile --------------------------- */

  const seedName = profile.displayName || user?.displayName || user?.email?.split('@')[0] || ''
  const seedRef = useRef(seedName)
  seedRef.current = seedName

  useEffect(() => {
    if (!uid) {
      setMe(null)
      return
    }
    const owner: string = uid
    let creating = false
    let missing = false
    let retry: number | undefined
    let disposed = false

    // Everyone gets a handle automatically; the first rename is free.
    async function create() {
      if (creating || disposed) return
      creating = true
      let ok = false
      for (let attempt = 0; attempt < 6 && !ok; attempt++) {
        const name = suggestUsername(seedRef.current)
        const batch = writeBatch(db)
        batch.set(doc(db, 'usernames', name), { uid: owner })
        batch.set(doc(db, 'profiles', owner), {
          username: name,
          displayName: seedRef.current.slice(0, 40),
          nameKeys: nameKeys(seedRef.current.slice(0, 40)),
          joinedAt: serverTimestamp(),
          usernameChangedAt: serverTimestamp(),
          freeChange: true,
        })
        try {
          await batch.commit()
          ok = true
        } catch (err) {
          // Taken (or offline / rules not deployed yet): try another number.
          console.warn('username claim failed', err)
        }
      }
      creating = false
      // Don't give up for good: try again shortly, or as soon as we're back online.
      if (!ok && missing && !disposed) retry = window.setTimeout(create, 20_000)
    }
    const onOnline = () => {
      if (missing) void create()
    }
    window.addEventListener('online', onOnline)

    const unsub = onSnapshot(
      doc(db, 'profiles', uid),
      (snap) => {
        if (snap.exists()) {
          missing = false
          window.clearTimeout(retry)
          setMe(toProfile(uid, snap.data()) ?? null)
          return
        }
        // Only trust "missing" from the server, never from an empty offline cache.
        if (snap.metadata.fromCache) return
        missing = true
        void create()
      },
      (err) => console.error('profile listener failed', err)
    )
    return () => {
      disposed = true
      window.clearTimeout(retry)
      window.removeEventListener('online', onOnline)
      unsub()
    }
  }, [uid])

  // Keep the public display name (and its search keys) in step with Settings.
  // Also backfills keys for profiles made before name search existed.
  useEffect(() => {
    if (!uid || !me) return
    const name = profile.displayName.trim().slice(0, 40) || me.displayName
    const keys = nameKeys(name)
    if (name === me.displayName && keys.join('|') === me.nameKeys?.join('|')) return
    updateDoc(doc(db, 'profiles', uid), { displayName: name, nameKeys: keys }).catch(() => {})
  }, [uid, me, profile.displayName])

  /* -------------------------------- friends ------------------------------ */

  useEffect(() => {
    if (!uid) {
      setFriendIds([])
      setFriendsLoading(false)
      return
    }
    setFriendsLoading(true)
    return onSnapshot(
      collection(db, 'users', uid, 'friends'),
      (snap) => {
        setFriendIds(snap.docs.map((d) => ({ uid: d.id, since: d.data().since ? toIso(d.data().since) : undefined })))
        setFriendsLoading(false)
      },
      (err) => {
        console.error('friends listener failed', err)
        setFriendsLoading(false)
      }
    )
  }, [uid])

  /* --------------------------- profile cache ----------------------------- */

  // Refcounted listeners so every screen showing someone shares one stream.
  const watchers = useRef(new Map<string, { count: number; unsub: () => void }>())

  const watchProfile = useCallback(
    (target: string) => {
      if (!uid || !target) return () => {}
      const map = watchers.current
      const existing = map.get(target)
      if (existing) existing.count++
      else {
        const unsub = onSnapshot(
          doc(db, 'profiles', target),
          (snap) => setProfiles((p) => ({ ...p, [target]: toProfile(target, snap.data()) })),
          (err) => console.warn('profile listener failed', err)
        )
        map.set(target, { count: 1, unsub })
      }
      let released = false
      return () => {
        if (released) return
        released = true
        const w = map.get(target)
        if (!w) return
        if (--w.count <= 0) {
          w.unsub()
          map.delete(target)
        }
      }
    },
    [uid]
  )

  // Drop every profile stream (and cached data) when the account changes.
  useEffect(() => {
    const map = watchers.current
    return () => {
      for (const w of map.values()) w.unsub()
      map.clear()
      setProfiles({})
    }
  }, [uid])

  const friendKey = friendIds.map((f) => f.uid).sort().join(',')
  useEffect(() => {
    if (!friendKey) return
    const unsubs: Array<() => void> = []
    for (const fid of friendKey.split(',')) {
      unsubs.push(
        watchProfile(fid),
        onSnapshot(
          doc(db, 'users', fid, 'public', 'stats'),
          (snap) => setStats((s) => ({ ...s, [fid]: snap.data() as PublicStats | undefined })),
          // They removed you, or haven't synced yet.
          () => setStats((s) => ({ ...s, [fid]: undefined }))
        )
      )
    }
    return () => unsubs.forEach((u) => u())
  }, [friendKey, watchProfile])

  const friends = useMemo<Friend[]>(
    () =>
      friendIds
        .map((f) => ({ ...f, profile: profiles[f.uid], stats: stats[f.uid] }))
        .sort((a, b) => (a.profile?.username ?? '').localeCompare(b.profile?.username ?? '')),
    [friendIds, profiles, stats]
  )

  /* -------------------------------- requests ----------------------------- */

  useEffect(() => {
    if (!uid) {
      setIncoming([])
      setOutgoing([])
      return
    }
    const reqs = collection(db, 'friendRequests')
    const a = onSnapshot(
      query(reqs, where('to', '==', uid)),
      (snap) => setIncoming(snap.docs.map((d) => toRequest(d.id, d.data()))),
      (err) => console.warn('incoming requests listener failed', err)
    )
    const b = onSnapshot(
      query(reqs, where('from', '==', uid)),
      (snap) => setOutgoing(snap.docs.map((d) => toRequest(d.id, d.data()))),
      (err) => console.warn('outgoing requests listener failed', err)
    )
    return () => {
      a()
      b()
    }
  }, [uid])

  /* ----------------------------- notifications --------------------------- */

  useEffect(() => {
    if (!uid) {
      setNotifications([])
      return
    }
    let first = true
    return onSnapshot(
      query(collection(db, 'users', uid, 'notifications'), orderBy('createdAt', 'desc'), limit(60)),
      (snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data()
          return { id: d.id, ...data, createdAt: toIso(data.createdAt) } as AppNotification
        })
        setNotifications(list)
        if (!first && !snap.metadata.fromCache) {
          // Live in-app alert for anything that lands while the app is open.
          const fresh = snap.docChanges().filter((c) => c.type === 'added' && !c.doc.data().read)
          for (const change of fresh.slice(0, 2)) {
            const n = list.find((x) => x.id === change.doc.id)
            if (n) toast(describeNotification(n, profilesRef.current[n.from]).title, 'info')
          }
        }
        first = false
      },
      (err) => console.error('notifications listener failed', err)
    )
  }, [uid, toast])

  const unread = notifications.filter((n) => !n.read).length

  // Installed PWAs show the count on the app icon.
  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (n: number) => Promise<void>
      clearAppBadge?: () => Promise<void>
    }
    if (unread > 0) nav.setAppBadge?.(unread).catch(() => {})
    else nav.clearAppBadge?.().catch(() => {})
  }, [unread])

  /* ------------------------------ challenges ----------------------------- */

  useEffect(() => {
    if (!uid) {
      setChallenges([])
      return
    }
    return onSnapshot(
      query(collection(db, 'challenges'), where('members', 'array-contains', uid)),
      (snap) =>
        setChallenges(
          snap.docs
            .map((d) => {
              const data = d.data()
              return {
                id: d.id,
                ...data,
                scores: data.scores ?? {},
                accepted: data.accepted ?? [],
                declined: data.declined ?? [],
                createdAt: toIso(data.createdAt),
              } as Challenge
            })
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        ),
      (err) => console.error('challenges listener failed', err)
    )
  }, [uid])

  /* --------------------------------- push -------------------------------- */

  useEffect(() => {
    if (!uid) return
    return onSnapshot(
      doc(db, 'users', uid, 'public', 'push'),
      (snap) => {
        const d = snap.data()
        setPush({ deviceCount: Array.isArray(d?.subs) ? d.subs.length : 0, prefs: d?.prefs ?? {} })
      },
      (err) => console.warn('push listener failed', err)
    )
  }, [uid])

  /* -------------------------------- actions ------------------------------ */

  /** The signed-in uid, or a clear error instead of a silent no-op. */
  const needUid = useCallback((): string => {
    if (!uid) throw new Error('Not signed in')
    return uid
  }, [uid])

  const needMe = useCallback((): PublicProfile => {
    const mine = meRef.current
    if (!uid || !mine) throw new Error('Profile not ready')
    return mine
  }, [uid])

  const notify = useCallback(
    async (to: string, type: NotificationType, suffix: string, extra: { text?: string; ref?: string } = {}) => {
      const mine = needMe()
      const id = `${type}_${uid}_${suffix}`.slice(0, 120)
      await setDoc(doc(db, 'users', to, 'notifications', id), {
        type,
        from: uid,
        fromUsername: mine.username,
        read: false,
        createdAt: serverTimestamp(),
        ...(extra.text ? { text: extra.text.slice(0, 140) } : {}),
        ...(extra.ref ? { ref: extra.ref } : {}),
      })
      // Push is best-effort; the in-app notification is already stored.
      Promise.resolve(sendPush(to, id)).catch((err) => console.warn('push failed', err))
    },
    [uid, needMe]
  )

  /** Fire-and-forget notification: a failure never surfaces to the user. */
  const notifyQuietly = useCallback(
    (...args: Parameters<typeof notify>) => {
      notify(...args).catch((err) => console.warn('notification failed', err))
    },
    [notify]
  )

  const lookupUsername = useCallback(async (raw: string) => {
    const name = normalizeUsername(raw)
    if (!name) return null
    const handle = await getDoc(doc(db, 'usernames', name))
    const owner = handle.data()?.uid as string | undefined
    if (!owner) return null
    const snap = await getDoc(doc(db, 'profiles', owner))
    return toProfile(owner, snap.data()) ?? null
  }, [])

  // Every profile, fetched once and reused for a few minutes, so search can match
  // anywhere in a name or handle ("lamb" finds @thebiggestlamb) and finds people
  // whose profile predates nameKeys. Fine while the user base is small; the
  // indexed queries below still cover anyone past the scan cap.
  const directory = useRef<{ at: number; list: Promise<PublicProfile[]> } | null>(null)

  const searchUsers = useCallback(async (raw: string) => {
    const prefix = normalizeUsername(raw)
    const words = searchText(raw)
    if (words.length < 2) return []
    if (!directory.current || Date.now() - directory.current.at > DIRECTORY_TTL_MS) {
      const list = getDocs(query(collection(db, 'profiles'), limit(DIRECTORY_CAP))).then((snap) =>
        snap.docs.map((d) => toProfile(d.id, d.data())).filter((p): p is PublicProfile => Boolean(p))
      )
      // A failed load shouldn't stick: drop it so the next search retries.
      list.catch(() => (directory.current = null))
      directory.current = { at: Date.now(), list }
    }
    const profiles = collection(db, 'profiles')
    const [all, byHandle, byName] = await Promise.all([
      directory.current.list,
      /^[a-z0-9_.]+$/.test(prefix)
        ? getDocs(query(profiles, where('username', '>=', prefix), where('username', '<=', `${prefix}\uf8ff`), limit(10)))
        : null,
      getDocs(query(profiles, where('nameKeys', 'array-contains', words), limit(10))),
    ])
    const indexed = [...(byHandle?.docs ?? []), ...byName.docs]
      .map((d) => toProfile(d.id, d.data()))
      .filter((p): p is PublicProfile => Boolean(p))
    return rankSearch([...all, ...indexed], raw).slice(0, 20)
  }, [])

  const changeUsername = useCallback(
    async (raw: string) => {
      const id = needUid()
      const mine = needMe()
      const next = normalizeUsername(raw)
      const batch = writeBatch(db)
      batch.delete(doc(db, 'usernames', mine.username))
      batch.set(doc(db, 'usernames', next), { uid: id })
      batch.update(doc(db, 'profiles', id), {
        username: next,
        usernameChangedAt: serverTimestamp(),
        freeChange: false,
      })
      await batch.commit()
    },
    [needUid, needMe]
  )

  const confirmUsername = useCallback(async () => {
    const id = needUid()
    needMe()
    await updateDoc(doc(db, 'profiles', id), { freeChange: false, usernameChangedAt: serverTimestamp() })
  }, [needUid, needMe])

  const acceptRequest = useCallback(
    async (req: FriendRequest) => {
      const uid = needUid()
      const batch = writeBatch(db)
      batch.set(doc(db, 'users', uid, 'friends', req.from), { since: serverTimestamp() })
      batch.set(doc(db, 'users', req.from, 'friends', uid), { since: serverTimestamp() })
      batch.delete(doc(db, 'friendRequests', req.id))
      // A crossed request (both sent one) is cleaned up too.
      if (outgoing.some((o) => o.to === req.from)) batch.delete(doc(db, 'friendRequests', `${uid}_${req.from}`))
      await batch.commit()
      notifyQuietly(req.from, 'friend_accept', String(Date.now()))
    },
    [needUid, outgoing, notifyQuietly]
  )

  const sendRequest = useCallback(
    async (target: PublicProfile): Promise<'sent' | 'accepted'> => {
      const uid = needUid()
      const mine = needMe()
      const crossed = incoming.find((r) => r.from === target.uid)
      if (crossed) {
        await acceptRequest(crossed)
        return 'accepted'
      }
      await setDoc(doc(db, 'friendRequests', `${uid}_${target.uid}`), {
        from: uid,
        to: target.uid,
        createdAt: serverTimestamp(),
        fromUsername: mine.username,
        fromName: mine.displayName,
        toUsername: target.username,
        toName: target.displayName,
      })
      notifyQuietly(target.uid, 'friend_request', String(Date.now()))
      return 'sent'
    },
    [needUid, needMe, incoming, acceptRequest, notifyQuietly]
  )

  const declineRequest = useCallback(async (req: FriendRequest) => {
    await deleteDoc(doc(db, 'friendRequests', req.id))
  }, [])

  const unfriend = useCallback(
    async (other: string) => {
      const uid = needUid()
      // Shared challenges that are still running: you step out of them, since you
      // can no longer see each other's workouts.
      const shared = challenges.filter(
        (c) => c.members.includes(other) && !c.declined.includes(uid) && challengeState(c) !== 'finished'
      )
      // Tell them first: the notification rule needs the friendship to still exist.
      for (const c of shared) {
        if (c.accepted.includes(uid)) {
          await notify(other, 'challenge_left', c.id, { text: `${c.title} · you’re no longer friends` }).catch((err) =>
            console.warn('notification failed', err)
          )
        }
      }
      const batch = writeBatch(db)
      batch.delete(doc(db, 'users', uid, 'friends', other))
      batch.delete(doc(db, 'users', other, 'friends', uid))
      for (const c of shared) batch.update(doc(db, 'challenges', c.id), { declined: arrayUnion(uid) })
      await batch.commit()
    },
    [needUid, challenges, notify]
  )

  // Who you've nudged today (the server allows one per friend per day), remembered across reloads.
  const nudgeKey = `gym.nudged.${dayKey()}`
  const [nudgedToday, setNudgedToday] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(nudgeKey) ?? '[]') as string[]
    } catch {
      return []
    }
  })
  const markNudged = useCallback(
    (to: string) => {
      setNudgedToday((prev) => {
        if (prev.includes(to)) return prev
        const next = [...prev, to]
        try {
          localStorage.setItem(nudgeKey, JSON.stringify(next))
        } catch {
          // Fine — the button just comes back after a reload.
        }
        return next
      })
    },
    [nudgeKey]
  )

  const canNudge = useCallback(
    (to: string, stats: PublicStats | undefined) =>
      !nudgedToday.includes(to) && daysSince(stats?.lastWorkoutAt) !== 0,
    [nudgedToday]
  )

  const nudge = useCallback(
    async (to: string, text: string): Promise<'sent' | 'already'> => {
      try {
        await notify(to, 'nudge', String(utcDayNumber()), { text })
        markNudged(to)
        return 'sent'
      } catch (err) {
        // The day's nudge doc already exists, so the write became a forbidden update.
        if ((err as { code?: string }).code === 'permission-denied') {
          markNudged(to)
          return 'already'
        }
        throw err
      }
    },
    [notify, markNudged]
  )

  const react = useCallback(
    async (owner: string, activityId: string, workoutName: string, reaction: Reaction | null) => {
      const uid = needUid()
      await updateDoc(doc(db, 'users', owner, 'activity', activityId), {
        [`reactions.${uid}`]: reaction ?? deleteField(),
      })
      if (reaction && owner !== uid) {
        const label = reaction === 'fire' ? 'Fire' : reaction === 'strong' ? 'Strong' : 'Beast mode'
        // One notification per workout, however many times the reaction changes.
        notifyQuietly(owner, 'kudos', activityId, { text: `${label} on ${workoutName}`, ref: activityId })
      }
    },
    [needUid, notifyQuietly]
  )

  const createChallenge = useCallback<SocialValue['createChallenge']>(
    async ({ title, metric, days, members, myScore, verify }) => {
      const uid = needUid()
      const start = new Date()
      const end = new Date()
      end.setDate(end.getDate() + days - 1)
      const ref = await addDoc(collection(db, 'challenges'), {
        creator: uid,
        members: [uid, ...members],
        accepted: [uid],
        declined: [],
        metric,
        title: title.slice(0, 60),
        startDay: fmtDay(start),
        endDay: fmtDay(end),
        createdAt: serverTimestamp(),
        scores: { [uid]: myScore },
        ...(verify === 'photo' ? { verify } : {}),
      })
      for (const m of members) {
        notifyQuietly(m, 'challenge_invite', ref.id, { text: `${title} · ${days} days` })
      }
    },
    [needUid, notifyQuietly]
  )

  const joinChallenge = useCallback(
    async (c: Challenge, myScore: number) => {
      const uid = needUid()
      await updateDoc(doc(db, 'challenges', c.id), {
        accepted: arrayUnion(uid),
        [`scores.${uid}`]: myScore,
      })
      if (c.creator !== uid) notifyQuietly(c.creator, 'challenge_join', c.id, { text: c.title })
    },
    [needUid, notifyQuietly]
  )

  const declineChallenge = useCallback(
    async (c: Challenge) => {
      const uid = needUid()
      await updateDoc(doc(db, 'challenges', c.id), { declined: arrayUnion(uid) })
    },
    [needUid]
  )

  const leaveChallenge = useCallback(
    async (c: Challenge) => {
      const uid = needUid()
      await updateDoc(doc(db, 'challenges', c.id), { declined: arrayUnion(uid) })
      for (const m of c.accepted) if (m !== uid) notifyQuietly(m, 'challenge_left', c.id, { text: c.title })
    },
    [needUid, notifyQuietly]
  )

  const deleteChallenge = useCallback(async (c: Challenge) => {
    await deleteDoc(doc(db, 'challenges', c.id))
  }, [])

  const postScore = useCallback(
    async (c: Challenge, score: number) => {
      const uid = needUid()
      await updateDoc(doc(db, 'challenges', c.id), { [`scores.${uid}`]: score })
    },
    [needUid]
  )

  const markRead = useCallback(
    async (ids?: string[]) => {
      const uid = needUid()
      const targets = notifications.filter((n) => !n.read && (!ids || ids.includes(n.id)))
      if (targets.length === 0) return
      const batch = writeBatch(db)
      for (const n of targets) batch.update(doc(db, 'users', uid, 'notifications', n.id), { read: true })
      await batch.commit()
    },
    [needUid, notifications]
  )

  const clearNotification = useCallback(
    async (id: string) => {
      const uid = needUid()
      await deleteDoc(doc(db, 'users', uid, 'notifications', id))
    },
    [needUid]
  )

  const notifyFriends = useCallback<SocialValue['notifyFriends']>(
    (type, suffix, extra) => {
      for (const f of friendIdsRef.current) notifyQuietly(f, type, suffix, extra)
    },
    [notifyQuietly]
  )

  const isFriend = useCallback((other: string) => friendIds.some((f) => f.uid === other), [friendIds])

  const profileOf = useCallback(
    (other: string): PublicProfile | undefined => (other === uid ? (me ?? undefined) : profiles[other]),
    [uid, me, profiles]
  )

  const value = useMemo<SocialValue>(
    () => ({
      me,
      friends,
      friendsLoading,
      incoming,
      outgoing,
      notifications,
      unread,
      challenges,
      push,
      isFriend,
      profileOf,
      watchProfile,
      lookupUsername,
      searchUsers,
      changeUsername,
      confirmUsername,
      sendRequest,
      acceptRequest,
      declineRequest,
      unfriend,
      nudge,
      canNudge,
      react,
      createChallenge,
      joinChallenge,
      declineChallenge,
      leaveChallenge,
      deleteChallenge,
      postScore,
      markRead,
      clearNotification,
      notifyFriends,
    }),
    [
      me,
      friends,
      friendsLoading,
      incoming,
      outgoing,
      notifications,
      unread,
      challenges,
      push,
      isFriend,
      profileOf,
      watchProfile,
      lookupUsername,
      searchUsers,
      changeUsername,
      confirmUsername,
      sendRequest,
      acceptRequest,
      declineRequest,
      unfriend,
      nudge,
      canNudge,
      react,
      createChallenge,
      joinChallenge,
      declineChallenge,
      leaveChallenge,
      deleteChallenge,
      postScore,
      markRead,
      clearNotification,
      notifyFriends,
    ]
  )

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>
}

export function useSocial(): SocialValue {
  const ctx = useContext(SocialContext)
  if (!ctx) throw new Error('useSocial must be used inside <SocialProvider>')
  return ctx
}

/** Stream one person's current public profile (deduped); undefined until it loads. */
export function useProfile(target: string | undefined): PublicProfile | undefined {
  const { profileOf, watchProfile } = useSocial()
  useEffect(() => (target ? watchProfile(target) : undefined), [target, watchProfile])
  return target ? profileOf(target) : undefined
}

/** Stream several profiles at once; returns the lookup function. */
export function useProfiles(targets: string[]): (uid: string) => PublicProfile | undefined {
  const { profileOf, watchProfile } = useSocial()
  const key = [...new Set(targets)].sort().join(',')
  useEffect(() => {
    if (!key) return
    const releases = key.split(',').map((t) => watchProfile(t))
    return () => releases.forEach((r) => r())
  }, [key, watchProfile])
  return profileOf
}
