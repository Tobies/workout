// Workout program data — decoded from workout_example.pdf (Plan A & Plan B only).
//
// A plan is an ordered list of "blocks". A block is either a single exercise or a
// superset (exercises done back-to-back, "וישר בלי מנוחה", rest only after the pair),
// repeated for `sets` rounds. Rest is in seconds.
//
// Rep target types (so the System can render them in Hebrew):
//   { type: 'fixed',  value }            → "12 חזרות"
//   { type: 'range',  min, max }         → "8–10 חזרות"
//   { type: 'max' }                      → "מקסימום"
//   { type: 'maxCap', cap }              → "מקסימום עד 15"
//   { type: 'time',   min, max }         → "30–60 שניות"  (max optional → "60 שניות")

export const fixed = (value) => ({ type: 'fixed', value });
export const range = (min, max) => ({ type: 'range', min, max });
export const max = () => ({ type: 'max' });
export const maxCap = (cap) => ({ type: 'maxCap', cap });
export const time = (min, maxv = null) => ({ type: 'time', min, max: maxv });
// Video-guided routine (e.g. the warmup) — no prescribed number, never scaled.
export const routine = () => ({ type: 'routine' });

// Numeric "prescribed max" for a target — used as the default capacity when the
// user didn't log actual reps. Uncapped max() has no number → null (unknown).
export function targetMax(t) {
  switch (t.type) {
    case 'fixed': return t.value;
    case 'range': return t.max;
    case 'maxCap': return t.cap;
    case 'time': return t.max || t.min;
    case 'max': return null;
    default: return null;
  }
}

// Numeric "prescribed minimum" for a target — the floor of a rep prescription.
// Used by the quick "min" log button. No meaningful floor → null (no button).
export function targetMin(t) {
  switch (t.type) {
    case 'fixed': return t.value;
    case 'range': return t.min;
    case 'time': return t.min;
    case 'maxCap': return null; // "up to N" — no prescribed floor
    case 'max': return null;
    default: return null;
  }
}

// Render a rep target as Hebrew text.
export function targetText(t) {
  switch (t.type) {
    case 'fixed': return `${t.value} חזרות`;
    case 'range': return `${t.min}–${t.max} חזרות`;
    case 'max': return 'מקסימום';
    case 'maxCap': return `מקסימום עד ${t.cap}`;
    case 'time': return t.max ? `${t.min}–${t.max} שניות` : `${t.min} שניות`;
    case 'routine': return 'לפי הסרטון';
    default: return '';
  }
}

// ---- Ramp-up scaling -------------------------------------------------------
// Scale one rep/time target by pct (e.g. 75). Returns a NEW target (source data
// is never mutated); floor 1. AMRAP: maxCap's cap scales; pure max() has no
// number, so it's returned unchanged.
export function scaleTarget(t, pct) {
  const r = (n) => Math.max(1, Math.round((n * pct) / 100));
  switch (t.type) {
    case 'fixed': return fixed(r(t.value));
    case 'range': {
      const lo = r(t.min), hi = r(t.max);
      return lo === hi ? fixed(lo) : range(lo, hi); // collapse "2–2" → "2"
    }
    case 'time': return time(r(t.min), t.max == null ? null : r(t.max));
    case 'maxCap': return maxCap(r(t.cap));
    default: return t; // max()
  }
}

// A copy of a plan with every WORK-block target scaled. The warmup (block 0) is
// left untouched. pct >= 100 (or falsy) → the original plan, no scaling.
export function scaledPlan(plan, pct) {
  if (!pct || pct >= 100) return plan;
  return {
    ...plan,
    blocks: plan.blocks.map((b, i) =>
      i === 0
        ? b
        : { ...b, exercises: b.exercises.map((ex) => ({ ...ex, target: scaleTarget(ex.target, pct) })) }
    ),
  };
}

// Human-readable rest text.
export function restText(sec) {
  if (!sec) return 'ללא מנוחה';
  if (sec === 60) return 'דקה';
  if (sec === 90) return 'דקה וחצי';
  if (sec === 150) return '2.5 דקות';
  if (sec % 60 === 0) return `${sec / 60} דקות`;
  return `${sec} שניות`;
}

const WARMUP = 'חימום פלג גוף עליון';

// YouTube technique videos, extracted from the program PDF's link annotations.
// Keyed by the EXACT exercise `name` used in the plans (same matching rule as
// challenge `source`). Challenge steps look up by their `source` name too.
export const VIDEOS = {
  'חימום פלג גוף עליון': 'https://www.youtube.com/watch?v=El-gmBoU8dg',
  // אימון A
  'שכיבות סמיכה בעמידת ידיים על הקיר': 'https://www.youtube.com/watch?v=2kdXPm-oezE',
  'מתח מתפרץ עד החזה': 'https://www.youtube.com/watch?v=lrhNcribv_4',
  'אייסקרים מייקרס': 'https://www.youtube.com/watch?v=xPgSoYaxg_4',
  "השענות לפלאנצ'": 'https://www.youtube.com/watch?v=3Qxpo7PA70o',
  'הרמות דרגון פלאג': 'https://www.youtube.com/watch?v=YLK8faFw77Q',
  'שכיבות סמיכה עם השענות קדימה': 'https://www.youtube.com/watch?v=tAGH8JPK-jQ',
  'מתח רחב': 'https://www.youtube.com/watch?v=M2lCIN3m1RY',
  'מקבילים על מתח': 'https://www.youtube.com/watch?v=yxfd4ni08co',
  'אל סיט על טבעות': 'https://www.youtube.com/watch?v=CZp5TUMmuLU',
  // אימון B
  'מתח אלסיט בפרונציה': 'https://www.youtube.com/watch?v=mIjoSbCWJI8',
  'מתח צמוד': 'https://www.youtube.com/watch?v=GRFvlMRzPvU',
  'מקבילים עם רגליים בטאק': 'https://www.youtube.com/watch?v=AJZLYyLaPOU',
  'מתח סופנציה': 'https://www.youtube.com/watch?v=e3zAvbuHhhc',
  'פשיטות מרפקים': 'https://www.youtube.com/watch?v=D1qCWacZ4lY',
  'הרמות רגליים על מקבילים': 'https://www.youtube.com/watch?v=5Ge69gmRWro',
};

export const videoFor = (name) => VIDEOS[name] || null;

// שלב הבסיס | רמה 3.5 — decoded from the level-3.5 program PDF.
export const PLAN_A = {
  id: 'A',
  name: 'אימון A',
  warmup: WARMUP,
  blocks: [
    // Warmup: the video-guided upper-body routine (no prescribed number, no rest).
    {
      kind: 'single', sets: 1, restSec: 0,
      exercises: [{ name: 'חימום פלג גוף עליון', target: routine() }],
    },
    {
      kind: 'single', sets: 3, restSec: 120,
      exercises: [{ name: 'שכיבות סמיכה בעמידת ידיים על הקיר', target: range(5, 8) }],
    },
    {
      kind: 'single', sets: 4, restSec: 120,
      exercises: [{ name: 'מתח מתפרץ עד החזה', target: range(3, 5) }],
    },
    {
      kind: 'single', sets: 5, restSec: 90,
      exercises: [{ name: 'אייסקרים מייקרס', target: range(2, 4) }],
    },
    {
      // PDF reps line: "פלאנצ' לין: 10-15 שניות" / "דרגון: מקסימום עד 10"
      kind: 'superset', sets: 3, restSec: 90,
      exercises: [
        { name: "השענות לפלאנצ'", target: time(10, 15) },
        { name: 'הרמות דרגון פלאג', target: maxCap(10) },
      ],
    },
    {
      kind: 'superset', sets: 4, restSec: 120,
      exercises: [
        { name: 'שכיבות סמיכה עם השענות קדימה', target: range(8, 12) },
        { name: 'מתח רחב', target: range(8, 12) },
      ],
    },
    {
      kind: 'single', sets: 3, restSec: 120,
      exercises: [{ name: 'מקבילים על מתח', target: maxCap(20) }],
    },
    {
      // "תרגיל בונוס"
      kind: 'single', sets: 2, restSec: 120,
      exercises: [{ name: 'אל סיט על טבעות', target: max() }],
    },
  ],
};

export const PLAN_B = {
  id: 'B',
  name: 'אימון B',
  warmup: WARMUP,
  blocks: [
    {
      kind: 'single', sets: 1, restSec: 0,
      exercises: [{ name: 'חימום פלג גוף עליון', target: routine() }],
    },
    {
      // "מקסימום נקי"
      kind: 'single', sets: 2, restSec: 120,
      exercises: [{ name: 'אייסקרים מייקרס', target: max() }],
    },
    {
      kind: 'single', sets: 2, restSec: 180,
      exercises: [{ name: 'שכיבות סמיכה בעמידת ידיים על הקיר', target: max() }],
    },
    {
      // "מקסימום נקי"
      kind: 'single', sets: 3, restSec: 180,
      exercises: [{ name: 'מתח אלסיט בפרונציה', target: max() }],
    },
    {
      kind: 'superset', sets: 4, restSec: 120,
      exercises: [
        { name: 'מתח צמוד', target: range(8, 12) },
        { name: 'מקבילים עם רגליים בטאק', target: range(8, 12) },
      ],
    },
    {
      // PDF reps line: "מתח: 8-12" / "פשיטות: מקסימום עד 20"
      kind: 'superset', sets: 3, restSec: 120,
      exercises: [
        { name: 'מתח סופנציה', target: range(8, 12) },
        { name: 'פשיטות מרפקים', target: maxCap(20) },
      ],
    },
    {
      kind: 'single', sets: 3, restSec: 180,
      exercises: [{ name: 'הרמות רגליים על מקבילים', target: max() }],
    },
  ],
};

export const PLANS = { A: PLAN_A, B: PLAN_B };

// Total number of sets in a plan (for progress display).
export function totalSets(plan) {
  return plan.blocks.reduce((n, b) => n + b.sets, 0);
}
