import { arrayRemove, arrayUnion, doc, setDoc } from 'firebase/firestore'
import { auth, db } from './firebase'

/** Public half of the VAPID pair; the private half lives only in Vercel env (VAPID_PRIVATE_KEY). */
export const VAPID_PUBLIC_KEY =
  'BHHc3Ds_OndHApWA7v2z7ko9SuUizXEEb27SNXZgf8BMExlo-QDddku8JIR47WGxucE9J_wb_ywOSdQjsk8oNKo'

export type PushSupport = 'supported' | 'ios-install' | 'unsupported'

export function isIos(): boolean {
  const ua = navigator.userAgent
  // iPadOS reports itself as a Mac; touch support gives it away.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

/** iOS only delivers web push to apps added to the Home Screen. */
export function pushSupport(): PushSupport {
  if (isIos() && !isStandalone()) return 'ios-install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported'
  }
  return 'supported'
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return 'Notification' in window ? Notification.permission : 'unsupported'
}

function keyBytes(base64: string): Uint8Array {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

interface StoredSub {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

function toStored(sub: PushSubscription): StoredSub | null {
  const json = sub.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null
  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } }
}

const pushDoc = (uid: string) => doc(db, 'users', uid, 'public', 'push')

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'supported') return null
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

/** Must run from a tap — browsers refuse permission prompts without a gesture. */
export async function enablePush(uid: string): Promise<'granted' | 'denied' | 'unsupported'> {
  if (pushSupport() !== 'supported') return 'unsupported'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'
  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) as BufferSource,
    }))
  const stored = toStored(sub)
  if (!stored) return 'unsupported'
  await setDoc(pushDoc(uid), { subs: arrayUnion(stored) }, { merge: true })
  return 'granted'
}

export async function disablePush(uid: string): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  const stored = toStored(sub)
  if (stored) await setDoc(pushDoc(uid), { subs: arrayRemove(stored) }, { merge: true })
  await sub.unsubscribe()
}

export async function savePushPrefs(uid: string, prefs: Record<string, boolean>): Promise<void> {
  await setDoc(pushDoc(uid), { prefs }, { merge: true })
}

/**
 * Ask the server to deliver a push for a notification doc we just wrote.
 * Best-effort: in-app notifications still arrive through Firestore if this fails.
 */
export async function sendPush(to: string, id: string): Promise<void> {
  try {
    const token = await auth.currentUser?.getIdToken()
    if (!token) return
    await fetch('/api/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ to, id }),
      keepalive: true,
    })
  } catch {
    // Offline or running under `vite dev` without the API — ignore.
  }
}
