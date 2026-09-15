// Daily stretching routine (owner's list, 2026-09). Not part of the coach's
// A/B program: never ramp-scaled, never counted as a workout. Every step is a
// timed hold; the video links jump to that move's moment in the one shared
// demo clip (`&t=` is honoured by the in-app player and the YouTube fallback).

const DEMO = 'https://www.youtube.com/watch?v=RnPZylKqQf8';
const at = (sec) => `${DEMO}&t=${sec}s`;

export const STRETCH_ROUTINE = {
  id: 'stretch',
  name: 'מתיחות',
  video: DEMO,
  holdSec: 40,
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
