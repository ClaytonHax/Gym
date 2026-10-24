import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { Icon } from './Icon'
import { Button, Card, Field, Sheet, Skeleton } from './ui'
import { shareInvite } from './social'
import { useAuth } from '../contexts/AuthContext'
import { useSocial } from '../contexts/SocialContext'
import { useToast } from '../contexts/ToastContext'
import { nextRenameAt, normalizeUsername, RENAME_COOLDOWN_DAYS, usernameError } from '../lib/social'

type Availability = 'idle' | 'checking' | 'free' | 'taken' | 'invalid'

export function UsernameCard() {
  const { user } = useAuth()
  const { me, changeUsername } = useSocial()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [status, setStatus] = useState<Availability>('idle')
  const [saving, setSaving] = useState(false)

  const next = normalizeUsername(value)
  const error = value ? usernameError(next) : null

  useEffect(() => {
    if (!open || !me) return
    if (!value || next === me.username) {
      setStatus('idle')
      return
    }
    if (error) {
      setStatus('invalid')
      return
    }
    setStatus('checking')
    let cancelled = false
    const t = window.setTimeout(() => {
      getDoc(doc(db, 'usernames', next))
        .then((snap) => !cancelled && setStatus(snap.exists() && snap.data()?.uid !== user?.uid ? 'taken' : 'free'))
        .catch(() => !cancelled && setStatus('idle'))
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [open, value, next, error, me, user?.uid])

  if (!me) {
    return (
      <Card>
        <Skeleton className="h-16" />
      </Card>
    )
  }

  const lockedUntil = nextRenameAt(me)

  async function save() {
    if (status !== 'free') return
    setSaving(true)
    try {
      await changeUsername(next)
      toast(`You’re now @${next}.`)
      setOpen(false)
    } catch {
      // Lost a race for the name, or the cooldown hasn't passed.
      toast('Couldn’t claim that username. Try another.', 'error')
      setStatus('taken')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-brand-400">
          <Icon name="at" size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-2xl font-bold leading-none">@{me.username}</p>
          <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
            {me.freeChange
              ? 'You get one free change now, then one every 30 days.'
              : lockedUntil
                ? `Next change available ${lockedUntil.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}.`
                : 'You can change your username now.'}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          icon="pencil"
          disabled={Boolean(lockedUntil)}
          onClick={() => {
            setValue(me.username)
            setOpen(true)
          }}
        >
          Change
        </Button>
        <Button variant="secondary" icon="share" onClick={() => shareInvite(me.username, toast)}>
          Invite
        </Button>
      </div>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Change username"
        footer={
          <Button full size="lg" loading={saving} disabled={status !== 'free'} onClick={save}>
            Save @{next || '…'}
          </Button>
        }
      >
        <Field
          label="Username"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={21}
          suffix={
            status === 'checking' ? (
              <span className="text-xs">…</span>
            ) : status === 'free' ? (
              <Icon name="check" size={18} className="text-go-400" title="Available" />
            ) : status === 'taken' ? (
              <Icon name="x" size={18} className="text-rose-400" title="Taken" />
            ) : null
          }
          error={error ?? (status === 'taken' ? 'That username is taken.' : undefined)}
          hint={status === 'free' ? 'Available!' : '3–20 characters: letters, numbers, dots and underscores.'}
        />
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-400">
          <Icon name="clock" size={16} className="mt-0.5 shrink-0" />
          {me.freeChange
            ? `This is your free change. After it, you can change again once every ${RENAME_COOLDOWN_DAYS} days.`
            : `After saving you can’t change it again for ${RENAME_COOLDOWN_DAYS} days.`}
        </p>
      </Sheet>
    </Card>
  )
}
