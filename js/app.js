// Entry point: home screen + workout-session controller.

import { PLANS, totalSets, targetText, targetMax, restText } from './workouts.js';
import * as store from './state.js';
import { getChallenge, nextChallengeId, reqText } from './challenges.js';
import { startTimer, startStopwatch, fmtClock } from './timer.js';
import { el, clear, systemWindow, systemDialog, notify } from './system.js';
import { fx, unlock, isSoundOn, isHapticOn, toggleSound, toggleHaptic } from './feedback.js';

const app = document.getElementById('app');
let state = store.load();

// ---- Theme (light / dark) --------------------------------------------------

const THEME_KEY = 'slworkout.theme';

function loadTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === 'light' || t === 'dark') return t;
  } catch { /* ignore */ }
  if (typeof window !== 'undefined' && window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
  return 'dark';
}

function currentTheme() {
  const root = document.documentElement;
  return (root && root.getAttribute && root.getAttribute('data-theme')) || 'dark';
}

function applyTheme(t) {
  const root = document.documentElement;
  if (root && root.setAttribute) root.setAttribute('data-theme', t);
  const meta = document.querySelector && document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'light' ? '#eef2f6' : '#0b0f17');
}

function toggleTheme() {
  const next = currentTheme() === 'light' ? 'dark' : 'light';
  try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
  applyTheme(next);
  return next;
}

// ---- Home screen -----------------------------------------------------------

function renderHome() {
  clear(app);
  const plan = PLANS[state.nextPlan];
  const s = store.stats(state);

  const topBar = el('div', { class: 'top-bar' }, [
    el('button', {
      class: 'icon-btn', 'aria-label': 'מצב תצוגה',
      text: currentTheme() === 'light' ? '☀️' : '🌙',
      onClick: (e) => { fx.tap(); const t = toggleTheme(); e.currentTarget.textContent = t === 'light' ? '☀️' : '🌙'; },
    }),
    el('button', {
      class: `icon-btn ${isSoundOn() ? '' : 'off'}`, 'aria-label': 'צליל',
      text: isSoundOn() ? '🔊' : '🔇',
      onClick: (e) => { const on = toggleSound(); e.currentTarget.textContent = on ? '🔊' : '🔇'; e.currentTarget.classList.toggle('off', !on); },
    }),
    el('button', {
      class: `icon-btn ${isHapticOn() ? '' : 'off'}`, 'aria-label': 'רטט',
      text: '📳',
      onClick: (e) => { const on = toggleHaptic(); e.currentTarget.classList.toggle('off', !on); },
    }),
  ]);

  const statWin = systemWindow('נתונים', [
    el('div', { class: 'stage-line', text: 'שלב בסיס · רמה 2.5' }),
    el('div', { class: 'stat-grid' }, [
      statCell('אימונים', s.totalWorkouts),
      statCell('זמן אימון', store.fmtDuration(s.totalTimeSec)),
      statCell('רצף נוכחי', `${s.streak}`),
      statCell('רצף שיא', `${s.longestStreak}`),
      statCell('סטים שהושלמו', s.totalSets),
      statCell('השבוע', `${s.weekCount} / ${store.WEEKLY_GOAL}`),
    ]),
  ]);

  const challenge = getChallenge(state.currentChallenge);
  const goalWin = challenge
    ? buildChallengeCard(challenge)
    : systemWindow('יעד', [el('div', { class: 'goal-done', text: 'עברת את כל האתגרים 🎉' })]);

  const start = systemWindow('המשימה הבאה', [
    el('div', { class: 'next-plan' }, [
      el('div', { class: 'next-label', text: 'אימון הבא' }),
      el('div', { class: 'next-name', text: plan.name }),
      el('div', { class: 'next-sub', text: `${plan.blocks.length} תרגילים · ${totalSets(plan)} סטים` }),
    ]),
    el('button', { class: 'btn btn-primary btn-big', text: 'התחל ⚔', onClick: () => { unlock(); fx.start(); startWorkout(plan); } }),
  ]);

  app.appendChild(el('div', { class: 'view view-home' }, [topBar, statWin, goalWin, start]));

  if (challenge) maybeNotifyReady(challenge);
}

// ---- Rank-up challenge -----------------------------------------------------

function buildChallengeCard(challenge) {
  const r = store.challengeReadiness(state, challenge);
  const rows = challenge.sequence.map((item, i) => {
    const it = r.items[i];
    const capTxt = it.capacity == null ? '—' : String(it.capacity);
    const pct = it.capacity == null ? 0 : Math.min(100, Math.round((it.capacity / item.requirement) * 100));
    return el('div', { class: `goal-row ${it.ready ? 'ready' : ''}` }, [
      el('div', { class: 'goal-mark', text: it.ready ? '✓' : '✗' }),
      el('div', { class: 'goal-info' }, [
        el('div', { class: 'goal-name', text: item.label }),
        el('div', { class: 'goal-req', text: `דרוש ${reqText(item)} · שיא שלך ${capTxt}` }),
        el('div', { class: 'goal-bar' }, [el('div', { class: 'goal-fill', style: `width:${pct}%` })]),
        it.enough ? null : el('div', { class: 'goal-note', text: 'צריך עוד אימונים עם רישום חזרות' }),
      ]),
    ]);
  });

  const verdict = r.ready ? 'מוכן ✓' : `${r.readyCount}/${r.total} מוכנים`;

  const summary = el('summary', { class: 'goal-summary' }, [
    el('div', { class: 'goal-sum-top' }, [
      el('div', { class: 'goal-title', text: challenge.name }),
      el('div', { class: `goal-pct ${r.ready ? 'ok' : ''}`, text: `${r.percent}% מוכן` }),
    ]),
    el('div', { class: 'goal-bar' }, [el('div', { class: `goal-fill ${r.ready ? 'ready' : ''}`, style: `width:${r.percent}%` })]),
  ]);

  const details = el('details', { class: 'goal-details' }, [
    summary,
    el('div', { class: 'goal-body' }, [
      el('div', { class: 'goal-verdict-row' }, [el('span', { class: `goal-verdict ${r.ready ? 'ok' : ''}`, text: verdict })]),
      el('div', { class: 'goal-list' }, rows),
      el('button', {
        class: `btn ${r.ready ? 'btn-primary' : 'btn-ghost'}`, text: 'התחל אתגר ⚔',
        onClick: () => { unlock(); fx.tap(); renderChallengePre(challenge); },
      }),
    ]),
  ]);

  return systemWindow('יעד', [details]);
}

function maybeNotifyReady(challenge) {
  const r = store.challengeReadiness(state, challenge);
  if (r.ready && !state.challengeNotified) {
    state.challengeNotified = true;
    store.save(state);
    fx.levelUp();
    const dlg = systemDialog({
      title: 'אתגר נפתח',
      bodyNodes: [
        el('div', { class: 'summary-line big', text: 'אתה מוכן לאתגר!' }),
        el('div', { class: 'summary-line', text: challenge.name }),
      ],
      actions: [{ label: 'קדימה', kind: 'primary', onClick: () => { fx.tap(); dlg.close(); } }],
    });
  } else if (!r.ready && state.challengeNotified) {
    state.challengeNotified = false;
    store.save(state);
  }
}

function renderChallengePre(challenge) {
  clear(app);
  const condNodes = challenge.conditions.map((c) =>
    el('div', { class: 'cond-row' }, [el('span', { class: 'cond-mark', text: '▸' }), el('span', { text: c })])
  );
  const seqText = challenge.sequence
    .map((s) => (s.kind === 'hold' ? `${s.sec}שנ' ${s.label}` : `${s.count} ${s.label}`))
    .join('  ←  ');

  const win = systemWindow(`⚔ ${challenge.name}`, [
    el('div', { class: 'chal-sub', text: 'תנאים לפני האתגר' }),
    el('div', { class: 'cond-list' }, condNodes),
    el('div', { class: 'chal-seq', text: `הרצף (ברצף, ללא מנוחה): ${seqText}` }),
    el('div', { class: 'sys-actions' }, [
      el('button', { class: 'btn btn-primary', text: 'התחלתי ▶', onClick: () => { fx.start(); renderChallengeStep(challenge, 0); } }),
      el('button', { class: 'btn btn-ghost', text: 'חזרה', onClick: () => { fx.tap(); renderHome(); } }),
    ]),
  ], { class: 'sys-dialog' });

  app.appendChild(el('div', { class: 'view view-challenge' }, [win]));
}

function renderChallengeStep(challenge, idx) {
  clear(app);
  const item = challenge.sequence[idx];
  const total = challenge.sequence.length;
  let handle = null;

  const head = el('div', { class: 'session-head' }, [
    el('div', { class: 'session-plan', text: 'אתגר מעבר' }),
    el('div', { class: 'session-progress', text: `${idx + 1} / ${total}` }),
  ]);

  const advance = () => {
    if (handle) { handle.stop(); handle = null; }
    if (idx + 1 < total) renderChallengeStep(challenge, idx + 1);
    else renderChallengeVerdict(challenge);
  };

  let body;
  if (item.kind === 'hold') {
    const clock = el('div', { class: 'rest-clock', text: `0 / ${item.sec}` });
    const ring = el('div', { class: 'rest-ring' }, [clock]);
    const goBtn = el('button', { class: 'btn btn-primary', text: 'בוצע ✓', onClick: () => { fx.complete(); advance(); } });
    body = [
      el('div', { class: 'chal-move', text: item.label }),
      el('div', { class: 'chal-req', text: `החזק ${item.sec} שניות` }),
      ring,
      el('div', { class: 'sys-actions' }, [goBtn]),
    ];
    handle = startStopwatch((sec) => {
      clock.textContent = `${sec} / ${item.sec}`;
      if (sec >= item.sec) { fx.tick(); ring.classList.add('urgent'); if (handle) { handle.stop(); handle = null; } }
    });
  } else {
    body = [
      el('div', { class: 'chal-move', text: item.label }),
      el('div', { class: 'chal-req', text: `${item.count} חזרות` }),
      el('div', { class: 'sys-actions' }, [
        el('button', { class: 'btn btn-primary', text: 'בוצע ✓', onClick: () => { fx.complete(); advance(); } }),
      ]),
    ];
  }

  const win = systemWindow('⚔ רצף האתגר', body, { class: 'sys-dialog' });
  const abort = el('button', { class: 'link-btn', text: 'בטל אתגר', onClick: () => { if (handle) handle.stop(); fx.tap(); renderHome(); } });
  app.appendChild(el('div', { class: 'view view-challenge' }, [head, win, abort]));
}

function renderChallengeVerdict(challenge) {
  clear(app);
  const win = systemWindow('⚔ סיום אתגר', [
    el('div', { class: 'summary-line big', text: 'עברת את האתגר?' }),
    el('div', { class: 'chal-remind', text: 'זכור: טכניקה נקייה, ברצף, ומצולם ללא קאטים' }),
    el('div', { class: 'sys-actions' }, [
      el('button', { class: 'btn btn-primary', text: 'עברתי ✓', onClick: () => passChallenge(challenge) }),
      el('button', { class: 'btn btn-ghost', text: 'עוד לא', onClick: () => { fx.tap(); renderHome(); } }),
    ]),
  ], { class: 'sys-dialog' });
  app.appendChild(el('div', { class: 'view view-challenge' }, [win]));
}

function passChallenge(challenge) {
  const nextId = nextChallengeId(challenge.id);
  store.recordChallengePass(state, challenge.id, nextId);
  store.save(state);
  fx.levelUp();
  const dlg = systemDialog({
    title: 'שלב הבא',
    bodyNodes: [
      el('div', { class: 'summary-line big', text: `${challenge.name} הושלם!` }),
      el('div', { class: 'levelup', text: nextId ? 'התקדמת לשלב הבא ⬆' : 'סיימת את כל האתגרים 🎉' }),
    ],
    actions: [{ label: 'מצוין', kind: 'primary', onClick: () => { fx.tap(); dlg.close(); renderHome(); } }],
  });
}

function statCell(label, value) {
  return el('div', { class: 'stat-cell' }, [
    el('div', { class: 'stat-value', text: String(value) }),
    el('div', { class: 'stat-label', text: label }),
  ]);
}

// ---- Workout session -------------------------------------------------------

function buildSteps(plan) {
  // Flatten blocks into per-set steps.
  const steps = [];
  plan.blocks.forEach((block, bi) => {
    for (let setNo = 1; setNo <= block.sets; setNo++) {
      steps.push({ block, blockIndex: bi, setNo });
    }
  });
  return steps;
}

function startWorkout(plan) {
  const steps = buildSteps(plan);
  const session = {
    plan,
    steps,
    stepIndex: 0,
    startedAt: Date.now(),
    results: [], // { exercise, target, actual, done }
  };
  renderStep(session);
}

// Count-up hold timer for time-based exercises (e.g. handstand 30–60s).
// Start → counts up; pings at the min target, auto-stops at the max; the held
// seconds are written into `input` so the set logs the real duration.
function makeHoldTimer(target, input) {
  const display = el('div', { class: 'hold-time', text: "0שנ'" });
  const btn = el('button', { class: 'btn btn-ghost hold-btn', text: 'התחל אחיזה ▶' });
  const wrap = el('div', { class: 'hold-timer' }, [display, btn]);

  let sw = null;
  let elapsed = 0;
  let reachedMin = false;

  const stopHold = () => {
    if (sw) { sw.stop(); sw = null; }
    btn.textContent = 'התחל אחיזה ▶';
    wrap.classList.remove('running');
    input.value = String(elapsed);
  };

  btn.addEventListener('click', () => {
    if (sw) { fx.tap(); stopHold(); return; }
    elapsed = 0;
    reachedMin = false;
    display.textContent = "0שנ'";
    wrap.classList.remove('reached');
    wrap.classList.add('running');
    btn.textContent = 'עצור ⏹';
    fx.start();
    sw = startStopwatch((sec) => {
      elapsed = sec;
      display.textContent = `${sec}שנ'`;
      if (!reachedMin && target.min && sec >= target.min) {
        reachedMin = true;
        wrap.classList.add('reached');
        fx.tick();
      }
      if (target.max && sec >= target.max) {
        fx.complete();
        stopHold();
      }
    });
  });

  return wrap;
}

function renderStep(session) {
  clear(app);
  const { block, setNo } = session.steps[session.stepIndex];
  const stepNum = session.stepIndex + 1;
  const stepTotal = session.steps.length;

  const head = el('div', { class: 'session-head' }, [
    el('div', { class: 'session-plan', text: session.plan.name }),
    el('div', { class: 'session-progress', text: `${stepNum} / ${stepTotal}` }),
  ]);
  const progFill = el('div', { class: 'prog-fill', style: `width:${(stepNum - 1) / stepTotal * 100}%` });

  const isSuper = block.kind === 'superset';

  // Optional logging inputs (collapsed by default). Hold-timer auto-fills these for time targets.
  const inputs = block.exercises.map((ex) =>
    el('input', { class: 'rep-input', type: 'number', min: '0', inputmode: 'numeric',
      placeholder: targetText(ex.target),
      'aria-label': `${ex.target.type === 'time' ? 'שניות' : 'חזרות'} בפועל — ${ex.name}` })
  );

  const exNodes = block.exercises.map((ex, i) =>
    el('div', { class: 'ex-row' }, [
      isSuper ? el('div', { class: 'ex-badge', text: String(i + 1) }) : null,
      el('div', { class: 'ex-info' }, [
        el('div', { class: 'ex-name', text: ex.name }),
        el('div', { class: 'ex-target', text: targetText(ex.target) }),
        ex.target.type === 'time' ? makeHoldTimer(ex.target, inputs[i]) : null,
      ]),
    ])
  );

  const logBody = el('div', { class: 'log-body' },
    block.exercises.map((ex, i) =>
      el('label', { class: 'log-line' }, [el('span', { text: ex.name }), inputs[i]])
    )
  );
  const logWrap = el('details', { class: 'rep-log' }, [
    el('summary', { text: 'רישום חזרות (לא חובה)' }),
    logBody,
  ]);

  const title = isSuper ? `סופרסט · סט ${setNo} מתוך ${block.sets}` : `סט ${setNo} מתוך ${block.sets}`;
  const win = systemWindow(`⚔ ${title}`, [
    isSuper ? el('div', { class: 'super-hint', text: 'ברצף — בלי מנוחה בין התרגילים' }) : null,
    el('div', { class: 'ex-list' }, exNodes),
    logWrap,
    el('div', { class: 'sys-actions' }, [
      el('button', { class: 'btn btn-primary', text: 'הושלם ✓',
        onClick: () => { fx.complete(); completeStep(session, block, inputs, true); } }),
      el('button', { class: 'btn btn-ghost', text: 'דלג סט',
        onClick: () => { fx.tap(); completeStep(session, block, inputs, false); } }),
    ]),
  ], { class: 'sys-dialog' });

  const abort = el('button', { class: 'link-btn', text: 'בטל אימון', onClick: () => confirmAbort(session) });

  app.appendChild(el('div', { class: 'view view-session' }, [
    head,
    el('div', { class: 'prog-track' }, [progFill]),
    win,
    abort,
  ]));
}

function completeStep(session, block, inputs, done) {
  block.exercises.forEach((ex, i) => {
    const raw = inputs[i].value.trim();
    const actual = raw === '' ? null : Math.max(0, parseInt(raw, 10) || 0);
    session.results.push({ exercise: ex.name, target: targetText(ex.target), targetMax: targetMax(ex.target), actual, done });
  });

  const last = session.stepIndex >= session.steps.length - 1;
  if (last) {
    finishWorkout(session);
  } else {
    renderRest(session, block.restSec);
  }
}

const RING_R = 80;
const RING_C = 2 * Math.PI * RING_R;

function renderRest(session, restSec) {
  clear(app);
  const next = session.steps[session.stepIndex + 1];
  const nextLabel = next.block.exercises.map((e) => e.name).join(' + ');

  const clock = el('div', { class: 'rest-clock', text: fmtClock(restSec) });
  const svg = el('div', {
    class: 'ring-svg',
    html:
      `<svg viewBox="0 0 180 180" width="180" height="180">` +
      `<circle class="ring-bg" cx="90" cy="90" r="${RING_R}"></circle>` +
      `<circle class="ring-fg" cx="90" cy="90" r="${RING_R}" transform="rotate(-90 90 90)" ` +
      `stroke-dasharray="${RING_C}" stroke-dashoffset="0"></circle>` +
      `</svg>`,
  });
  const ring = el('div', { class: 'rest-ring' }, [svg, clock]);
  const ringFg = ring.querySelector ? ring.querySelector('.ring-fg') : null;

  let handle;
  const proceed = () => {
    if (handle) handle.stop();
    session.stepIndex += 1;
    renderStep(session);
  };

  const win = systemWindow('⏳ מנוחה', [
    ring,
    el('div', { class: 'rest-sub', text: `מנוחה: ${restText(restSec)}` }),
    el('div', { class: 'rest-next', text: `הבא: ${nextLabel}` }),
    el('div', { class: 'sys-actions' }, [
      el('button', { class: 'btn btn-primary', text: 'דלג ⏭', onClick: () => { fx.tap(); proceed(); } }),
    ]),
  ], { class: 'sys-dialog' });

  app.appendChild(el('div', { class: 'view view-rest' }, [win]));

  handle = startTimer(
    restSec,
    (rem) => {
      clock.textContent = fmtClock(rem);
      if (ringFg) ringFg.style.strokeDashoffset = String(RING_C * (1 - rem / restSec));
      if (rem > 0 && rem <= 3) {
        ring.classList.add('urgent');
        fx.tick();
      }
    },
    () => { fx.restEnd(); notify('המנוחה הסתיימה — קדימה!'); proceed(); }
  );
}

function finishWorkout(session) {
  const durationSec = Math.round((Date.now() - session.startedAt) / 1000);
  const record = {
    dateISO: new Date().toISOString(),
    plan: session.plan.id,
    durationSec,
    sets: session.results,
  };
  state.history.push(record);

  // Flip to the other plan.
  state.nextPlan = session.plan.id === 'A' ? 'B' : 'A';
  store.save(state);

  showSummary(session, durationSec);
}

function showSummary(session, durationSec) {
  fx.finish();
  const doneCount = session.results.filter((r) => r.done).length;
  const body = [
    el('div', { class: 'summary-line big', text: `${session.plan.name} הושלם!` }),
    el('div', { class: 'summary-grid' }, [
      statCell('סטים', doneCount),
      statCell('זמן', store.fmtDuration(durationSec)),
    ]),
  ];

  const dlg = systemDialog({
    title: 'אימון הושלם',
    bodyNodes: body,
    actions: [
      { label: 'חזרה', kind: 'primary', onClick: () => { fx.tap(); dlg.close(); renderHome(); } },
    ],
  });
}

function confirmAbort(session) {
  const dlg = systemDialog({
    title: 'ביטול אימון',
    bodyNodes: [el('div', { class: 'summary-line', text: 'לבטל את האימון? ההתקדמות לא תישמר.' })],
    dismissible: true,
    actions: [
      { label: 'המשך אימון', kind: 'ghost', onClick: () => dlg.close() },
      { label: 'בטל', kind: 'primary', onClick: () => { dlg.close(); renderHome(); } },
    ],
  });
}

// ---- Boot ------------------------------------------------------------------

applyTheme(loadTheme());
renderHome();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
