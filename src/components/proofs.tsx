import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './Icon'
import { Button, EmptyState, Field, Skeleton, Sheet, Spinner } from './ui'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { useWorkouts } from '../hooks/useWorkouts'
import {
  deleteProof,
  inBattleRange,
  postProof,
  useChallengeProofs,
  workoutDay,
} from '../hooks/useChallengeProofs'
import { photoToSvg, svgDataUrl, type PhotoSvg } from '../lib/photoSvg'
import { workoutValue, type Challenge, type Proof } from '../lib/social'

/* -------------------------------------------------------------------------- */
/* Shared bits                                                                 */
/* -------------------------------------------------------------------------- */

export const fmtProofDay = (day: string) =>
  new Date(`${day}T12:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

/** Always an <img>, never inline markup, so nothing inside the SVG can run. */
export function ProofImage({
  svg,
  alt,
  className = '',
}: {
  svg: string
  alt: string
  className?: string
}) {
  const src = useMemo(() => svgDataUrl(svg), [svg])
  return (
    <div className={`aspect-[3/4] overflow-hidden rounded-xl bg-[var(--color-surface-2)] ${className}`}>
      <img src={src} alt={alt} loading="lazy" decoding="async" draggable={false} className="size-full object-cover" />
    </div>
  )
}

function captureError(err: unknown): string {
  if ((err as Error)?.message === 'too-large') return 'That photo is too detailed to shrink. Try another shot.'
  return 'Couldn’t read that photo. Try another one.'
}

/**
 * Camera + library pickers that convert the chosen photo into the SVG mosaic and
 * show it. Calls `onChange` with the result (or null while converting / on error).
 */
export function PhotoCapture({
  value,
  onChange,
}: {
  value: PhotoSvg | null
  onChange: (photo: PhotoSvg | null) => void
}) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // A newer pick supersedes one still converting.
  const token = useRef(0)

  async function pick(file: File | undefined) {
    if (!file) return
    const mine = ++token.current
    setBusy(true)
    setError('')
    onChange(null)
    try {
      const photo = await photoToSvg(file)
      if (token.current === mine) onChange(photo)
    } catch (err) {
      if (token.current === mine) setError(captureError(err))
    } finally {
      if (token.current === mine) setBusy(false)
    }
  }

  const inputProps = (capture: boolean) => ({
    type: 'file' as const,
    accept: 'image/*',
    ...(capture ? { capture: 'environment' as const } : {}),
    tabIndex: -1,
    'aria-hidden': true as const,
    className: 'sr-only',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      void pick(e.target.files?.[0])
      e.target.value = ''
    },
  })

  return (
    <div>
      <input ref={cameraRef} {...inputProps(true)} />
      <input ref={libraryRef} {...inputProps(false)} />

      {busy ? (
        <div className="relative mx-auto w-40" role="status" aria-label="Converting photo">
          <Skeleton className="aspect-[3/4] w-full" />
          <span className="absolute inset-0 grid place-items-center text-brand-400">
            <Spinner size={28} />
          </span>
        </div>
      ) : value ? (
        <div className="mx-auto w-40">
          <ProofImage svg={value.svg} alt="Preview of your proof photo" />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className="flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed
            border-brand-500/60 bg-brand-500/10 font-bold text-brand-400 transition-colors duration-200 hover:bg-brand-500/20"
        >
          <Icon name="camera" size={32} />
          Take a photo
        </button>
      )}

      {error ? (
        <p role="alert" className="mt-2 text-center text-xs font-medium text-rose-400">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex gap-2">
        {value || busy ? (
          <Button variant="secondary" full icon="camera" disabled={busy} onClick={() => cameraRef.current?.click()}>
            Retake
          </Button>
        ) : null}
        <Button variant="secondary" full icon="image" disabled={busy} onClick={() => libraryRef.current?.click()}>
          Choose from library
        </Button>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Add proof                                                                   */
/* -------------------------------------------------------------------------- */

function postError(err: unknown): string {
  if (!navigator.onLine || (err as Error)?.message === 'timeout') return 'Couldn’t reach the server. Check your connection and try again.'
  const code = (err as { code?: string })?.code
  if (code === 'permission-denied') return 'That workout can’t be added to this battle.'
  return 'Couldn’t post that proof. Try again.'
}

export function ProofSheet({
  c,
  open,
  onClose,
  fmt,
}: {
  c: Challenge
  open: boolean
  onClose: () => void
  /** Formats a workout's contribution, e.g. "1,200 kg". */
  fmt: (value: number) => string
}) {
  const { user } = useAuth()
  const toast = useToast()
  const { workouts, loading: workoutsLoading } = useWorkouts()
  const { proofs, loading: proofsLoading, error: proofsError } = useChallengeProofs(c.id, open)
  const uid = user?.uid ?? ''
  const [workoutId, setWorkoutId] = useState('')
  const [photo, setPhoto] = useState<PhotoSvg | null>(null)
  const [caption, setCaption] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setWorkoutId('')
      setPhoto(null)
      setCaption('')
      setError('')
    }
  }, [open])

  const eligible = useMemo(() => {
    const proven = new Set(proofs.filter((p) => p.uid === uid).map((p) => p.workoutId))
    return workouts
      .filter((w) => inBattleRange(c, w) && !proven.has(w.id))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  }, [workouts, proofs, uid, c])

  // Default to the newest eligible workout until the user picks one.
  const selected = eligible.find((w) => w.id === workoutId) ?? eligible[0]
  const loading = workoutsLoading || proofsLoading

  async function submit() {
    if (!selected || !photo) return
    setSaving(true)
    setError('')
    try {
      await postProof(c, uid, selected, photo, caption)
      toast('Proof added.')
      onClose()
    } catch (err) {
      setError(postError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add proof"
      footer={
        eligible.length > 0 ? (
          <Button full size="lg" icon="check" loading={saving} disabled={!photo || !selected} onClick={submit}>
            {photo ? 'Post proof' : 'Add a photo first'}
          </Button>
        ) : undefined
      }
    >
      {loading ? (
        <div className="flex flex-col gap-2" role="status" aria-label="Loading workouts">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : proofsError ? (
        <EmptyState icon="wifi-off" title="Couldn’t load this battle" message="Check your connection and try again." />
      ) : eligible.length === 0 ? (
        <EmptyState
          icon="camera"
          title="Nothing to prove yet"
          message="Finish a workout during this battle, or add a photo when you save it. Each workout gets one proof."
        />
      ) : (
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            if (!saving && photo) void submit()
          }}
        >
          <fieldset>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-fg-muted)]">
              Which workout?
            </legend>
            <div role="radiogroup" className="flex flex-col gap-2">
              {eligible.map((w) => {
                const on = selected?.id === w.id
                return (
                  <button
                    key={w.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setWorkoutId(w.id)}
                    className={`flex min-h-14 items-center gap-3 rounded-xl border px-3.5 text-left transition-colors duration-200 ${
                      on
                        ? 'border-brand-500 bg-brand-500/10'
                        : 'border-[var(--color-line)] bg-[var(--color-surface-2)] hover:border-brand-500/60'
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{w.planDayName ?? w.name}</span>
                      <span className="block truncate text-xs text-[var(--color-fg-muted)]">
                        {fmtProofDay(workoutDay(w))}
                      </span>
                    </span>
                    <span className="tabular shrink-0 text-sm font-bold">{fmt(workoutValue(w, c.metric))}</span>
                    {on ? <Icon name="check" size={18} className="shrink-0 text-brand-400" /> : null}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <PhotoCapture value={photo} onChange={setPhoto} />

          <Field
            label="Caption (optional)"
            enterKeyHint="done"
            value={caption}
            maxLength={140}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="New PR on bench…"
            hint={`${caption.length}/140`}
          />

          {error ? (
            <p role="alert" className="text-sm font-medium text-rose-400">
              {error}
            </p>
          ) : null}
        </form>
      )}
    </Sheet>
  )
}

/* -------------------------------------------------------------------------- */
/* Proof wall                                                                  */
/* -------------------------------------------------------------------------- */

export function ProofWall({
  c,
  open,
  onClose,
  nameOf,
  fmt,
  metricLabel,
}: {
  c: Challenge
  open: boolean
  onClose: () => void
  /** Current @username for a uid — never the name stored on the proof. */
  nameOf: (uid: string) => string
  fmt: (value: number) => string
  metricLabel: string
}) {
  const { user } = useAuth()
  const toast = useToast()
  const { proofs, loading, error } = useChallengeProofs(c.id, open)
  const uid = user?.uid ?? ''
  const [viewing, setViewing] = useState<Proof | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!open) {
      setViewing(null)
      setConfirming(false)
    }
  }, [open])

  // Keep the viewer in step if the proof disappears (deleted elsewhere).
  const current = viewing ? (proofs.find((p) => p.id === viewing.id) ?? null) : null

  const groups = useMemo(() => {
    const byUser = new Map<string, Proof[]>()
    for (const p of proofs) byUser.set(p.uid, [...(byUser.get(p.uid) ?? []), p])
    // proofs are newest first, so Map order already puts the freshest player on top.
    return [...byUser.entries()]
  }, [proofs])

  const altFor = (p: Proof) =>
    `Proof photo from ${p.uid === uid ? 'you' : `@${nameOf(p.uid)}`} for ${p.workoutName} on ${fmtProofDay(p.day)}`

  async function remove() {
    if (!current) return
    setDeleting(true)
    try {
      await deleteProof(c.id, current)
      toast('Proof deleted.')
      setViewing(null)
      setConfirming(false)
    } catch {
      toast('Couldn’t delete that proof.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={current ? current.workoutName : 'Proof wall'}
      size="full"
      footer={
        current ? (
          confirming ? (
            <div className="flex gap-3">
              <Button variant="secondary" full disabled={deleting} onClick={() => setConfirming(false)}>
                Keep it
              </Button>
              <Button variant="danger" full icon="trash" loading={deleting} onClick={remove}>
                Delete proof
              </Button>
            </div>
          ) : (
            <div className="flex gap-3">
              <Button variant="secondary" full icon="chevron-left" onClick={() => setViewing(null)}>
                All proofs
              </Button>
              {current.uid === uid ? (
                <Button variant="danger" full icon="trash" onClick={() => setConfirming(true)}>
                  Delete
                </Button>
              ) : null}
            </div>
          )
        ) : undefined
      }
    >
      {current ? (
        <div>
          <ProofImage svg={current.svg} alt={altFor(current)} className="mx-auto w-full max-w-sm" />
          <p className="mt-3 font-semibold">
            {current.uid === uid ? 'You' : `@${nameOf(current.uid)}`}
            <span className="font-normal text-[var(--color-fg-muted)]"> · {fmtProofDay(current.day)}</span>
          </p>
          <p className="tabular text-sm text-[var(--color-fg-muted)]">
            {metricLabel}: <span className="font-bold text-[var(--color-fg)]">{fmt(current.value)}</span>
          </p>
          {current.caption ? <p className="mt-2 break-words text-sm">{current.caption}</p> : null}
          {confirming ? (
            <p role="alert" className="mt-3 text-sm font-medium text-rose-400">
              This workout will stop counting in the battle.
            </p>
          ) : null}
        </div>
      ) : loading ? (
        <div className="grid grid-cols-3 gap-2" role="status" aria-label="Loading proofs">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="aspect-[3/4]" />
          ))}
        </div>
      ) : error ? (
        <EmptyState icon="wifi-off" title="Couldn’t load proofs" message="Check your connection and try again." />
      ) : groups.length === 0 ? (
        <EmptyState
          icon="camera"
          title="No proofs yet"
          message="Photos from the battle show up here. Add one after your next workout."
        />
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map(([who, list]) => (
            <section key={who} aria-label={`Proofs from ${who === uid ? 'you' : `@${nameOf(who)}`}`}>
              <h3 className="mb-2 flex items-baseline justify-between gap-2 text-sm font-bold">
                <span className="truncate">{who === uid ? 'You' : `@${nameOf(who)}`}</span>
                <span className="tabular shrink-0 text-xs font-semibold text-[var(--color-fg-muted)]">
                  {list.length} verified
                </span>
              </h3>
              <ul className="grid grid-cols-3 gap-2">
                {list.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setViewing(p)}
                      className="block w-full rounded-xl outline-none ring-brand-500 transition-transform duration-200 focus-visible:ring-2 active:scale-[0.97]"
                    >
                      <ProofImage svg={p.svg} alt={altFor(p)} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Sheet>
  )
}
