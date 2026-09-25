import { useState } from 'react'
import { Icon } from '../components/Icon'
import { Button, Field } from '../components/ui'
import { authErrorMessage, useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'

type Mode = 'signin' | 'signup' | 'reset'

const COPY: Record<Mode, { title: string; cta: string; sub: string }> = {
  signin: { title: 'Welcome back', cta: 'Sign in', sub: 'Pick up where you left off.' },
  signup: { title: 'Start training', cta: 'Create account', sub: 'Track every lift from day one.' },
  reset: { title: 'Reset password', cta: 'Send reset link', sub: 'We’ll email you a link.' },
}

export function Login() {
  const { signIn, signUp, signInWithGoogle, resetPassword } = useAuth()
  const toast = useToast()

  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const copy = COPY[mode]

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'signin') await signIn(email, password)
      else if (mode === 'signup') await signUp(name, email, password)
      else {
        await resetPassword(email)
        toast('Reset link sent — check your inbox.')
        setMode('signin')
      }
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function google() {
    setError('')
    setBusy(true)
    try {
      await signInWithGoogle()
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col justify-center overflow-hidden px-5 py-10">
      {/* Decorative energy wash behind the form. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 left-1/2 size-[30rem] -translate-x-1/2
          rounded-full bg-brand-500/20 blur-[100px]"
      />

      <div className="animate-rise relative mx-auto w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-brand-500 text-white shadow-xl shadow-brand-500/30">
            <Icon name="dumbbell" size={32} />
          </span>
          <h1 className="font-display text-4xl font-bold tracking-wide">Gym Tracker</h1>
          <p className="mt-1 text-[var(--color-fg-muted)]">{copy.sub}</p>
        </div>

        <div className="card p-5">
          <h2 className="mb-4 text-xl font-semibold">{copy.title}</h2>

          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            {mode === 'signup' ? (
              <Field
                label="Name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            ) : null}

            <Field
              label="Email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />

            {mode !== 'reset' ? (
              <div className="relative">
                <Field
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
                  className="pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute bottom-0 right-0 grid size-12 place-items-center rounded-xl
                    text-[var(--color-fg-muted)] transition-colors duration-200 hover:text-[var(--color-fg)]"
                >
                  <Icon name={showPassword ? 'eye-off' : 'eye'} size={18} />
                </button>
              </div>
            ) : null}

            {error ? (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-300"
              >
                <Icon name="x" size={16} className="mt-0.5 shrink-0" />
                {error}
              </p>
            ) : null}

            <Button type="submit" size="lg" full loading={busy}>
              {copy.cta}
            </Button>
          </form>

          {mode !== 'reset' ? (
            <>
              <div className="my-4 flex items-center gap-3">
                <span className="h-px flex-1 bg-[var(--color-line)]" />
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
                  or
                </span>
                <span className="h-px flex-1 bg-[var(--color-line)]" />
              </div>
              <Button variant="secondary" size="lg" full icon="google" onClick={google} disabled={busy}>
                Continue with Google
              </Button>
            </>
          ) : null}
        </div>

        <div className="mt-5 flex flex-col items-center gap-2 text-sm">
          {mode === 'signin' ? (
            <>
              <button
                type="button"
                onClick={() => setMode('signup')}
                className="font-semibold text-brand-400 hover:text-brand-300"
              >
                New here? Create an account
              </button>
              <button
                type="button"
                onClick={() => setMode('reset')}
                className="text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
              >
                Forgot your password?
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setMode('signin')}
              className="font-semibold text-brand-400 hover:text-brand-300"
            >
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
