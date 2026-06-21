// Entry point: home screen + workout-session controller.

import { PLANS, totalSets, targetText, targetMax, targetMin, restText, scaledPlan } from './workouts.js';
import * as store from './state.js';
import { getChallenge, nextChallengeId, reqText } from './challenges.js';
import { startTimer, startStopwatch, fmtClock } from './timer.js';
import { el, clear, systemWindow, systemDialog, notify } from './system.js';
import { fx, unlock, isSoundOn, isHapticOn, toggleSound, toggleHaptic } from './feedback.js';

const app = document.getElementById('app');
let state = store.load();

// Per-start workout mode chosen on the home screen (not persisted): 'normal'
// (block-by-block) or 'circuit' (one set of each exercise per round).
let startMode = 'normal';

// ---- Screen wake lock (keep the display awake during a workout) -------------

let _wakeLock = null;
let _wantWake = false;

async function requestWakeLock() {
  _wantWake = true;
  try {
    if (typeof navigator !== 'undefined' && navigator.wakeLock &&
        typeof document !== 'undefined' && document.visibilityState === 'visible') {
      _wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch { /* denied or unsupported — non-fatal */ }
}

function releaseWakeLock() {
  _wantWake = false;
  try { if (_wakeLock && _wakeLock.release) _wakeLock.release(); } catch { /* ignore */ }
  _wakeLock = null;
}

// The OS drops the lock when the tab is hidden; re-acquire it on return.
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('visibilitychange', () => {
    if (_wantWake && document.visibilityState === 'visible') requestWakeLock();
  });
}

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

// ---- Settings (kept off the main UI; opened from the ⚙ button) -------------

// One tappable settings row: label + description + current-mode readout. Tapping
// advances the setting and updates the readout in place (no re-render flicker).
function settingRow(cfg) {
  const stateEl = el('span', { class: 'set-state', text: cfg.value() });
  const row = el('button', { class: 'set-row', 'aria-label': cfg.label }, [
    el('div', { class: 'set-top' }, [
      el('span', { class: 'set-label', text: cfg.icon ? `${cfg.icon} ${cfg.label}` : cfg.label }),
      stateEl,
    ]),
    el('div', { class: 'set-desc', text: cfg.desc }),
  ]);
  const sync = () => { stateEl.textContent = cfg.value(); if (cfg.off) row.classList.toggle('off', cfg.off()); };
  row.addEventListener('click', () => { fx.tap(); cfg.cycle(); sync(); });
  sync();
  return row;
}

function openSettings() {
  const rows = [
    settingRow({
      icon: '🎨', label: 'ערכת נושא', desc: 'מראה האפליקציה — כהה או בהיר.',
      value: () => (currentTheme() === 'light' ? 'בהיר ☀️' : 'כהה 🌙'),
      cycle: () => toggleTheme(),
    }),
    settingRow({
      icon: '🔊', label: 'צליל', desc: 'צלילי משוב בלחיצות, בספירת המנוחה ובסיום אימון.',
      value: () => (isSoundOn() ? 'פעיל 🔊' : 'כבוי 🔇'),
      off: () => !isSoundOn(), cycle: () => toggleSound(),
    }),
    settingRow({
      icon: '📳', label: 'רטט', desc: 'רטט משוב במכשירים תומכים (בעיקר טלפון).',
      value: () => (isHapticOn() ? 'פעיל' : 'כבוי'),
      off: () => !isHapticOn(), cycle: () => toggleHaptic(),
    }),
    settingRow({
      icon: '🎚️', label: 'תצוגת עצימות', desc: 'איך בקרת העצימות (האחוז וכפתורי ה-±) מוצגת במסך הבית.',
      value: () => (state.rampDisplay === 'full' ? 'מלא · כולל +/−' : state.rampDisplay === 'readonly' ? 'תצוגה בלבד' : 'מוסתר'),
      cycle: () => { state.rampDisplay = store.nextRampDisplay(state.rampDisplay); store.save(state); },
    }),
  ];
  const dlg = systemDialog({
    title: 'הגדרות',
    bodyNodes: [
      el('div', { class: 'set-hint', text: 'הקש על הגדרה כדי להחליף מצב' }),
      el('div', { class: 'set-list' }, rows),
    ],
    actions: [{ label: 'סגור', kind: 'primary', onClick: () => { fx.tap(); dlg.close(); renderHome(); } }],
  });
}

// ---- Home screen -----------------------------------------------------------

function renderHome() {
  clear(app);
  releaseWakeLock();
  const plan = PLANS[state.nextPlan];
  const s = store.stats(state);

  const topBar = el('div', { class: 'top-bar' }, [
    el('button', {
      class: 'icon-btn', 'aria-label': 'הגדרות', text: '⚙',
      onClick: () => { fx.tap(); openSettings(); },
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

  const rounds = plan.blocks.reduce((m, b) => Math.max(m, b.sets), 0);
  const scaled = scaledPlan(plan, state.rampPercent); // single choke point for ramp-up scaling
  const modeOpt = (mode, label) => el('button', {
    class: `mode-opt ${startMode === mode ? 'active' : ''}`, text: label,
    onClick: () => { if (startMode !== mode) { fx.tap(); startMode = mode; renderHome(); } },
  });

  // Intensity (ramp-up) widget — its display mode is cycled by the top-bar icon.
  const pctText = state.rampPercent >= 100 ? 'מלא' : `${state.rampPercent}%`;
  const nudgeRamp = (delta) => { fx.tap(); state.rampPercent = store.clampRamp(state.rampPercent + delta); store.save(state); renderHome(); };
  let rampWidget = null;
  if (state.rampDisplay === 'readonly') {
    rampWidget = el('div', { class: 'ramp-row' }, [
      el('span', { class: 'ramp-label', text: 'עצימות' }),
      el('span', { class: 'ramp-val', text: pctText }),
    ]);
  } else if (state.rampDisplay === 'full') {
    rampWidget = el('div', { class: 'ramp-row' }, [
      el('span', { class: 'ramp-label', text: 'עצימות' }),
      el('div', { class: 'ramp-ctl' }, [
        el('button', { class: 'ramp-btn', 'aria-label': 'הפחת עצימות', text: '−', onClick: () => nudgeRamp(-store.RAMP_STEP) }),
        el('span', { class: 'ramp-val', text: pctText }),
        el('button', { class: 'ramp-btn', 'aria-label': 'הגבר עצימות', text: '+', onClick: () => nudgeRamp(store.RAMP_STEP) }),
      ]),
    ]);
  }

  const start = systemWindow('המשימה הבאה', [
    el('div', { class: 'next-plan' }, [
      el('div', { class: 'next-label', text: 'אימון הבא' }),
      el('div', { class: 'next-name', text: plan.name }),
      el('div', { class: 'next-sub', text: `${plan.blocks.length} תרגילים · ${totalSets(plan)} סטים` }),
    ]),
    el('div', { class: 'mode-toggle' }, [
      el('span', { class: 'mode-toggle-label', text: 'מצב' }),
      el('div', { class: 'mode-opts' }, [modeOpt('normal', 'רגיל'), modeOpt('circuit', 'מעגלי 🔄')]),
    ]),
    startMode === 'circuit'
      ? el('div', { class: 'mode-note', text: `סבב בין התרגילים · ${rounds} סבבים` })
      : null,
    rampWidget,
    el('button', { class: 'btn btn-primary btn-big', text: 'התחל ⚔', onClick: () => { unlock(); fx.start(); startWorkout(scaled, startMode); } }),
    el('button', { class: 'btn btn-ghost btn-wide', text: 'תצוגה מקדימה 👁', onClick: () => { fx.tap(); renderPreview(scaled, startMode); } }),
  ]);

  app.appendChild(el('div', { class: 'view view-home' }, [topBar, statWin, goalWin, start]));

  if (challenge) maybeNotifyReady(challenge);
}

// ---- Workout preview (read-only, before starting) --------------------------

function renderPreview(plan, mode = 'normal') {
  clear(app);
  releaseWakeLock();

  const head = el('div', { class: 'session-head' }, [
    el('div', { class: 'session-plan', text: plan.name }),
    el('div', { class: 'session-progress', text: `${plan.blocks.length} תרגילים · ${totalSets(plan)} סטים` }),
  ]);

  const blocks = plan.blocks.map((block, bi) => {
    const isSuper = block.kind === 'superset';
    const exs = block.exercises.map((ex) =>
      el('div', { class: 'pv-ex' }, [
        el('span', { class: 'pv-ex-name', text: ex.name }),
        el('span', { class: 'pv-ex-target', text: targetText(ex.target) }),
      ])
    );
    const meta = `${block.sets} ${block.sets === 1 ? 'סט' : 'סטים'}${isSuper ? ' · סופרסט' : ''} · מנוחה ${restText(block.restSec)}`;
    return el('div', { class: 'pv-block' }, [
      el('div', { class: 'pv-block-head' }, [
        el('span', { class: 'pv-block-no', text: String(bi + 1) }),
        el('span', { class: 'pv-block-meta', text: meta }),
      ]),
      el('div', { class: 'pv-ex-list' }, exs),
    ]);
  });

  const banner = mode === 'circuit'
    ? el('div', { class: 'mode-note', text: '🔄 מצב מעגלי — סבב בין התרגילים' })
    : null;
  const win = systemWindow('👁 תצוגה מקדימה', [banner, el('div', { class: 'pv-list' }, blocks)]);

  const actions = el('div', { class: 'sys-actions' }, [
    el('button', { class: 'btn btn-primary', text: 'התחל ⚔', onClick: () => { unlock(); fx.start(); startWorkout(plan, mode); } }),
    el('button', { class: 'btn btn-ghost', text: 'חזרה', onClick: () => { fx.tap(); renderHome(); } }),
  ]);

  app.appendChild(el('div', { class: 'view view-preview' }, [head, win, actions]));
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
  requestWakeLock();
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

function buildSteps(plan, mode = 'normal') {
  // Flatten blocks into per-set steps.
  //   normal:  all sets of a block before moving to the next block.
  //   circuit: one set of each block per round, repeated; a block leaves the
  //            rotation once its prescribed sets are done. Same total sets —
  //            only the order changes, so stats/history/readiness are unaffected.
  const steps = [];
  if (mode === 'circuit') {
    const rounds = plan.blocks.reduce((m, b) => Math.max(m, b.sets), 0);
    for (let round = 1; round <= rounds; round++) {
      plan.blocks.forEach((block, bi) => {
        if (round <= block.sets) steps.push({ block, blockIndex: bi, setNo: round });
      });
    }
  } else {
    plan.blocks.forEach((block, bi) => {
      for (let setNo = 1; setNo <= block.sets; setNo++) {
        steps.push({ block, blockIndex: bi, setNo });
      }
    });
  }
  return steps;
}

function startWorkout(plan, mode = 'normal') {
  requestWakeLock();
  const steps = buildSteps(plan, mode);
  const session = {
    plan,
    mode,
    rounds: plan.blocks.reduce((m, b) => Math.max(m, b.sets), 0),
    steps,
    stepIndex: 0,
    startedAt: Date.now(),
    results: [],   // { exercise, target, actual, done }
    lastReps: {},  // exercise name -> last reps logged this session (pre-fill source)
  };
  renderStep(session);
}

// Last reps to pre-fill for an exercise: this session first, else real history.
function lastReps(session, name) {
  if (session.lastReps && session.lastReps[name] != null) return session.lastReps[name];
  return store.lastLoggedReps(state.history, name);
}

// Per-exercise rep logging: quick min/max buttons + a custom field, pre-filled
// with the last reps logged for this exercise. Returns { wrap, input }.
function makeRepControl(ex, prefill) {
  const t = ex.target;
  const input = el('input', {
    class: 'rep-input', type: 'number', min: '0', inputmode: 'numeric',
    placeholder: targetText(t),
    'aria-label': `חזרות בפועל — ${ex.name}`,
  });
  if (prefill != null) input.value = String(prefill);

  const setVal = (v) => { fx.tap(); input.value = String(v); };
  const minV = targetMin(t);
  const maxV = targetMax(t);
  const quick = [];
  if (minV != null) quick.push(el('button', { class: 'rep-quick', type: 'button', text: `מינ' ${minV}`, onClick: () => setVal(minV) }));
  if (maxV != null && maxV !== minV) quick.push(el('button', { class: 'rep-quick', type: 'button', text: `מקס' ${maxV}`, onClick: () => setVal(maxV) }));

  const wrap = el('div', { class: 'rep-control' }, [
    quick.length ? el('div', { class: 'rep-quick-row' }, quick) : null,
    el('label', { class: 'rep-custom' }, [el('span', { class: 'rep-custom-label', text: 'חזרות' }), input]),
  ]);
  return { wrap, input };
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
    el('div', { class: 'session-progress', text:
      session.mode === 'circuit' ? `סבב ${setNo}/${session.rounds} · ${stepNum}/${stepTotal}` : `${stepNum} / ${stepTotal}` }),
  ]);
  const progFill = el('div', { class: 'prog-fill', style: `width:${(stepNum - 1) / stepTotal * 100}%` });

  const isSuper = block.kind === 'superset';

  // Per-exercise logging. Time targets keep the count-up hold timer (it auto-fills
  // the seconds); everything else gets quick min/max buttons + a custom field,
  // pre-filled with the last reps logged for that exercise.
  const controls = block.exercises.map((ex) => {
    if (ex.target.type === 'time') {
      const input = el('input', { type: 'hidden' });
      return { wrap: makeHoldTimer(ex.target, input), input };
    }
    return makeRepControl(ex, lastReps(session, ex.name));
  });

  const exNodes = block.exercises.map((ex, i) =>
    el('div', { class: 'ex-row' }, [
      isSuper ? el('div', { class: 'ex-badge', text: String(i + 1) }) : null,
      el('div', { class: 'ex-info' }, [
        el('div', { class: 'ex-name', text: ex.name }),
        el('div', { class: 'ex-target', text: targetText(ex.target) }),
        controls[i].wrap,
      ]),
    ])
  );

  const title = isSuper ? `סופרסט · סט ${setNo} מתוך ${block.sets}` : `סט ${setNo} מתוך ${block.sets}`;
  const win = systemWindow(`⚔ ${title}`, [
    isSuper ? el('div', { class: 'super-hint', text: 'ברצף — בלי מנוחה בין התרגילים' }) : null,
    el('div', { class: 'ex-list' }, exNodes),
    el('div', { class: 'sys-actions' }, [
      el('button', { class: 'btn btn-primary', text: 'הושלם ✓',
        onClick: () => { fx.complete(); completeStep(session, block, controls, true); } }),
      el('button', { class: 'btn btn-ghost', text: 'דלג סט',
        onClick: () => { fx.tap(); completeStep(session, block, controls, false); } }),
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

function completeStep(session, block, controls, done) {
  block.exercises.forEach((ex, i) => {
    const raw = (controls[i].input.value || '').trim();
    const actual = raw === '' ? null : Math.max(0, parseInt(raw, 10) || 0);
    if (actual != null) session.lastReps[ex.name] = actual; // remember for next set / session
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
  releaseWakeLock();

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
    el('div', { class: 'summary-q', text: 'היה מאתגר מספיק?' }),
  ];

  // Post-workout calibration: nudge the ramp-up intensity for next time.
  const adjust = (delta) => {
    if (delta) { state.rampPercent = store.clampRamp(state.rampPercent + delta); store.save(state); }
    fx.tap();
    dlg.close();
    renderHome();
  };

  const dlg = systemDialog({
    title: 'אימון הושלם',
    bodyNodes: body,
    actions: [
      { label: 'קל מדי ⬆', kind: 'ghost', onClick: () => adjust(store.RAMP_STEP) },
      { label: 'בול 👌', kind: 'primary', onClick: () => adjust(0) },
      { label: 'קשה מדי ⬇', kind: 'ghost', onClick: () => adjust(-store.RAMP_STEP) },
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
