// Entry point: home screen + workout-session controller.

import { PLANS, totalSets, targetText, targetMax, targetMin, restText, scaledPlan, videoFor } from './workouts.js';
import * as store from './state.js';
import { getChallenge, nextChallengeId, reqText } from './challenges.js';
import { startTimer, startStopwatch, fmtClock } from './timer.js';
import { el, clear, systemWindow, systemDialog, notify } from './system.js';
import { ICONS } from './icons.js';
import { fx, unlock, isSoundOn, isHapticOn, toggleSound, toggleHaptic } from './feedback.js';
import { STRETCH_ROUTINE, stretchTotalSec, stepLabel } from './stretches.js';
import * as push from './push.js';

const app = document.getElementById('app');
let state = store.load();

// Workout mode — 'normal' (block by block) or 'circuit' (one set of each
// exercise per round) — is a persisted setting (`state.workoutMode`, Settings).
const workoutMode = () => (state.workoutMode === 'circuit' ? 'circuit' : 'normal');

// ---- Screen wake lock (keep the display awake during a workout) -------------

let _wakeLock = null;
let _wantWake = false;
let _wakeReqInFlight = false;

async function requestWakeLock() {
  _wantWake = true;
  if (_wakeLock || _wakeReqInFlight) return;
  if (!(typeof navigator !== 'undefined' && navigator.wakeLock &&
        typeof document !== 'undefined' && document.visibilityState === 'visible')) return;
  _wakeReqInFlight = true;
  try {
    const lock = await navigator.wakeLock.request('screen');
    // The UA may release the lock on its own while the page stays visible
    // (battery saver, system pressure) — no visibilitychange fires, so
    // re-acquire from the sentinel's own release event.
    lock.addEventListener('release', () => {
      if (_wakeLock === lock) _wakeLock = null;
      if (_wantWake && document.visibilityState === 'visible') requestWakeLock();
    });
    if (_wantWake) {
      _wakeLock = lock;
    } else {
      // Released while the request was in flight — don't keep a stray lock.
      try { lock.release(); } catch { /* ignore */ }
    }
  } catch { /* denied or unsupported — non-fatal */ } finally {
    _wakeReqInFlight = false;
  }
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
  if (meta) meta.setAttribute('content', t === 'light' ? '#faf7f0' : '#211e1a');
}

function toggleTheme() {
  const next = currentTheme() === 'light' ? 'dark' : 'light';
  try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
  applyTheme(next);
  return next;
}

// ---- Settings (kept off the main UI; opened from the ⚙ button) -------------

// Icons are hand-drawn SVG strings (icons.js); a function picks one by state.
const iconHtml = (icon) => (typeof icon === 'function' ? icon() : icon);

// Icon + text node for settings rows (`set-label`) and dialog titles (`title-ico`).
function iconLabel(icon, text, cls = 'set-label') {
  return el('span', { class: cls }, [el('span', { class: 'set-ico', html: iconHtml(icon) }), text]);
}

// One tappable settings row: icon + label + description + current-mode readout.
// Tapping advances the setting and updates the readout (and a state-dependent
// icon, e.g. sun/moon) in place — no re-render flicker.
function settingRow(cfg) {
  const stateEl = el('span', { class: 'set-state', text: cfg.value() });
  const icoEl = cfg.icon ? el('span', { class: 'set-ico', html: iconHtml(cfg.icon) }) : null;
  const row = el('button', { class: 'set-row', 'aria-label': cfg.label }, [
    el('div', { class: 'set-top' }, [
      el('span', { class: 'set-label' }, [icoEl, cfg.label]),
      stateEl,
    ]),
    el('div', { class: 'set-desc', text: cfg.desc }),
  ]);
  const sync = () => {
    stateEl.textContent = cfg.value();
    if (icoEl) icoEl.innerHTML = iconHtml(cfg.icon);
    if (cfg.off) row.classList.toggle('off', cfg.off());
  };
  row.addEventListener('click', () => { fx.tap(); cfg.cycle(); sync(); });
  sync();
  return row;
}

// Intensity (ramp-up) stepper row for the settings sheet: −/+ adjust
// `rampPercent` in place (also auto-nudged by the post-workout prompt).
function intensityRow() {
  const pctText = () => (state.rampPercent >= 100 ? 'מלא' : `${state.rampPercent}%`);
  const val = el('span', { class: 'ramp-val', text: pctText() });
  const nudge = (delta) => {
    fx.tap();
    state.rampPercent = store.clampRamp(state.rampPercent + delta);
    store.save(state);
    val.textContent = pctText();
  };
  return el('div', { class: 'set-row' }, [
    el('div', { class: 'set-top' }, [
      iconLabel(ICONS.gauge, 'עצימות'),
      el('div', { class: 'ramp-ctl' }, [
        el('button', { class: 'ramp-btn', 'aria-label': 'הפחת עצימות', text: '−', onClick: () => nudge(-store.RAMP_STEP) }),
        val,
        el('button', { class: 'ramp-btn', 'aria-label': 'הגבר עצימות', text: '+', onClick: () => nudge(store.RAMP_STEP) }),
      ]),
    ]),
    el('div', { class: 'set-desc', text: 'כמה מהתוכנית המלאה לבצע. מתכוונן גם אוטומטית לפי המשוב בסוף כל אימון.' }),
  ]);
}

// ---- Backup: export / import (opened from Settings) ------------------------
// localStorage is per-browser, so moving between browsers (Edge ↔ Chrome) or
// devices needs a manual copy. The backup is a JSON envelope of the raw
// localStorage values — restored verbatim, no reinterpretation.

const BACKUP_KEYS = ['slworkout.v1', 'slworkout.prefs', 'slworkout.theme'];

function exportBackup() {
  const data = {};
  for (const k of BACKUP_KEYS) {
    try {
      const v = localStorage.getItem(k);
      if (v !== null) data[k] = v;
    } catch { /* ignore */ }
  }
  return JSON.stringify({ app: 'slworkout-backup', v: 1, exported: new Date().toISOString(), data });
}

// Copy a readonly textarea's content: async clipboard API, else select+execCommand.
async function copyFromTextarea(ta) {
  const text = ta.value || ta.textContent;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      ta.select();
      if (document.execCommand) document.execCommand('copy');
    }
    notify('הועתק ✓');
  } catch { notify('העתקה נכשלה — סמן את הטקסט והעתק ידנית'); }
}

function openExport() {
  const ta = el('textarea', { class: 'io-text', readonly: true, text: exportBackup() });
  const dlg = systemDialog({
    title: iconLabel(ICONS.export, 'ייצוא נתונים', 'title-ico'),
    bodyNodes: [
      el('div', { class: 'set-hint', text: 'העתק את הטקסט ושמור אותו, או הדבק אותו בדפדפן/מכשיר אחר תחת "ייבוא נתונים".' }),
      ta,
    ],
    actions: [
      { label: 'העתק', icon: ICONS.copy, kind: 'primary', onClick: () => { fx.tap(); copyFromTextarea(ta); } },
      { label: 'סגור', kind: 'ghost', onClick: () => { fx.tap(); dlg.close(); } },
    ],
  });
}

function openImport() {
  const ta = el('textarea', { class: 'io-text', placeholder: 'הדבק כאן את טקסט הגיבוי…' });
  const dlg = systemDialog({
    title: iconLabel(ICONS.import, 'ייבוא נתונים', 'title-ico'),
    bodyNodes: [
      el('div', { class: 'set-hint', text: 'הדבק גיבוי שיוצא מהאפליקציה. השחזור מחליף את כל הנתונים בדפדפן הזה.' }),
      ta,
    ],
    actions: [
      { label: 'שחזר', kind: 'primary', onClick: () => {
        fx.tap();
        tryImport(ta.value !== undefined && ta.value !== '' ? ta.value : ta.textContent, dlg);
      } },
      { label: 'ביטול', kind: 'ghost', onClick: () => { fx.tap(); dlg.close(); } },
    ],
  });
}

function tryImport(raw, importDlg) {
  let backup = null;
  try { backup = JSON.parse(String(raw || '').trim()); } catch { /* handled below */ }
  if (!backup || backup.app !== 'slworkout-backup' || !backup.data || typeof backup.data !== 'object') {
    notify('גיבוי לא תקין');
    return;
  }
  const countWorkouts = (json) => {
    try {
      const h = JSON.parse(json).history;
      return Array.isArray(h) ? h.length : 0;
    } catch { return 0; }
  };
  const incoming = typeof backup.data['slworkout.v1'] === 'string' ? countWorkouts(backup.data['slworkout.v1']) : 0;
  const confirm = systemDialog({
    title: 'שחזור גיבוי',
    bodyNodes: [
      el('div', { class: 'summary-line', text: `בגיבוי ${incoming} אימונים; הוא יחליף את ${state.history.length} האימונים שכאן.` }),
      el('div', { class: 'set-hint', text: 'אי אפשר לבטל את הפעולה.' }),
    ],
    actions: [
      { label: 'שחזר ✓', kind: 'primary', onClick: () => {
        for (const k of BACKUP_KEYS) {
          if (typeof backup.data[k] === 'string') {
            try { localStorage.setItem(k, backup.data[k]); } catch { /* ignore */ }
          }
        }
        // Reload so every module (state, feedback prefs, theme) re-reads storage.
        if (typeof location !== 'undefined' && location.reload) { location.reload(); return; }
        confirm.close(); importDlg.close();
        state = store.load();
        applyTheme(loadTheme());
        renderHome();
        notify('הגיבוי שוחזר ✓');
      } },
      { label: 'ביטול', kind: 'ghost', onClick: () => { fx.tap(); confirm.close(); } },
    ],
  });
}

function openSettings() {
  // A row that opens a dialog instead of cycling a value (backup, reminder).
  const openRow = (icon, label, desc, onClick) => {
    const row = el('button', { class: 'set-row', 'aria-label': label }, [
      el('div', { class: 'set-top' }, [iconLabel(icon, label)]),
      el('div', { class: 'set-desc', text: desc }),
    ]);
    row.addEventListener('click', () => { fx.tap(); onClick(); });
    return row;
  };
  const rows = [
    settingRow({
      icon: () => (currentTheme() === 'light' ? ICONS.sun : ICONS.moon),
      label: 'ערכת נושא', desc: 'מראה האפליקציה — כהה או בהיר.',
      value: () => (currentTheme() === 'light' ? 'בהיר' : 'כהה'),
      cycle: () => toggleTheme(),
    }),
    settingRow({
      icon: () => (isSoundOn() ? ICONS.speaker : ICONS.speakerOff),
      label: 'צליל', desc: 'צלילי משוב בלחיצות, בספירת המנוחה ובסיום אימון.',
      value: () => (isSoundOn() ? 'פעיל' : 'כבוי'),
      off: () => !isSoundOn(), cycle: () => toggleSound(),
    }),
    settingRow({
      icon: ICONS.vibrate, label: 'רטט', desc: 'רטט משוב במכשירים תומכים (בעיקר טלפון).',
      value: () => (isHapticOn() ? 'פעיל' : 'כבוי'),
      off: () => !isHapticOn(), cycle: () => toggleHaptic(),
    }),
    settingRow({
      icon: () => (workoutMode() === 'circuit' ? ICONS.shoe : ICONS.muscle),
      label: 'מצב אימון', desc: 'רגיל — כל הסטים של תרגיל ברצף. מעגלי — סבב של סט אחד מכל תרגיל.',
      value: () => (workoutMode() === 'circuit' ? 'מעגלי' : 'רגיל'),
      cycle: () => { state.workoutMode = workoutMode() === 'circuit' ? 'normal' : 'circuit'; store.save(state); },
    }),
    intensityRow(),
    reminderRow(),
    openRow(ICONS.export, 'ייצוא נתונים', 'העתקת כל הנתונים כטקסט — להעברה לדפדפן או מכשיר אחר.', openExport),
    openRow(ICONS.import, 'ייבוא נתונים', 'שחזור מגיבוי שיוצא בעבר. מחליף את הנתונים הקיימים.', openImport),
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

// ---- Stretch reminder (Web Push, opened from Settings) ---------------------
// js/push.js: the browser subscribes here; the reminder itself is sent by the
// repo's GitHub Actions cron, so the owner pastes this device's subscription
// into the PUSH_SUBSCRIPTIONS secret once. Quiet notification, 9:00 daily.

const REMINDER_STATE = { on: 'פעיל', off: 'כבוי', blocked: 'חסום', unsupported: 'לא נתמך' };

function reminderRow() {
  const stateEl = el('span', { class: 'set-state', text: '…' });
  const row = el('button', { class: 'set-row', 'aria-label': 'תזכורת מתיחות' }, [
    el('div', { class: 'set-top' }, [iconLabel(ICONS.bell, 'תזכורת מתיחות'), stateEl]),
    el('div', { class: 'set-desc', text: 'התראה שקטה כל בוקר ב-9:00 — זמן למתיחות.' }),
  ]);
  const refresh = () => push.status().then((s) => {
    stateEl.textContent = REMINDER_STATE[s] || s;
    row.classList.toggle('off', s !== 'on');
  });
  row.addEventListener('click', () => { fx.tap(); openReminder(refresh); });
  refresh();
  return row;
}

function openReminder(onChange) {
  const box = el('div', { class: 'rem-box' });
  const dlg = systemDialog({
    title: iconLabel(ICONS.bell, 'תזכורת מתיחות', 'title-ico'),
    bodyNodes: [box],
    actions: [{ label: 'סגור', kind: 'primary', onClick: () => { fx.tap(); dlg.close(); if (onChange) onChange(); } }],
  });
  const hint = (text) => el('div', { class: 'set-hint', text });

  // Re-rendered in place after subscribe/unsubscribe.
  const render = async () => {
    const s = await push.status();
    clear(box);
    if (s === 'unsupported') {
      box.appendChild(hint('הדפדפן הזה לא תומך בהתראות. באייפון: הוסף את האפליקציה למסך הבית ופתח אותה משם. באנדרואיד ובמחשב: Chrome או Edge.'));
    } else if (s === 'blocked') {
      box.appendChild(hint('ההתראות חסומות לאתר הזה בדפדפן. אפשר אותן בהגדרות האתר ונסה שוב.'));
    } else if (s === 'off') {
      box.appendChild(hint('לאפליקציה אין שרת, אז את התזכורת שולח GitHub. ההפעלה יוצרת "מנוי" למכשיר הזה — טקסט שמעתיקים פעם אחת ל-Secret בשם PUSH_SUBSCRIPTIONS במאגר. משם תגיע התראה שקטה כל בוקר ב-9:00.'));
      box.appendChild(el('div', { class: 'sys-actions' }, [
        el('button', { class: 'btn btn-primary', text: 'הפעל תזכורת', onClick: async () => {
          fx.tap();
          try {
            await push.subscribe();
            notify('התזכורת הופעלה במכשיר הזה');
          } catch (e) {
            notify(e && e.message === 'denied' ? 'ההרשאה להתראות נדחתה' : 'ההרשמה נכשלה — נסה שוב');
          }
          render();
        } }),
      ]));
    } else {
      const sub = await push.getSubscription();
      const ta = el('textarea', { class: 'io-text', readonly: true, text: push.subscriptionText(sub) });
      box.appendChild(hint('המנוי של המכשיר הזה. העתק אותו ל-GitHub: Settings ← Secrets and variables ← Actions ← PUSH_SUBSCRIPTIONS. כמה מכשירים? רשימת JSON: [מנוי, מנוי].'));
      box.appendChild(ta);
      box.appendChild(el('div', { class: 'sys-actions' }, [
        el('button', { class: 'btn btn-primary', 'aria-label': 'העתק מנוי', onClick: () => { fx.tap(); copyFromTextarea(ta); } }, [
          el('span', { class: 'btn-ico', html: ICONS.copy }),
          'העתק',
        ]),
        el('button', { class: 'btn btn-ghost', text: 'בדיקה', onClick: async () => {
          fx.tap();
          try { await push.showTest(); } catch { notify('לא ניתן להציג התראה'); }
        } }),
      ]));
      box.appendChild(el('button', { class: 'link-btn', text: 'בטל תזכורת במכשיר הזה', onClick: async () => {
        fx.tap();
        await push.unsubscribe();
        notify('התזכורת בוטלה במכשיר הזה');
        render();
      } }));
    }
  };
  render();
}

// ---- Home screen -----------------------------------------------------------

function renderHome() {
  clear(app);
  releaseWakeLock();
  const plan = PLANS[state.nextPlan];
  const s = store.stats(state);
  const challenge = getChallenge(state.currentChallenge);
  const readiness = challenge ? store.challengeReadiness(state, challenge) : null;
  const rounds = plan.blocks.reduce((m, b) => Math.max(m, b.sets), 0);
  const scaled = scaledPlan(plan, state.rampPercent); // single choke point for ramp-up scaling
  const mode = workoutMode();

  // Top bar. RTL: first child sits on the physical RIGHT → workouts chip
  // top-right, settings top-left.
  const topBar = el('div', { class: 'home-top' }, [
    el('button', {
      class: 'icon-round stat-chip', 'aria-label': 'נתונים',
      onClick: () => { fx.tap(); openStats(); },
    }, [
      el('span', { class: 'chip-icon', html: ICONS.dumbbell }),
      el('span', { class: 'chip-num', text: String(s.totalWorkouts) }),
    ]),
    el('button', {
      class: 'icon-round', 'aria-label': 'הגדרות', html: ICONS.gear,
      onClick: () => { fx.tap(); openSettings(); },
    }),
  ]);

  // Hero: the next workout.
  const hero = el('div', { class: 'hero' }, [
    el('div', { class: 'hero-label', text: 'האימון הבא' }),
    el('div', { class: 'hero-name', text: plan.name }),
    el('div', { class: 'hero-sub', text: `${plan.blocks.length} תרגילים · ${totalSets(plan)} סטים` }),
    mode === 'circuit'
      ? el('div', { class: 'mode-note' }, [el('span', { class: 'inline-ico', html: ICONS.shoe }), `מצב מעגלי · ${rounds} סבבים`])
      : null,
  ]);

  const startBtn = el('button', {
    class: 'btn btn-start', text: 'התחל אימון',
    onClick: () => { unlock(); fx.start(); startWorkout(scaled, mode); },
  });

  // Bottom action row: preview · stretching · challenge (workout mode is in Settings).
  const actionBtn = (icon, label, onClick, aria) => el('div', { class: 'action-item' }, [
    el('button', { class: 'action-btn', 'aria-label': aria || label, html: icon, onClick }),
    el('div', { class: 'action-label', text: label }),
  ]);
  const actions = el('div', { class: 'action-row' }, [
    actionBtn(ICONS.spyglass, 'תצוגה מקדימה', () => { fx.tap(); renderPreview(scaled, mode); }),
    actionBtn(ICONS.stretch, 'מתיחות', () => { fx.tap(); renderStretchPre(); }),
    actionBtn(ICONS.swords, readiness ? `אתגר · ${readiness.percent}%` : 'אתגר', () => { fx.tap(); openChallenge(); }),
  ]);

  app.appendChild(el('div', { class: 'view view-home' }, [topBar, hero, startBtn, actions]));

  if (challenge) maybeNotifyReady(challenge);
}

// Stats dialog (opened from the top-right workouts chip).
function openStats() {
  const s = store.stats(state);
  const st = store.stretchStats(state);
  const dlg = systemDialog({
    title: 'נתונים',
    bodyNodes: [
      el('div', { class: 'stage-line', text: 'שלב בסיס · רמה 3' }),
      el('div', { class: 'stat-grid' }, [
        statCell('אימונים', s.totalWorkouts),
        statCell('זמן אימון', store.fmtDuration(s.totalTimeSec)),
        statCell('רצף נוכחי', `${s.streak}`),
        statCell('רצף שיא', `${s.longestStreak}`),
        statCell('סטים שהושלמו', s.totalSets),
        statCell('השבוע', `${s.weekCount} / ${store.WEEKLY_GOAL}`),
        // Stretching runs — logged separately, never counted as workouts.
        statCell('מתיחות', st.total),
        statCell('מתיחות השבוע', st.weekCount),
        statCell('זמן מתיחות', store.fmtDuration(st.totalTimeSec)),
      ]),
    ],
    actions: [{ label: 'סגור', kind: 'primary', onClick: () => { fx.tap(); dlg.close(); } }],
  });
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
        el('span', { class: 'pv-ex-name' }, [ex.name, ' ', videoLink(ex.name, 'video-link pv-video')]),
        el('span', { class: 'pv-ex-target', text: targetText(ex.target) }),
      ])
    );
    const meta = `${block.sets} ${block.sets === 1 ? 'סט' : 'סטים'}${isSuper ? ' · סופרסט' : ''}` +
      (block.restSec ? ` · מנוחה ${restText(block.restSec)}` : '');
    return el('div', { class: 'pv-block' }, [
      el('div', { class: 'pv-block-head' }, [
        el('span', { class: 'pv-block-no', text: String(bi + 1) }),
        el('span', { class: 'pv-block-meta', text: meta }),
      ]),
      el('div', { class: 'pv-ex-list' }, exs),
    ]);
  });

  const banner = mode === 'circuit'
    ? el('div', { class: 'mode-note' }, [el('span', { class: 'inline-ico', html: ICONS.shoe }), 'מצב מעגלי — סבב בין התרגילים'])
    : null;
  const win = systemWindow('👁 תצוגה מקדימה', [banner, el('div', { class: 'pv-list' }, blocks)]);

  // Peek at the other workout too. Only the upcoming plan can be started from
  // here — the other one is a read-only reference.
  const isNext = plan.id === state.nextPlan;
  const otherId = plan.id === 'A' ? 'B' : 'A';
  const switchBtn = el('button', {
    class: 'btn btn-ghost btn-wide pv-switch', type: 'button',
    text: `הצג את ${PLANS[otherId].name} ⇄`,
    onClick: () => { fx.tap(); renderPreview(scaledPlan(PLANS[otherId], state.rampPercent), mode); },
  });
  const note = isNext ? null : el('div', { class: 'pv-other-note', text: 'לעיון בלבד — זה לא האימון הבא' });

  const actions = el('div', { class: 'sys-actions' }, [
    isNext
      ? el('button', { class: 'btn btn-primary', text: 'התחל ⚔', onClick: () => { unlock(); fx.start(); startWorkout(plan, mode); } })
      : null,
    el('button', { class: 'btn btn-ghost', text: 'חזרה', onClick: () => { fx.tap(); renderHome(); } }),
  ]);

  app.appendChild(el('div', { class: 'view view-preview' }, [head, win, note, switchBtn, actions]));
}

// ---- Rank-up challenge -----------------------------------------------------

// Challenge readiness dialog (opened from the home ⚔ action button).
function openChallenge() {
  const challenge = getChallenge(state.currentChallenge);
  if (!challenge) {
    const d = systemDialog({
      title: 'אתגר',
      bodyNodes: [el('div', { class: 'goal-done', text: 'עברת את כל האתגרים 🎉' })],
      actions: [{ label: 'סגור', kind: 'primary', onClick: () => { fx.tap(); d.close(); } }],
    });
    return;
  }

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

  const dlg = systemDialog({
    title: challenge.name,
    bodyNodes: [
      el('div', { class: 'goal-head' }, [
        el('span', { class: `goal-pct ${r.ready ? 'ok' : ''}`, text: `${r.percent}% מוכן` }),
        el('span', { class: `goal-verdict ${r.ready ? 'ok' : ''}`, text: r.ready ? 'מוכן ✓' : `${r.readyCount}/${r.total} מוכנים` }),
      ]),
      el('div', { class: 'goal-bar' }, [el('div', { class: `goal-fill ${r.ready ? 'ready' : ''}`, style: `width:${r.percent}%` })]),
      el('div', { class: 'goal-list' }, rows),
    ],
    actions: [
      { label: 'התחל אתגר ⚔', kind: r.ready ? 'primary' : 'ghost', onClick: () => { unlock(); fx.tap(); dlg.close(); renderChallengePre(challenge); } },
      { label: 'סגור', kind: 'ghost', onClick: () => { fx.tap(); dlg.close(); } },
    ],
  });
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
    challenge.video
      ? el('button', {
          class: 'btn btn-ghost btn-wide btn-vid', type: 'button',
          'aria-label': 'סרטון הדגמה',
          onClick: () => { fx.tap(); openVideo(challenge.name, challenge.video); },
        }, [
          el('span', { class: 'btn-ico', html: ICONS.play }),
          'סרטון הדגמה',
        ])
      : null,
    el('div', { class: 'sys-actions' }, [
      el('button', { class: 'btn btn-primary', text: 'התחלתי ▶', onClick: () => { fx.start(); renderChallengeStep(challenge, 0); } }),
      el('button', { class: 'btn btn-ghost', text: 'חזרה', onClick: () => { fx.tap(); renderHome(); } }),
    ]),
  ], { class: 'sys-dialog' });

  app.appendChild(el('div', { class: 'view view-challenge' }, [win]));
}

function renderChallengeStep(challenge, idx) {
  clear(app);
  requestWakeLock(); // no-op if held; recovers a lock lost mid-run
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
      el('div', { class: 'chal-move-row' }, [
        el('div', { class: 'chal-move', text: item.label }),
        videoLink(item.source),
      ]),
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
      el('div', { class: 'chal-move-row' }, [
        el('div', { class: 'chal-move', text: item.label }),
        videoLink(item.source),
      ]),
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

// In-app YouTube player: opens the technique video in a styled dialog instead
// of navigating away to YouTube mid-workout.

function youtubeId(url) {
  const m = /(?:youtu\.be\/|v=|shorts\/|embed\/)([\w-]{11})/.exec(url || '');
  return m ? m[1] : null;
}

// Start offset from a `t=` / `start=` param (10, 10s, 1m5s…) — 0 when absent.
// The stretch routine's links all point into one demo clip at different times.
function youtubeStart(url) {
  const m = /[?&#](?:t|start)=([0-9hms]+)/.exec(url || '');
  if (!m) return 0;
  if (/^\d+$/.test(m[1])) return Number(m[1]);
  const p = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(m[1]);
  return p ? Number(p[1] || 0) * 3600 + Number(p[2] || 0) * 60 + Number(p[3] || 0) : 0;
}

function openVideo(name, url) {
  const id = youtubeId(url);
  if (!id) { // unparseable URL — fall back to the old external-tab behavior
    if (typeof window !== 'undefined' && window.open) window.open(url, '_blank', 'noopener');
    return;
  }
  const start = youtubeStart(url);
  const frame = el('div', {
    class: 'video-embed',
    html:
      `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1${start ? `&start=${start}` : ''}" ` +
      `title="סרטון הדרכה" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" ` +
      `allowfullscreen></iframe>`,
  });
  const dlg = systemDialog({
    title: '🎥 סרטון הדרכה',
    dismissible: true, // tap outside closes (removing the iframe stops playback)
    bodyNodes: [
      el('div', { class: 'video-name', text: name }),
      frame,
      el('a', {
        class: 'video-ext', href: url, target: '_blank', rel: 'noopener',
        text: 'פתיחה ביוטיוב ↗', onClick: () => fx.tap(),
      }),
    ],
    actions: [{ label: 'סגור', kind: 'primary', onClick: () => { fx.tap(); dlg.close(); } }],
  });
}

// Small button that opens a video in the in-app player; null when no url.
function videoBtn(name, url, cls = 'video-link') {
  if (!url) return null;
  return el('button', {
    class: cls, type: 'button',
    'aria-label': `סרטון הדרכה — ${name}`, html: ICONS.play,
    onClick: () => { fx.tap(); openVideo(name, url); },
  });
}

// Same, for a workout exercise's technique video (from the PDF's VIDEOS map).
function videoLink(name, cls = 'video-link') {
  return videoBtn(name, videoFor(name), cls);
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
// Start → counts up; auto-stops at the prescribed cap — the max of a range,
// or the exact required time when the target is a single value (L-sit 15s).
// A range also pings at its min. The held seconds are written into `input`
// so the set logs the real duration.
function makeHoldTimer(target, input) {
  // Stop point: range max, or the single required value. A min-only/open-ended
  // hold would have neither and never auto-stops.
  const stopAt = target.max || target.min || null;
  const pingAt = target.max && target.min && target.min < target.max ? target.min : null;
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
      if (!reachedMin && pingAt && sec >= pingAt) {
        reachedMin = true;
        wrap.classList.add('reached');
        fx.tick();
      }
      if (stopAt && sec >= stopAt) {
        wrap.classList.add('reached');
        fx.complete();
        stopHold();
      }
    });
  });

  return wrap;
}

// Segmented workout progress bar: one cell per exercise block, width scaled to
// its set count; each cell is a mini progress bar of that block's completed
// sets. Shared by the step screen and the rest screen.
function progressBar(session, completed) {
  const total = session.steps.length;
  const doneByBlock = [];
  for (let i = 0; i < completed; i++) {
    const bi = session.steps[i].blockIndex;
    doneByBlock[bi] = (doneByBlock[bi] || 0) + 1;
  }
  const cells = session.plan.blocks.map((b, bi) => {
    const pct = Math.min(100, ((doneByBlock[bi] || 0) / b.sets) * 100);
    return el('div', { class: 'seg', style: `flex:${b.sets}` }, [
      el('div', { class: 'seg-fill', style: `width:${pct}%` }),
    ]);
  });
  return el('div', { class: 'seg-track', 'aria-label': `התקדמות ${completed}/${total} סטים` }, cells);
}

function renderStep(session) {
  clear(app);
  requestWakeLock(); // no-op if held; recovers a lock lost mid-session
  const { block, setNo } = session.steps[session.stepIndex];
  const stepNum = session.stepIndex + 1;
  const stepTotal = session.steps.length;

  const head = el('div', { class: 'session-head' }, [
    el('div', { class: 'session-plan', text: session.plan.name }),
    el('div', { class: 'session-progress', text:
      session.mode === 'circuit' ? `סבב ${setNo}/${session.rounds} · ${stepNum}/${stepTotal}` : `${stepNum} / ${stepTotal}` }),
  ]);

  const isSuper = block.kind === 'superset';

  // Per-exercise logging. Time targets keep the count-up hold timer (it auto-fills
  // the seconds); everything else gets quick min/max buttons + a custom field,
  // pre-filled with the last reps logged for that exercise.
  const controls = block.exercises.map((ex) => {
    if (ex.target.type === 'routine') {
      // Video-guided routine (warmup) — nothing to log.
      return { wrap: null, input: { value: '' } };
    }
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
        el('div', { class: 'ex-name-row' }, [
          el('div', { class: 'ex-name', text: ex.name }),
          videoLink(ex.name),
        ]),
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
    progressBar(session, session.stepIndex),
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
  } else if (!block.restSec) {
    // No prescribed rest (e.g. after the warmup routine) — straight to the next step.
    session.stepIndex += 1;
    renderStep(session);
  } else {
    renderRest(session, block.restSec);
  }
}

const RING_R = 80;
const RING_C = 2 * Math.PI * RING_R;

// Countdown ring (SVG sweep + big clock), shared by the rest screen and the
// stretch holds. set(rem, total) updates clock + sweep; urgent() turns it gold.
function makeRing(text) {
  const clock = el('div', { class: 'rest-clock', text });
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
  const fg = ring.querySelector ? ring.querySelector('.ring-fg') : null;
  return {
    el: ring,
    set(rem, total) {
      clock.textContent = fmtClock(rem);
      if (fg) fg.style.strokeDashoffset = String(RING_C * (1 - rem / total));
    },
    urgent() { ring.classList.add('urgent'); },
  };
}

function renderRest(session, restSec) {
  clear(app);
  const next = session.steps[session.stepIndex + 1];
  // "Up next" line with an inline video preview button per exercise.
  const nextLine = el('div', { class: 'rest-next' }, [
    'הבא: ',
    ...next.block.exercises.flatMap((e, i) => [
      i > 0 ? ' + ' : null,
      el('span', { class: 'rest-next-ex' }, [e.name, videoLink(e.name, 'video-link pv-video')]),
    ]),
  ]);

  const ring = makeRing(fmtClock(restSec));

  let handle;
  const proceed = () => {
    if (handle) handle.stop();
    session.stepIndex += 1;
    renderStep(session);
  };

  const win = systemWindow('⏳ מנוחה', [
    ring.el,
    el('div', { class: 'rest-sub', text: `מנוחה: ${restText(restSec)}` }),
    nextLine,
    el('div', { class: 'sys-actions' }, [
      el('button', { class: 'btn btn-primary', text: 'דלג ⏭', onClick: () => { fx.tap(); proceed(); } }),
    ]),
  ], { class: 'sys-dialog' });

  // Same segmented progress as the step screen; the set just finished counts.
  const done = session.stepIndex + 1;
  const head = el('div', { class: 'session-head' }, [
    el('div', { class: 'session-plan', text: session.plan.name }),
    el('div', { class: 'session-progress', text: `${done} / ${session.steps.length}` }),
  ]);
  app.appendChild(el('div', { class: 'view view-rest' }, [head, progressBar(session, done), win]));

  handle = startTimer(
    restSec,
    (rem) => {
      ring.set(rem, restSec);
      if (rem > 0 && rem <= 3) {
        ring.urgent();
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

// ---- Stretching routine ----------------------------------------------------
// Guided run of STRETCH_ROUTINE (js/stretches.js): each hold is started by a
// tap (time to get into position), counted down on the ring, then auto-advances.
// Completed runs go to state.stretchLog — real data (date, duration, holds),
// but NOT workouts: streaks, the weekly goal and readiness ignore them.

function stretchTitle() {
  return iconLabel(ICONS.stretch, STRETCH_ROUTINE.name, 'title-ico');
}

// Equal-cell progress (one cell per hold), same look as the workout seg-track.
function stepsBar(total, completed) {
  const cells = Array.from({ length: total }, (_, i) =>
    el('div', { class: 'seg' }, [el('div', { class: 'seg-fill', style: `width:${i < completed ? 100 : 0}%` })])
  );
  return el('div', { class: 'seg-track', 'aria-label': `התקדמות ${completed}/${total}` }, cells);
}

function renderStretchPre() {
  clear(app);
  requestWakeLock();
  const r = STRETCH_ROUTINE;
  const rows = r.steps.map((s, i) =>
    el('div', { class: 'st-row' }, [
      el('span', { class: 'pv-block-no', text: String(i + 1) }),
      el('span', { class: 'st-name', text: stepLabel(s) }),
      el('span', { class: 'st-sec', text: `${s.sec} שנ'` }),
      videoBtn(stepLabel(s), s.video, 'video-link pv-video'),
    ])
  );
  const win = systemWindow(stretchTitle(), [
    el('div', { class: 'chal-sub', text: `${r.steps.length} החזקות · ${r.holdSec} שניות כל אחת · כ-${Math.ceil(stretchTotalSec(r) / 60)} דקות` }),
    el('div', { class: 'st-list' }, rows),
    el('button', {
      class: 'btn btn-ghost btn-wide btn-vid', type: 'button', 'aria-label': 'סרטון מלא',
      onClick: () => { fx.tap(); openVideo(r.name, r.video); },
    }, [el('span', { class: 'btn-ico', html: ICONS.play }), 'סרטון מלא']),
    el('div', { class: 'sys-actions' }, [
      el('button', { class: 'btn btn-primary', text: 'התחל ▶', onClick: () => {
        unlock(); fx.start();
        renderStretchStep(r, 0, { startedAt: Date.now(), done: 0 });
      } }),
      el('button', { class: 'btn btn-ghost', text: 'חזרה', onClick: () => { fx.tap(); renderHome(); } }),
    ]),
  ], { class: 'sys-dialog' });
  app.appendChild(el('div', { class: 'view view-stretch' }, [win]));
}

function renderStretchStep(routine, idx, run) {
  clear(app);
  requestWakeLock(); // no-op if held; recovers a lock lost mid-run
  const step = routine.steps[idx];
  const total = routine.steps.length;
  let handle = null;

  const head = el('div', { class: 'session-head' }, [
    el('div', { class: 'session-plan', text: routine.name }),
    el('div', { class: 'session-progress', text: `${idx + 1} / ${total}` }),
  ]);

  const advance = () => {
    if (handle) { handle.stop(); handle = null; }
    if (idx + 1 < total) renderStretchStep(routine, idx + 1, run);
    else finishStretch(routine, run);
  };

  const ring = makeRing(fmtClock(step.sec));
  // One button: idle → start the hold; running → skip ahead (not counted as held).
  const goBtn = el('button', { class: 'btn btn-primary', text: 'התחל ▶' });
  goBtn.addEventListener('click', () => {
    if (handle) { fx.tap(); advance(); return; }
    fx.start();
    goBtn.textContent = 'דלג ⏭';
    goBtn.classList.remove('btn-primary');
    goBtn.classList.add('btn-ghost');
    handle = startTimer(
      step.sec,
      (rem) => { ring.set(rem, step.sec); if (rem > 0 && rem <= 3) { ring.urgent(); fx.tick(); } },
      () => { handle = null; run.done += 1; fx.restEnd(); advance(); }
    );
  });

  const win = systemWindow(stretchTitle(), [
    el('div', { class: 'chal-move-row' }, [
      el('div', { class: 'chal-move', text: step.name }),
      videoBtn(step.name, step.video),
    ]),
    step.side ? el('div', { class: 'st-side', text: `רגל ${step.side}` }) : null,
    el('div', { class: 'chal-req', text: `החזק ${step.sec} שניות` }),
    ring.el,
    el('div', { class: 'sys-actions' }, [goBtn]),
  ], { class: 'sys-dialog' });
  const exit = el('button', { class: 'link-btn', text: 'יציאה', onClick: () => { if (handle) handle.stop(); fx.tap(); renderHome(); } });
  app.appendChild(el('div', { class: 'view view-stretch' }, [head, stepsBar(total, idx), win, exit]));
}

function finishStretch(routine, run) {
  const durationSec = Math.round((Date.now() - run.startedAt) / 1000);
  const total = routine.steps.length;
  if (run.done > 0) { // nothing held → nothing to log
    state.stretchLog.push({ dateISO: new Date().toISOString(), durationSec, holds: run.done, total });
    store.save(state);
  }
  releaseWakeLock();
  fx.finish();
  const dlg = systemDialog({
    title: 'סיכום מתיחות',
    bodyNodes: [
      el('div', { class: 'summary-line big', text: 'מתיחות הושלמו!' }),
      el('div', { class: 'summary-grid' }, [
        statCell('החזקות', `${run.done}/${total}`),
        statCell('זמן', store.fmtDuration(durationSec)),
      ]),
    ],
    actions: [{ label: 'סגור', kind: 'primary', onClick: () => { fx.tap(); dlg.close(); renderHome(); } }],
  });
}

// ---- Boot ------------------------------------------------------------------

applyTheme(loadTheme());

// Deep links from the reminder notification: ./?open=stretch (the routine) and
// ./?open=reminder (re-copy the subscription from Settings). The query is
// stripped right away so a reload / PWA restart lands on home as usual.
function boot() {
  let open = null;
  try {
    open = new URLSearchParams(location.search).get('open');
    if (open && history.replaceState) history.replaceState(null, '', location.pathname);
  } catch { /* ignore */ }
  if (open === 'stretch') { renderStretchPre(); return; }
  renderHome();
  if (open === 'reminder') openSettings();
}
boot();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
  // Notification tapped while a window is already open: sw.js focuses it and
  // asks for the routine — honoured only from home, never mid-session.
  navigator.serviceWorker.addEventListener('message', (e) => {
    const d = e && e.data;
    if (d && d.type === 'open' && d.view === 'stretch' && app.querySelector('.view-home')) renderStretchPre();
  });
}
