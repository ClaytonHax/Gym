# Gym Tracker

A mobile-first PWA for logging workouts, tracking lifted weight and following body
composition over time. React + TypeScript + Vite, with Firebase Auth and Firestore.

## Features

**Training**
- Live workout logger with a running timer, per-set weight/rep steppers and warm-up flags
- Auto-starting rest timer (60/90/120/180s) with vibration + audio alert
- "Last time" targets shown inline, and one-tap copy of your previous session's sets
- Saved routines (Hevy/Strong-style): tick "Save as a routine" when finishing, relaunch in one tap
- Supersets with a linked-exercise marker; rest timer waits until the last exercise in the group
- Plate calculator (kg or lb bars), per-set RPE, per-exercise notes
- Live PR alert the moment a set beats your best estimated 1RM
- Training plans: start from the built-in Push / Pull / Legs 8-day template (Push 1, Pull 1, Legs 1, Rest, Push 2, Pull 2, Legs 2, Rest) or build a custom cycle, edit days and exercises, and pick a start date. The Home screen shows today's workout, the week ahead, and lets you delay or skip a day
- More plan templates are coming soon
- Routine builder for your own workouts (sets, rep ranges, rest), plus empty sessions
- 75+ exercise library across 10 muscle groups, extendable with your own movements
- Sessions survive a refresh, a crash or a dead connection — and resume on any device

**Progress**
- Streaks and a GitHub-style activity heatmap (planned rest days keep a streak alive; weekly-goal streaks without a plan)
- Weekly volume, estimated 1RM trends (Epley), muscle-group balance radar
- Automatic personal records per exercise
- Muscle recovery card showing what's ready to train again (rule-based, no AI)
- Body weight chart with a 7-day moving average, body fat %, BMI and goal tracking
- Every chart has a "View as table" fallback for screen readers

**Friends**
- Usernames for everyone (auto-assigned on join): one free change, then once every 30 days
- Find friends by username or share an invite link (`/u/username`); requests, accept/decline
- Leaderboards against your friends: workouts, active days, volume, sets, time trained and
  current streak, for this week / this month / all time
- Head-to-head comparison and activity heatmap on every friend's profile
- Feed of friends' workouts (last 30 days) with reactions (Fire / Strong / Beast mode)
- Nudges with preset or custom messages (one per friend per day)
- Battles: 1v1 or up to 5-person challenges on a metric over 3–30 days, scored automatically
- Notifications inbox with unread badges, plus Web Push to installed devices (iPhone needs the
  app added to the Home Screen; there's an illustrated guide). Per-type notification toggles

**Platform**
- Installable PWA — full-screen, offline-capable, with an add-to-home-screen prompt
- Offline-first: Firestore persistent cache means sets log fine with no signal and sync later
- kg/lb switching (weights are always stored in kg, so nothing is ever lost in conversion)
- Dark / light / system themes
- JSON export of all your data, plus a per-set CSV export

## Setup

```bash
npm install
cp .env.example .env.local   # fill in your Firebase web config
npm run dev
```

### Firebase

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com).
2. **Authentication** → Sign-in method → enable **Email/Password** and **Google**.
3. **Firestore Database** → Create database (production mode).
4. Deploy the security rules in [`firestore.rules`](./firestore.rules) — they restrict every
   document to its owner (`users/{uid}/**`).
5. Copy the web app config into `.env.local`.

For the deployed app, add `gym-zim.vercel.app` under
**Authentication → Settings → Authorized domains**, or Google sign-in will be rejected.

### Data model

```
users/{uid}                     profile: displayName, unit, theme, heightCm, goalWeightKg, weeklyGoal
users/{uid}/workouts/{id}       completed sessions (denormalised totalVolumeKg + setCount)
users/{uid}/bodylog/{yyyy-mm-dd}  one weigh-in per day — the date is the document id
users/{uid}/exercises/{id}      custom exercises
users/{uid}/routines/{id}       saved routines
users/{uid}/state/activeWorkout the in-progress session, mirrored from localStorage

profiles/{uid}                  public handle: username, displayName, rename cooldown
usernames/{name}                { uid } — uniqueness lock for usernames
users/{uid}/friends/{uid}       who can see your public docs
users/{uid}/public/stats        friend-readable stats summary (daily totals, streak, top lifts)
users/{uid}/public/push         Web Push subscriptions + notification prefs
users/{uid}/activity/{id}       friend-readable feed card per recent workout (+ reactions)
users/{uid}/notifications/{id}  inbox; friends can create, only you can read
friendRequests/{from_to}        pending requests
challenges/{id}                 battles; each member writes only their own score
```

Everything is enforced in [`firestore.rules`](./firestore.rules) — there's no admin backend.

Identity is **uid-based**: friendships, requests, notifications and challenges all reference uids.
Usernames are display-only (they can change, once free then every 30 days), so a rename never
breaks a friendship. The rules are covered by an emulator test suite: `npm run test:rules`
(needs Java and the Firebase CLI; it starts the Firestore emulator itself).

### Push notifications (free)

Pushes go out from a Vercel serverless function, [`api/push.js`](./api/push.js), using
standard Web Push (VAPID) — no Firebase Cloud Functions or paid plan needed. The function holds
no Firebase credentials: it reads Firestore *as the caller* via their ID token, so the security
rules decide who may push to whom. Set these in Vercel → Environment Variables:

| Variable | Value |
| --- | --- |
| `VAPID_PUBLIC_KEY` | must match `VAPID_PUBLIC_KEY` in `src/lib/push.ts` |
| `VAPID_PRIVATE_KEY` | its private half |

Generate a new pair with `npx web-push generate-vapid-keys` (then update both places).

The push text uses the sender's *current* username, looked up by uid from `profiles/{uid}`
(falling back to the name stored on the notification).

### Streak reminders (free)

A daily Vercel Cron ([`api/streak-check.js`](./api/streak-check.js), 16:00 UTC) warns people whose
streak is about to end (or just ended) and pings their friends ("nudge them?"). It has no admin
credentials: it signs in as a dedicated **streak bot** Firebase user and reads only the small
`streakWatch/{uid}` doc each client keeps (timezone, streak, planned rest days, week counts), plus
friends lists and push subscriptions, all gated by `firestore.rules` (`isBot()`). The in-app
Dashboard card and the Friends highlight work without any of this.

One-time setup:

1. `node scripts/setup-streak-bot.mjs` (add `--apply-vercel` to also run `vercel env add`). It creates
   `streak-bot@clayton-gym.app`, writes its uid into `firestore.rules` and prints the env commands
   for `BOT_EMAIL`, `BOT_PASSWORD` and `CRON_SECRET` (production and preview).
2. `firebase deploy --only firestore:rules`
3. Make sure `VITE_FIREBASE_API_KEY` and the VAPID keys are set in Vercel, then deploy (push to `main`).
4. Test: `curl -H "Authorization: Bearer $CRON_SECRET" https://clayton-gym.vercel.app/api/streak-check`

Until step 1 the rules contain the placeholder `__STREAK_BOT_UID__`, which matches nobody.

All weights are stored in **kilograms**; conversion happens only at the display edge.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build (needed to test the service worker) |
| `npm run lint` | Type-check only |
| `npm run test:rules` | Firestore security-rules tests against the local emulator |

## Deployment

Live at **https://gym-zim.vercel.app**, deployed on Vercel from `main`.
The six `VITE_FIREBASE_*` variables must be set in
**Project → Settings → Environment Variables** — they're baked in at build time, so a
redeploy is required after changing them.

## Design

Athletic "vibrant block" system: energy orange `#F97316` primary, success green `#22C55E`
for confirming actions, dark slate canvas, Barlow Condensed headings over Barlow body text.
Touch targets are 44px+ throughout, text meets WCAG AA contrast in both themes, and all
motion respects `prefers-reduced-motion`.
