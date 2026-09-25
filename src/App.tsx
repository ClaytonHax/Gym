import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { Spinner } from './components/ui'
import { Icon } from './components/Icon'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { SettingsProvider } from './contexts/SettingsContext'
import { ToastProvider } from './contexts/ToastContext'
import { firebaseConfigured } from './lib/firebase'
import { Body } from './pages/Body'
import { Dashboard } from './pages/Dashboard'
import { History } from './pages/History'
import { Login } from './pages/Login'
import { Progress } from './pages/Progress'
import { SessionDetail } from './pages/SessionDetail'
import { Settings } from './pages/Settings'
import { WorkoutActive } from './pages/WorkoutActive'

/** Shown when the Firebase env vars are missing, instead of a blank crash. */
function SetupNotice() {
  const vars = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID',
  ]
  return (
    <div className="flex min-h-dvh items-center justify-center p-5">
      <div className="card max-w-md p-6">
        <span className="mb-4 grid size-12 place-items-center rounded-xl bg-amber-500/15 text-amber-400">
          <Icon name="settings" size={24} />
        </span>
        <h1 className="font-display text-2xl font-semibold">Firebase not configured</h1>
        <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
          Create a <code className="text-brand-400">.env.local</code> file (copy{' '}
          <code className="text-brand-400">.env.example</code>) and add your Firebase web app
          config, then restart the dev server.
        </p>
        <ul className="mt-4 flex flex-col gap-1 rounded-xl bg-[var(--color-surface-2)] p-3 font-mono text-xs text-[var(--color-fg-muted)]">
          {vars.map((v) => (
            <li key={v}>{v}</li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-[var(--color-fg-muted)]">
          On Vercel, add the same variables under Project → Settings → Environment Variables.
        </p>
      </div>
    </div>
  )
}

function Gate() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-brand-500">
        <Spinner size={32} />
        <span className="sr-only">Loading</span>
      </div>
    )
  }

  if (!user) return <Login />

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/workout" element={<WorkoutActive />} />
        <Route path="/history" element={<History />} />
        <Route path="/history/:id" element={<SessionDetail />} />
        <Route path="/progress" element={<Progress />} />
        <Route path="/body" element={<Body />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  if (!firebaseConfigured) return <SetupNotice />

  return (
    <AuthProvider>
      <SettingsProvider>
        <ToastProvider>
          <Gate />
        </ToastProvider>
      </SettingsProvider>
    </AuthProvider>
  )
}
