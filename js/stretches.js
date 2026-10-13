// Stretching routine (owner's list, 2026-09). Not part of the coach's A/B
// program: never ramp-scaled. Every step is a timed hold; the video links jump
// to that move's moment in the one shared demo clip (`&t=` is honoured by the
// in-app player and the YouTube fallback). Runs standalone (home "מתיחות") and,
// every other workout, inside the session right after the warmup (withStretches).

import { time } from './workouts.js';

const DEMO = 'https://www.youtube.com/watch?v=RnPZylKqQf8';
const at = (sec) => `${DEMO}&t=${sec}s`;

export const STRETCH_ROUTINE = {
  id: 'stretch',
  name: 'מתיחות',
  video: DEMO,
  holdSec: 40,
  prepSec: 15, // countdown before every hold (read which one is next, get into position)
  steps: [
    { name: 'שולחן הפוך', sec: 40, video: at(0) },
    { name: 'כפיפות כתפיים בעמידה עם מקל', sec: 40, video: at(10) },
    { name: 'תלייה גרמנית', sec: 40, video: at(21) },
    { name: 'פשיטת כתפיים כנגד מקביל', sec: 40, video: at(33) },
    { name: 'עמידה בפיסוק זקוף', sec: 40, video: at(40) },
    // "40 שניות כל רגל" → one hold per leg.
    { name: 'הרמת רגל הצידה בעמידה', sec: 40, video: at(50), side: 'ימין' },
    { name: 'הרמת רגל הצידה בעמידה', sec: 40, video: at(50), side: 'שמאל' },
    { name: 'ישיבת שפגט', sec: 40, video: at(56) },
  ],
};

export const stretchTotalSec = (routine) => routine.steps.reduce((n, s) => n + s.sec, 0);

// "הרמת רגל הצידה בעמידה · רגל ימין" / plain name when the move has no side.
export const stepLabel = (step) => (step.side ? `${step.name} · רגל ${step.side}` : step.name);

// The routine as workout blocks: one single-set block per hold, so each hold is
// its own exercise in the session (own card, progress cell, history entry).
// No rest after a hold; instead each hold has a `prepSec` countdown BEFORE it
// (renderRest in prep mode shows the hold, which then starts by itself) — the
// first one included, right after the warmup. `stretch: true` keeps them out
// of set counts and scaling; the exercise carries its own `video` (a timestamp
// into the demo clip).
export const stretchBlocks = (routine = STRETCH_ROUTINE) => routine.steps.map((step) => ({
  kind: 'single', sets: 1, restSec: 0, prepSec: routine.prepSec, stretch: true,
  exercises: [{ name: stepLabel(step), target: time(step.sec), video: step.video }],
}));

// A copy of a plan with the stretch holds right after the warmup (block 0).
// Applied AFTER scaledPlan, so the holds always stay at full length.
export function withStretches(plan, routine = STRETCH_ROUTINE) {
  const [warmup, ...work] = plan.blocks;
  return { ...plan, stretch: true, blocks: [warmup, ...stretchBlocks(routine), ...work] };
}
