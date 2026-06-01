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

// Render a rep target as Hebrew text.
export function targetText(t) {
  switch (t.type) {
    case 'fixed': return `${t.value} חזרות`;
    case 'range': return `${t.min}–${t.max} חזרות`;
    case 'max': return 'מקסימום';
    case 'maxCap': return `מקסימום עד ${t.cap}`;
    case 'time': return t.max ? `${t.min}–${t.max} שניות` : `${t.min} שניות`;
    default: return '';
  }
}

// Human-readable rest text.
export function restText(sec) {
  if (sec === 60) return 'דקה';
  if (sec === 90) return 'דקה וחצי';
  if (sec % 60 === 0) return `${sec / 60} דקות`;
  return `${sec} שניות`;
}

const WARMUP = 'חימום פלג גוף עליון';

export const PLAN_A = {
  id: 'A',
  name: 'אימון A',
  warmup: WARMUP,
  blocks: [
    {
      kind: 'superset', sets: 1, restSec: 60,
      exercises: [
        { name: 'פלאנק גובה לפייק', target: fixed(5) },
        { name: 'הרמות ברכיים / אל-סיט שלילי', target: fixed(5) },
      ],
    },
    {
      kind: 'single', sets: 4, restSec: 120,
      exercises: [{ name: 'מתח רגיל', target: range(8, 10) }],
    },
    {
      kind: 'single', sets: 3, restSec: 120,
      exercises: [{ name: 'מקבילים', target: fixed(12) }],
    },
    {
      kind: 'superset', sets: 3, restSec: 120,
      exercises: [
        { name: 'דרגון פלאג מלא שלילי', target: range(2, 3) },
        { name: 'הרמות רגליים בתליה ממתח', target: range(10, 12) },
      ],
    },
    {
      kind: 'superset', sets: 3, restSec: 90,
      exercises: [
        { name: 'שכיבות סמיכה פייק בהגבהה', target: maxCap(15) },
        { name: 'מתח סופינציה חצי טווח עליון', target: maxCap(20) },
      ],
    },
    {
      kind: 'single', sets: 2, restSec: 120,
      exercises: [{ name: 'שכיבות סמיכה עם רגליים בהגבהה', target: max() }],
    },
  ],
};

export const PLAN_B = {
  id: 'B',
  name: 'אימון B',
  warmup: WARMUP,
  blocks: [
    {
      kind: 'superset', sets: 1, restSec: 90,
      exercises: [
        { name: 'עמידת ידיים לקיר – 60°', target: time(30, 60) },
        { name: 'הרמות ברכיים בתלייה על מתח', target: range(5, 8) },
      ],
    },
    {
      kind: 'single', sets: 3, restSec: 120,
      exercises: [{ name: 'מתח סופינציה', target: range(10, 12) }],
    },
    {
      kind: 'superset', sets: 3, restSec: 120,
      exercises: [
        { name: 'הרמות דרגון פלאג', target: maxCap(10) },
        { name: 'שכיבות סמיכה השענות קדימה', target: maxCap(10) },
      ],
    },
    {
      kind: 'single', sets: 1, restSec: 120,
      exercises: [{ name: 'מקבילים', target: max() }],
    },
    {
      kind: 'superset', sets: 4, restSec: 90,
      exercises: [
        { name: 'מתח אוסטרלי רחב', target: range(16, 20) },
        { name: 'פשיטות מרפקים', target: range(10, 15) },
      ],
    },
    {
      kind: 'single', sets: 2, restSec: 90,
      exercises: [{ name: 'אל-סיט בתליה ממתח', target: max() }],
    },
  ],
};

export const PLANS = { A: PLAN_A, B: PLAN_B };

// Total number of sets in a plan (for progress display).
export function totalSets(plan) {
  return plan.blocks.reduce((n, b) => n + b.sets, 0);
}
