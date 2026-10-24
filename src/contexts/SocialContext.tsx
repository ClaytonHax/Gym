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
import { sendPush } from '../lib/push'
import {
  describeNotification,
  normalizeUsername,
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
  lookupUsername: (name: string) => Promise<PublicProfile | null>
  searchUsers: (prefix: string) => Promise<PublicProfile[]>
  changeUsername: (next: string) => Promise<void>
  sendRequest: (target: PublicProfile) => Promise<'sent' | 'accepted'>
  acceptRequest: (req: FriendRequest) => Promise<void>
  declineRequest: (req: FriendRequest) => Promise<void>
  unfriend: (uid: string) => Promise<void>
  nudge: (uid: string, text: string) => Promise<'sent' | 'already'>
  react: (ownerUid: string, activityId: string, workoutName: string, reaction: Reaction | null) => Promise<void>
  createChallenge: (input: {
    title: string
    metric: ChallengeMetric
    days: number
    members: string[]
    myScore: number
  }) => Promise<void>
  joinChallenge: (c: Challenge, myScore: number) => Promise<void>
  declineChallenge: (c: Challenge) => Promise<void>
  deleteChallenge: (c: Challenge) => Promise<void>
  postScore: (c: Challenge, score: number) => Promise<void>
  markRead: (ids?: string[]) => Promise<void>
  clearNotification: (id: string) => Promise<void>
  /** Notify every friend (fan-out) — used when you finish a workout. */
  notifyFriends: (type: NotificationType, suffix: string, extra?: { text?: string; ref?: string }) => void
}

const SocialContext = createContext<SocialValue | null>(null)

function toProfile(uid: string, data: Record<string, unknown> | undefined): PublicProfile | undefined {
  if (!data?.username) return undefined
  return {
    uid,
    username: String(data.username),
    displayName: String(data.displayName ?? ''),
    joinedAt: data.joinedAt ? toIso(data.joinedAt) : undefined,
    usernameChangedAt: data.usernameChangedAt ? toIso(data.usernameChangedAt) : undefined,
    freeChange: Boolean(data.freeChange),
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
    let creating = false
    return onSnapshot(
      doc(db, 'profiles', uid),
      async (snap) => {
        if (snap.exists()) {
          setMe(toProfile(uid, snap.data()) ?? null)
          return
        }
        // Only trust "missing" from the server, never from an empty offline cache.
        if (snap.metadata.fromCache || creating) return
        creating = true
        // Everyone gets a handle automatically; the first rename is free.
        for (let attempt = 0; attempt < 6; attempt++) {
          const name = suggestUsername(seedRef.current)
          const batch = writeBatch(db)
          batch.set(doc(db, 'usernames', name), { uid })
          batch.set(doc(db, 'profiles', uid), {
            username: name,
            displayName: seedRef.current.slice(0, 40),
            joinedAt: serverTimestamp(),
            usernameChangedAt: serverTimestamp(),
            freeChange: true,
          })
          try {
            await batch.commit()
            break
          } catch (err) {
            // Taken (or rules not deployed yet): try another number, then give up quietly.
            console.warn('username claim failed', err)
          }
        }
        creating = false
      },
      (err) => console.error('profile listener failed', err)
    )
  }, [uid])

  // Keep the public display name in step with Settings.
  useEffect(() => {
    if (!uid || !me) return
    const name = profile.displayName.trim().slice(0, 40)
    if (!name || name === me.displayName) return
    updateDoc(doc(db, 'profiles', uid), { displayName: name }).catch(() => {})
  }, [uid, me, profile.displayName])

  /* -------------------------------- friends ------------------------------ */

  useEffect(() => {
    if (!uid) {
      setFriendIds([])
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

  const friendKey = friendIds.map((f) => f.uid).sort().join(',')
  useEffect(() => {
    if (!friendKey) return
    const unsubs: Array<() => void> = []
    for (const fid of friendKey.split(',')) {
      unsubs.push(
        onSnapshot(
          doc(db, 'profiles', fid),
          (snap) => setProfiles((p) => ({ ...p, [fid]: toProfile(fid, snap.data()) })),
          () => {}
        ),
        onSnapshot(
          doc(db, 'users', fid, 'public', 'stats'),
          (snap) => setStats((s) => ({ ...s, [fid]: snap.data() as PublicStats | undefined })),
          // They removed you, or haven't synced yet.
          () => setStats((s) => ({ ...s, [fid]: undefined }))
        )
      )
    }
    return () => unsubs.forEach((u) => u())
  }, [friendKey])

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
      () => {}
    )
    const b = onSnapshot(
      query(reqs, where('from', '==', uid)),
      (snap) => setOutgoing(snap.docs.map((d) => toRequest(d.id, d.data()))),
      () => {}
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
            if (n) toast(describeNotification(n).title, 'info')
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
      () => {}
    )
  }, [uid])

  /* -------------------------------- actions ------------------------------ */

  const notify = useCallback(
    async (to: string, type: NotificationType, suffix: string, extra: { text?: string; ref?: string } = {}) => {
      const mine = meRef.current
      if (!uid || !mine) return
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
      void sendPush(to, id)
    },
    [uid]
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

  const searchUsers = useCallback(async (raw: string) => {
    const prefix = normalizeUsername(raw)
    if (prefix.length < 2) return []
    const snap = await getDocs(
      query(
        collection(db, 'profiles'),
        where('username', '>=', prefix),
        where('username', '<=', `${prefix}`),
        limit(10)
      )
    )
    return snap.docs.map((d) => toProfile(d.id, d.data())).filter((p): p is PublicProfile => Boolean(p))
  }, [])

  const changeUsername = useCallback(
    async (raw: string) => {
      const mine = meRef.current
      if (!uid || !mine) throw new Error('Profile not ready')
      const next = normalizeUsername(raw)
      const batch = writeBatch(db)
      batch.delete(doc(db, 'usernames', mine.username))
      batch.set(doc(db, 'usernames', next), { uid })
      batch.update(doc(db, 'profiles', uid), {
        username: next,
        usernameChangedAt: serverTimestamp(),
        freeChange: false,
      })
      await batch.commit()
    },
    [uid]
  )

  const acceptRequest = useCallback(
    async (req: FriendRequest) => {
      if (!uid) return
      const batch = writeBatch(db)
      batch.set(doc(db, 'users', uid, 'friends', req.from), { since: serverTimestamp() })
      batch.set(doc(db, 'users', req.from, 'friends', uid), { since: serverTimestamp() })
      batch.delete(doc(db, 'friendRequests', req.id))
      // A crossed request (both sent one) is cleaned up too.
      if (outgoing.some((o) => o.to === req.from)) batch.delete(doc(db, 'friendRequests', `${uid}_${req.from}`))
      await batch.commit()
      notify(req.from, 'friend_accept', String(Date.now())).catch(() => {})
    },
    [uid, outgoing, notify]
  )

  const sendRequest = useCallback(
    async (target: PublicProfile): Promise<'sent' | 'accepted'> => {
      const mine = meRef.current
      if (!uid || !mine) throw new Error('Profile not ready')
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
      notify(target.uid, 'friend_request', String(Date.now())).catch(() => {})
      return 'sent'
    },
    [uid, incoming, acceptRequest, notify]
  )

  const declineRequest = useCallback(async (req: FriendRequest) => {
    await deleteDoc(doc(db, 'friendRequests', req.id))
  }, [])

  const unfriend = useCallback(
    async (other: string) => {
      if (!uid) return
      const batch = writeBatch(db)
      batch.delete(doc(db, 'users', uid, 'friends', other))
      batch.delete(doc(db, 'users', other, 'friends', uid))
      await batch.commit()
    },
    [uid]
  )

  const nudge = useCallback(
    async (to: string, text: string): Promise<'sent' | 'already'> => {
      try {
        await notify(to, 'nudge', String(utcDayNumber()), { text })
        return 'sent'
      } catch (err) {
        // The day's nudge doc already exists, so the write became a forbidden update.
        if ((err as { code?: string }).code === 'permission-denied') return 'already'
        throw err
      }
    },
    [notify]
  )

  const react = useCallback(
    async (owner: string, activityId: string, workoutName: string, reaction: Reaction | null) => {
      if (!uid) return
      await updateDoc(doc(db, 'users', owner, 'activity', activityId), {
        [`reactions.${uid}`]: reaction ?? deleteField(),
      })
      if (reaction && owner !== uid) {
        const label = reaction === 'fire' ? 'Fire' : reaction === 'strong' ? 'Strong' : 'Beast mode'
        // One notification per workout, however many times the reaction changes.
        notify(owner, 'kudos', activityId, { text: `${label} on ${workoutName}`, ref: activityId }).catch(() => {})
      }
    },
    [uid, notify]
  )

  const createChallenge = useCallback<SocialValue['createChallenge']>(
    async ({ title, metric, days, members, myScore }) => {
      if (!uid) return
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
      })
      for (const m of members) {
        notify(m, 'challenge_invite', ref.id, { text: `${title} · ${days} days` }).catch(() => {})
      }
    },
    [uid, notify]
  )

  const joinChallenge = useCallback(
    async (c: Challenge, myScore: number) => {
      if (!uid) return
      await updateDoc(doc(db, 'challenges', c.id), {
        accepted: arrayUnion(uid),
        [`scores.${uid}`]: myScore,
      })
      if (c.creator !== uid) notify(c.creator, 'challenge_join', c.id, { text: c.title }).catch(() => {})
    },
    [uid, notify]
  )

  const declineChallenge = useCallback(
    async (c: Challenge) => {
      if (!uid) return
      await updateDoc(doc(db, 'challenges', c.id), { declined: arrayUnion(uid) })
    },
    [uid]
  )

  const deleteChallenge = useCallback(async (c: Challenge) => {
    await deleteDoc(doc(db, 'challenges', c.id))
  }, [])

  const postScore = useCallback(
    async (c: Challenge, score: number) => {
      if (!uid) return
      await updateDoc(doc(db, 'challenges', c.id), { [`scores.${uid}`]: score })
    },
    [uid]
  )

  const markRead = useCallback(
    async (ids?: string[]) => {
      if (!uid) return
      const targets = notifications.filter((n) => !n.read && (!ids || ids.includes(n.id)))
      if (targets.length === 0) return
      const batch = writeBatch(db)
      for (const n of targets) batch.update(doc(db, 'users', uid, 'notifications', n.id), { read: true })
      await batch.commit()
    },
    [uid, notifications]
  )

  const clearNotification = useCallback(
    async (id: string) => {
      if (!uid) return
      await deleteDoc(doc(db, 'users', uid, 'notifications', id))
    },
    [uid]
  )

  const notifyFriends = useCallback<SocialValue['notifyFriends']>(
    (type, suffix, extra) => {
      for (const f of friendIdsRef.current) notify(f, type, suffix, extra).catch(() => {})
    },
    [notify]
  )

  const isFriend = useCallback((other: string) => friendIds.some((f) => f.uid === other), [friendIds])

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
      lookupUsername,
      searchUsers,
      changeUsername,
      sendRequest,
      acceptRequest,
      declineRequest,
      unfriend,
      nudge,
      react,
      createChallenge,
      joinChallenge,
      declineChallenge,
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
      lookupUsername,
      searchUsers,
      changeUsername,
      sendRequest,
      acceptRequest,
      declineRequest,
      unfriend,
      nudge,
      react,
      createChallenge,
      joinChallenge,
      declineChallenge,
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
