// Pure streak decision logic, mirrored by src/lib/streakWatch.ts (keep in sync).
// Input is a `streakWatch` doc plus the user's local date/hour; output is
// { status: 'risk' | 'lost' | null, streak }.

export function parseDay(key) {
  const [y, m, d] = key.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
export function fmtDay(ms) {
  return new Date(ms).toISOString().slice(0, 10)
}
export function addDay(key, n) {
  return fmtDay(parseDay(key) + n * 86400000)
}
/** 0 = Monday. */
export function weekdayIndex(key) {
  return (new Date(parseDay(key)).getUTCDay() + 6) % 7
}
export function mondayOf(key) {
  return addDay(key, -weekdayIndex(key))
}

/** Local { day: 'yyyy-mm-dd', hour } in an IANA timezone (falls back to UTC). */
export function localParts(tz, date = new Date()) {
  const fmt = (zone) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date)
  let parts
  try {
    parts = fmt(tz)
  } catch {
    parts = fmt('UTC')
  }
  const get = (t) => parts.find((p) => p.type === t)?.value ?? '0'
  return { day: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) % 24 }
}

/** Local hours in which the workout reminders may fire, so a UTC cron never pings at 3am. */
export function reminderHour(hour) {
  return hour >= 7 && hour <= 21
}

/** Gap before an unfinished session counts as forgotten (the cron only runs daily). */
export const OPEN_WORKOUT_MS = 3 * 60 * 60 * 1000

/** A session with logged sets that was started long enough ago and never finished. */
export function forgottenWorkout(w, nowMs = Date.now()) {
  if (!w || typeof w.openSince !== 'string' || !w.openSince) return false
  const started = Date.parse(w.openSince)
  return !Number.isNaN(started) && nowMs - started >= OPEN_WORKOUT_MS
}

/**
 * Yesterday was a scheduled training day and nothing was logged for it.
 * The doc is only rewritten when the app syncs, so it may be a few days old.
 */
export function missedPlanDay(w, now) {
  if (!w || typeof w.asOfDay !== 'string' || !Array.isArray(w.planDays)) return false
  const lag = (parseDay(now.day) - parseDay(w.asOfDay)) / 86400000
  if (!(lag >= 0 && lag <= 3)) return false
  if (w.lastWorkoutDay === now.day) return false
  const yesterday = addDay(now.day, -1)
  if (!w.planDays.includes(yesterday)) return false
  if (w.lastWorkoutDay === yesterday || (Array.isArray(w.trainedDays) && w.trainedDays.includes(yesterday))) return false
  return true
}

/**
 * @param w streakWatch doc
 * @param now { day, hour } in the user's timezone
 * @param minHour earliest local hour at which "at risk" fires
 */
export function evaluateWatch(w, now, minHour = 15) {
  const none = { status: null, streak: 0 }
  if (!w || typeof w.asOfDay !== 'string' || typeof w.current !== 'number') return none
  const today = now.day
  const lag = (parseDay(today) - parseDay(w.asOfDay)) / 86400000
  if (!(lag >= 0 && lag <= 2)) return none
  const rest = new Set(Array.isArray(w.restDays) ? w.restDays : [])
  const trainedToday = w.lastWorkoutDay === today

  if (w.unit === 'day') {
    const honoured = (d) => rest.has(d) || w.lastWorkoutDay === d
    let end = honoured(w.asOfDay) ? w.asOfDay : addDay(w.asOfDay, -1)
    let chain = w.current
    // Days since the doc was written count if planned rest or a synced workout.
    for (let d = addDay(w.asOfDay, 1); d < today; d = addDay(d, 1)) {
      if (end === addDay(d, -1) && honoured(d)) {
        chain++
        end = d
      } else break
    }
    const yesterday = addDay(today, -1)
    if (trainedToday || chain < 2) return none
    if (end === yesterday) {
      if (rest.has(today)) return none
      return now.hour >= minHour ? { status: 'risk', streak: chain } : none
    }
    // Chain broke exactly on yesterday: end is the day before it.
    if (end === addDay(yesterday, -1) && !rest.has(yesterday)) return { status: 'lost', streak: chain }
    return none
  }

  // Week mode.
  const goal = Math.max(1, w.weeklyGoal || 1)
  const monday = mondayOf(today)
  if (w.weekStart === monday) {
    if (trainedToday) return none
    const remaining = goal - w.workoutsThisWeek
    const daysLeft = 7 - weekdayIndex(today)
    if (remaining > 0 && remaining >= daysLeft && w.current >= 1) {
      return now.hour >= minHour ? { status: 'risk', streak: w.current } : none
    }
    if (today === monday && w.prevWeekWorkouts < goal && w.streakBeforePrev >= 1) {
      return { status: 'lost', streak: w.streakBeforePrev }
    }
    return none
  }
  if (w.weekStart === addDay(monday, -7) && today === monday) {
    // Doc still from last week: its week total is final.
    if (w.workoutsThisWeek < goal && w.current >= 1) return { status: 'lost', streak: w.current }
  }
  return none
}
