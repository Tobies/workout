// Persistent state. No fabricated gamification — every stat derives from real
// workout history.

const KEY = 'slworkout.v1';

// Tunables.
export const GRACE_DAYS = 4;        // streak grace: goal is 3×/week (~every 2–3 days)
export const WEEKLY_GOAL = 3;
export const CHALLENGE_STREAK = 2;  // sessions an exercise must clear the bar to count as ready
const DAY = 24 * 60 * 60 * 1000;

const DEFAULT_STATE = () => ({
  nextPlan: 'A',
  history: [], // { dateISO, plan, durationSec, sets:[{ exercise, target, targetMax|null, actual|null, done }] }
  currentChallenge: '2.5',
  challengesPassed: [],
  challengeNotified: false,
});

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_STATE();
    const s = JSON.parse(raw);
    return { ...DEFAULT_STATE(), ...s };
  } catch {
    return DEFAULT_STATE();
  }
}

export function save(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

// ---- Derived stats (real data only) ----------------------------------------

function startOfDay(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Streak with grace period: consecutive sessions whose day-gap to the previous
// session is <= GRACE_DAYS. Returns { current, longest }.
export function streaks(history) {
  if (!history.length) return { current: 0, longest: 0 };
  const days = history
    .map((h) => startOfDay(h.dateISO))
    .sort((a, b) => a - b);

  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    const gap = Math.round((days[i] - days[i - 1]) / DAY);
    if (gap === 0) continue; // same day, doesn't extend or break
    if (gap <= GRACE_DAYS) run += 1;
    else run = 1;
    if (run > longest) longest = run;
  }

  // Current streak: walk back from the last session; also check the gap from the
  // last session until *now* — if we've already blown the grace window, it's broken.
  const now = startOfDay(Date.now());
  const sinceLast = Math.round((now - days[days.length - 1]) / DAY);
  let current;
  if (sinceLast > GRACE_DAYS) {
    current = 0;
  } else {
    current = 1;
    for (let i = days.length - 1; i > 0; i--) {
      const gap = Math.round((days[i] - days[i - 1]) / DAY);
      if (gap === 0) continue;
      if (gap <= GRACE_DAYS) current += 1;
      else break;
    }
  }
  return { current, longest };
}

// Workouts completed in the current calendar week (Sunday-based, matches Israel).
export function thisWeekCount(history) {
  const now = new Date();
  const dow = now.getDay(); // 0 = Sunday
  const weekStart = startOfDay(now.getTime()) - dow * DAY;
  return history.filter((h) => startOfDay(h.dateISO) >= weekStart).length;
}

export function stats(state) {
  const h = state.history;
  const totalWorkouts = h.length;
  const totalTimeSec = h.reduce((n, w) => n + (w.durationSec || 0), 0);
  const totalSets = h.reduce((n, w) => n + w.sets.filter((s) => s.done).length, 0);
  const { current, longest } = streaks(h);
  return {
    totalWorkouts,
    totalTimeSec,
    totalSets,
    streak: current,
    longestStreak: longest,
    weekCount: thisWeekCount(h),
    lastWorkout: totalWorkouts ? h[h.length - 1].dateISO : null,
  };
}

// ---- Rank-up challenge readiness -------------------------------------------

// Best demonstrated capacity for an exercise within one session.
// Uses logged `actual`, else the prescribed `targetMax` (assume the user hit it).
// Returns null if the session gives no usable number (e.g. uncapped max, no log).
function sessionCapacity(session, source) {
  let cap = null;
  for (const s of session.sets || []) {
    if (s.exercise !== source) continue;
    const v = s.actual != null ? s.actual : (s.targetMax != null ? s.targetMax : null);
    if (v != null) cap = cap == null ? v : Math.max(cap, v);
  }
  return cap;
}

// Predict readiness for a challenge. Each sequence item is "ready" only when it
// cleared its requirement in the most recent CHALLENGE_STREAK sessions that have
// data for it (exact threshold, no margin).
export function challengeReadiness(state, challenge) {
  const items = challenge.sequence.map((item) => {
    const caps = []; // newest-first, data sessions only
    for (let i = state.history.length - 1; i >= 0; i--) {
      const c = sessionCapacity(state.history[i], item.source);
      if (c != null) caps.push(c);
    }
    const best = caps.length ? Math.max(...caps) : null;
    const recent = caps.slice(0, CHALLENGE_STREAK);
    const enough = recent.length >= CHALLENGE_STREAK;
    const ready = enough && recent.every((c) => c >= item.requirement);
    return { label: item.label, requirement: item.requirement, capacity: best, sessions: caps.length, enough, ready };
  });
  const readyCount = items.filter((i) => i.ready).length;
  // Overall readiness % = mean of per-move progress (capacity / requirement, capped).
  const pcts = items.map((i) => (i.capacity == null ? 0 : Math.min(100, Math.round((i.capacity / i.requirement) * 100))));
  const percent = items.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / items.length) : 0;
  return { items, readyCount, total: items.length, ready: readyCount === items.length, percent };
}

// Record a passed challenge and advance to the next (nextId from challenges.js).
export function recordChallengePass(state, id, nextId) {
  if (!state.challengesPassed.includes(id)) state.challengesPassed.push(id);
  state.currentChallenge = nextId;
  state.challengeNotified = false;
}

// Format seconds as a Hebrew duration like "1ש' 12ד'" or "12ד'" or "45שנ'".
export function fmtDuration(sec) {
  sec = Math.round(sec);
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = sec % 60;
  if (hrs) return `${hrs}ש' ${mins}ד'`;
  if (mins) return `${mins}ד'`;
  return `${secs}שנ'`;
}
