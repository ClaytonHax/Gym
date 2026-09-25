# Gym Tracker

A mobile-first PWA for logging workouts, tracking lifted weight and following body
composition over time. React + TypeScript + Vite, with Firebase Auth and Firestore.

## Features

**Training**
- Live workout logger with a running timer, per-set weight/rep steppers and warm-up flags
- Auto-starting rest timer (60/90/120/180s) with vibration + audio alert
- "Last time" targets shown inline, and one-tap copy of your previous session's sets
- Six split templates (Push / Pull / Legs / Upper / Lower / Full Body) plus empty sessions
- 60+ exercise library across 10 muscle groups, extendable with your own movements
- Sessions survive a refresh, a crash or a dead connection — and resume on any device

**Progress**
- Weekly volume, estimated 1RM trends (Epley), muscle-group balance radar
- Automatic personal records per exercise
- Body weight chart with a 7-day moving average, body fat %, BMI and goal tracking
- Every chart has a "View as table" fallback for screen readers

**Platform**
- Installable PWA — full-screen, offline-capable, with an add-to-home-screen prompt
- Offline-first: Firestore persistent cache means sets log fine with no signal and sync later
- kg/lb switching (weights are always stored in kg, so nothing is ever lost in conversion)
- Dark / light / system themes
- JSON export of all your data

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

For the deployed app, add your Vercel domain under
**Authentication → Settings → Authorized domains**, or Google sign-in will be rejected.

### Data model

```
users/{uid}                     profile: displayName, unit, theme, heightCm, goalWeightKg, weeklyGoal
users/{uid}/workouts/{id}       completed sessions (denormalised totalVolumeKg + setCount)
users/{uid}/bodylog/{yyyy-mm-dd}  one weigh-in per day — the date is the document id
users/{uid}/exercises/{id}      custom exercises
users/{uid}/state/activeWorkout the in-progress session, mirrored from localStorage
```

All weights are stored in **kilograms**; conversion happens only at the display edge.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build (needed to test the service worker) |
| `npm run lint` | Type-check only |

## Deployment

Deployed on Vercel from `main`. The six `VITE_FIREBASE_*` variables must be set in
**Project → Settings → Environment Variables** — they're baked in at build time, so a
redeploy is required after changing them.

## Design

Athletic "vibrant block" system: energy orange `#F97316` primary, success green `#22C55E`
for confirming actions, dark slate canvas, Barlow Condensed headings over Barlow body text.
Touch targets are 44px+ throughout, text meets WCAG AA contrast in both themes, and all
motion respects `prefers-reduced-motion`.
