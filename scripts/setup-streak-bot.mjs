#!/usr/bin/env node
// One-time setup for the streak bot (run by you, once):
//   node scripts/setup-streak-bot.mjs [--apply-vercel]
// 1. Creates the Firebase Auth user streak-bot@clayton-gym.app with a random password.
// 2. Writes its uid into firestore.rules (replacing __STREAK_BOT_UID__).
// 3. Prints (or, with --apply-vercel, runs) the `vercel env add` commands for
//    BOT_EMAIL, BOT_PASSWORD and CRON_SECRET.
// Then: firebase deploy --only firestore:rules, and redeploy to Vercel.
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const PLACEHOLDER = '__STREAK_BOT_UID__'
const EMAIL = 'streak-bot@clayton-gym.app'
const apply = process.argv.includes('--apply-vercel')

function die(msg) {
  console.error(`\nERROR: ${msg}\n`)
  process.exit(1)
}

function apiKey() {
  if (process.env.VITE_FIREBASE_API_KEY) return process.env.VITE_FIREBASE_API_KEY
  const file = `${root}.env.local`
  if (!existsSync(file)) die('.env.local not found and VITE_FIREBASE_API_KEY not set.')
  const m = readFileSync(file, 'utf8').match(/^\s*VITE_FIREBASE_API_KEY\s*=\s*"?([^"\n\r]+)"?/m)
  if (!m) die('VITE_FIREBASE_API_KEY missing from .env.local.')
  return m[1].trim()
}

const rulesPath = `${root}firestore.rules`
const rules = readFileSync(rulesPath, 'utf8')
if (!rules.includes(PLACEHOLDER)) {
  die(`firestore.rules no longer contains ${PLACEHOLDER}: the bot looks already set up. Nothing was changed.`)
}

const password = randomBytes(24).toString('base64url')
const cronSecret = randomBytes(32).toString('hex')

const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey()}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password, returnSecureToken: false }),
})
const body = await res.json().catch(() => ({}))
if (!res.ok) {
  const code = body?.error?.message ?? res.status
  if (code === 'EMAIL_EXISTS') {
    die(`${EMAIL} already exists. Delete that user in the Firebase console (Authentication) and re-run, or set the uid in firestore.rules by hand.`)
  }
  die(`Sign-up failed: ${code}`)
}
const uid = body.localId
if (!uid) die('Sign-up succeeded but no uid was returned.')

writeFileSync(rulesPath, rules.replaceAll(PLACEHOLDER, uid))
console.log(`Created ${EMAIL} (uid ${uid}) and wrote the uid into firestore.rules.`)

const vars = { BOT_EMAIL: EMAIL, BOT_PASSWORD: password, CRON_SECRET: cronSecret }
const targets = ['production', 'preview']

if (apply) {
  let failed = false
  for (const [name, value] of Object.entries(vars)) {
    for (const target of targets) {
      const r = spawnSync('vercel', ['env', 'add', name, target], { input: value, encoding: 'utf8', cwd: root })
      if (r.status !== 0) {
        failed = true
        console.error(`FAILED: vercel env add ${name} ${target}\n${r.stderr || r.stdout}`)
      } else console.log(`set ${name} (${target})`)
    }
  }
  if (failed) console.error('\nSome variables failed. Add them by hand with the commands below.\n')
}
{
  console.log('\nRun these (the values are shown only now; the bot password is not stored anywhere else):\n')
  for (const [name, value] of Object.entries(vars)) {
    for (const target of targets) console.log(`printf '%s' '${value}' | vercel env add ${name} ${target}`)
  }
}
console.log(`
Next:
  1. firebase deploy --only firestore:rules
  2. Make sure VITE_FIREBASE_API_KEY, VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are set in Vercel
  3. Deploy to Vercel (vercel --prod, or push to main)
  4. Test: curl -H "Authorization: Bearer <CRON_SECRET>" https://clayton-gym.vercel.app/api/streak-check
`)
