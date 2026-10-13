# CLAUDE.md — Workout PWA ("System" tracker)

Project memory + operating manual. Read this first when resuming work.

## What this is

Personal calisthenics workout-tracking **PWA**, hosted on **GitHub Pages**, built for Roei
(owner). Tracks his coach's program (the "שלב הבסיס" / Base Stage calisthenics plan). Two
alternating upper-body workouts **Plan A** / **Plan B**, plus a per-level **rank-up challenge**
("אתגר מעבר") used to advance to the next level. **Current level: 3.5** (3.0 passed 2026-09, 2.5
passed 2026-08). The level PDF lives in the project root and is **gitignored** (`*.pdf`) — it's
the coach's copyrighted material and this repo is served publicly by GitHub Pages.
Since 2026-09 also a **stretching routine** (owner's own list, not from the coach's PDF); since
2026-10 it is **inserted into every other workout right after the warmup**, each hold as its own
exercise (see "Stretching routine"). It also still runs standalone from home.

- **Hebrew / RTL**, mobile-first, also fine on desktop.
- **Offline-capable, installable** PWA. Persists everything in `localStorage`.
- **No build step.** Vanilla HTML/CSS/ES-modules. Commit files → GitHub Pages serves them.
- **No push notifications.** A 9:00 Web Push stretch reminder (GitHub Actions cron sender +
  `push.js` + SW push handlers) existed 2026-09 and was **removed 2026-10 at the owner's
  request** — don't re-add it unless asked.

## NON-NEGOTIABLE PRINCIPLES (do not violate without explicit ask)

1. **Real, tangible data only. No fake gamification.** XP, levels, hunter rank, fabricated RPG
   stat windows were deliberately **removed**. Do NOT reintroduce them. Stats must derive from
   actual logged workout history. (2026-08: the old Solo-Leveling terminal look was replaced by a
   **calm modern skin** at the owner's request — warm neutrals + sage accent, rounded cards. The
   no-fake-progression rule is unchanged.)
2. **Lightweight, no dependencies, no build.** Don't add frameworks, bundlers, npm packages.
   Everything must work as static files opened over HTTP.
3. **No new features without approval.** Suggest, don't surprise-build.
4. **All paths relative** (`./js/...`) so it works under `https://<user>.github.io/<repo>/`.

## Architecture / file map

```
index.html              dir="rtl" lang="he"; inline pre-paint theme script; loads js/app.js (module)
manifest.webmanifest    PWA manifest (RTL, standalone, SVG icon)
sw.js                   service worker: cache-first app shell. BUMP `CACHE` const on every change.
css/styles.css          theme (CSS vars), dark + [data-theme="light"], minimal animation
assets/icons/icon.svg   app icon (SVG)
assets/fonts/*.woff2    Playpen Sans Hebrew (OFL, from Google Fonts) — hebrew + latin subsets,
                        variable weight 100-800; bundled locally (offline PWA, no CDN)
js/
  app.js        entry. View router + all rendering: home, workout session, rest, summary,
                challenge card + guided challenge run, standalone stretching run, ⚙ settings
                sheet, sessionPlan (ramp-up scaling + every-other-workout stretch holds), screen
                wake lock, in-app YouTube player dialog (openVideo).
  state.js      localStorage load/save; derived real stats (+ stretchStats); challenge readiness;
                ramp helpers.
  workouts.js   Plan A & B data + target/rest helpers + ramp scaling (scaleTarget/scaledPlan).
  stretches.js  STRETCH_ROUTINE data (8 timed holds + per-step video timestamps) + helpers +
                stretchBlocks/withStretches (the routine as workout blocks).
  challenges.js rank-up challenge data + helpers.
  timer.js      startTimer (countdown), startStopwatch (count-up), fmtClock.
  system.js     DOM helpers: el(), clear(), systemWindow(), systemDialog(), notify().
  icons.js      hand-drawn inline-SVG icons — ICONS.{gear,dumbbell,spyglass,muscle,shoe,swords,
                play,stretch,sun,moon,speaker,speakerOff,vibrate,gauge,export,import,copy};
                spyglass=preview, muscle=normal mode, shoe=circuit mode, stretch=routine —
                stroke=currentColor, injected via el()'s `html` attr; buttons keep aria-labels.
  feedback.js   WebAudio synth sounds + navigator.vibrate haptics; persisted prefs + toggles.
tools/gen-icons.mjs     dev-only: rasterizes every icon → tools/icons-preview.png (pure-Node PNG
                        encoder; output is a throwaway, don't commit it)
```

`localStorage` keys: `slworkout.v1` (state — incl. `nextStretch`/`rampPercent`/`rampDisplay`/
`workoutMode`/`stretchLog`), `slworkout.prefs` (sound/haptics), `slworkout.theme`.

## Data model — `workouts.js`

A plan = ordered list of **blocks**. A block is `single` or `superset` (exercises back-to-back,
"וישר בלי מנוחה", rest only after the group), repeated `sets` rounds. `restSec` in seconds.

```js
{ kind:'single'|'superset', sets:Number, restSec:Number,
  exercises:[ { name:'<hebrew>', target:<targetObj> } ] }
```

**Target types** (factory fns + `targetText`/`targetMax` renderers — reuse them):
| factory        | meaning                | targetText        | targetMax |
|----------------|------------------------|-------------------|-----------|
| `fixed(v)`     | exact reps             | `"12 חזרות"`      | v         |
| `range(a,b)`   | rep range              | `"8–10 חזרות"`    | b         |
| `max()`        | AMRAP, no cap          | `"מקסימום"`        | **null**  |
| `maxCap(c)`    | AMRAP up to c          | `"מקסימום עד 15"` | c         |
| `time(a,b)`    | timed hold (seconds)   | `"30–60 שניות"`   | b (or a)  |
| `routine()`    | video-guided routine (warmup) | `"לפי הסרטון"` | **null** |

`targetMax` = the **prescribed max**, used as the default capacity when the user didn't log reps
(decision: assume they hit the prescribed max). Uncapped `max()` → null → no readiness signal.

`restText(sec)`: 0→"ללא מנוחה", 60→"דקה", 90→"דקה וחצי", 150→"2.5 דקות", multiples of
60→"N דקות", else "N שניות". If a new PDF uses another odd value, extend `restText` rather than
mis-render. **`restSec: 0`** on a block = no rest screen after its sets (`completeStep` skips
`renderRest`; preview omits the rest label) — used for the level-3 video-guided warmup.

`totalSets(plan)` sums sets, skipping `stretch` blocks (they aren't program sets).

**Exercise videos** (`VIDEOS` map + `videoFor(name)`, `workouts.js`): YouTube technique links
extracted from the PDF's link annotations, keyed by the **exact exercise name** (same matching rule
as challenge `source` — challenge steps look up videos via `item.source`). A challenge entry can
also carry a top-level `video` (full-sequence demo). UI: `videoBtn(name, url)` in `app.js` renders a
small play **button** (`videoLink(name)` = same via the `VIDEOS` map) that opens `openVideo(name,
url)` — an **in-app player dialog** (dismissible `systemDialog` with a 16:9
`youtube-nocookie.com/embed` iframe, autoplay+playsinline, styled `.video-embed` ink frame, plus a
"פתיחה ביוטיוב ↗" fallback link). `youtubeId(url)` parses watch/youtu.be/shorts/embed URLs;
unparseable → old `window.open` behavior. `youtubeStart(url)` reads a `t=`/`start=` param (`10`,
`10s`, `1m5s`) → `&start=N` on the embed, so one clip can serve several moves (the stretch routine
stores `...&t=10s` URLs; the YouTube fallback link keeps the timestamp too). Closing the dialog
removes the iframe → playback stops. Session exercises go through `exVideo(ex)` = the
exercise's own `video` field (stretch holds) else `videoFor(ex.name)`. Shown per exercise in the
session step, the preview, the
**rest screen** ("הבא:" line — one button per upcoming exercise, `.rest-next-ex`), each challenge
step, and each stretch step/row; the challenge pre-screen's "סרטון הדגמה" button opens the same
player with `challenge.video`, the stretch pre-screen's "סרטון מלא" with `STRETCH_ROUTINE.video`.

## Stretching routine — `stretches.js`

Owner's list (2026-09), **not** from the coach's PDF: never ramp-scaled, never counted by streaks /
weekly goal / readiness / set counts.

```js
STRETCH_ROUTINE = { id:'stretch', name:'מתיחות', video:<demo clip>, holdSec:40,
  prepSec:15,   // countdown BEFORE every hold — workout and standalone run alike
  steps:[ { name, sec:40, video:'<clip>&t=<sec>s', side?:'ימין'|'שמאל' } ] }  // 8 holds
```
"40 שניות כל רגל" is encoded as **two steps** with `side` (`stepLabel(step)` → "name · רגל ימין").
`stretchTotalSec(routine)` sums the holds. All 8 steps point into the same YouTube clip
(`RnPZylKqQf8`) at the timestamps the owner gave (0:00, 0:10, 0:21, 0:33, 0:40, 0:50, 0:56).

**In the workout, every other session** (owner request 2026-10: "1 with, 1 without, …"; each hold
its own exercise, NOT one "stretch routine" card):
- `stretchBlocks(routine)` → one block per step: `{ kind:'single', sets:1, restSec:0,
  prepSec: routine.prepSec, stretch:true, exercises:[{ name: stepLabel(step), target: time(sec),
  video: step.video }] }`. `prepSec` = a countdown **before** that block: `completeStep` checks
  the NEXT step's `block.prepSec` first and shows it instead of any rest.
  `withStretches(plan)` → copy with those 8 blocks spliced in **right after block 0 (warmup)**,
  plus `plan.stretch = true`.
- Alternation = `state.nextStretch` (default `true`; old saves → `true`), flipped in
  `finishWorkout` to `!session.plan.stretch` — aborted workouts don't flip it (same as `nextPlan`).
  Because A/B alternate too, the stretches land on the **same plan letter every time** (the owner
  was told; it's what "every other" means here).
- Applied at the choke point `sessionPlan(id)` (`app.js`) **after** `scaledPlan` → holds stay 40s.
  The upcoming plan follows `nextStretch`; the other plan (preview switch) gets the opposite,
  since it's the workout after. `scaledPlan` also skips `b.stretch` blocks as a guard.
- Session: a stretch step is the normal exercise card (title `מתיחה k מתוך 8` with the stretch
  icon, count-up hold timer). Its hold **auto-completes the step** at 40s (`makeHoldTimer`'s
  `onCap`) — no "הושלם" tap needed; "הושלם"/"דלג סט" still work.
- **15s prep before every hold** (owner request 2026-10: "time to realize which hold is next and
  get in position"; then "add countdown before hold 1" too): `renderRest` in **prep mode**
  (`next.block.prepSec`): `prepTitle()` "הכנה" with the stretch icon + `prepNodes(name, video)`
  (shared with the standalone run) = "היכנס לתנוחה — ההחזקה תתחיל לבד" + the next hold's name
  big (`הבא: …`, `.chal-move`) + its video; button **"התחל עכשיו ▶"** (instead of "דלג ⏭").
  When it ends (or on that button) → `renderStep(session, { autoStart: true })` starts the hold by
  itself (`hold.start()`, quiet — the countdown already rang). So all 8 holds run hands-free from
  the warmup's "הושלם". After hold 8 → straight to the first work set (no prep, no rest). Prep and
  rest screens have no "בטל אימון" link (abort from a step card). In circuit mode the holds are in
  round 1 right after the warmup (sets: 1).
- Results carry `stretch: true` → excluded from `stats.totalSets` and the summary "סטים" cell;
  the summary adds a "מתיחות done/8" cell. `stretchStats` = standalone `stretchLog` runs **+**
  workouts with ≥1 done stretch hold (time = held seconds, `targetMax` when untimed).
- Home hero + preview show a `stretchNote` ("כולל מתיחות אחרי החימום · 8 החזקות"); the
  "N תרגילים · M סטים" line (`planSub`) counts program blocks only.

**Ramp-up scaling** (`scaleTarget(t,pct)`, `scaledPlan(plan,pct)`): return a *copy* of a target/plan
with reps/holds scaled to `pct`% (floor 1; `range`→`fixed` when ends collapse). Scales
`fixed`/`range`/`time`/`maxCap`; pure `max()` unchanged (no number). `scaledPlan` leaves **block 0
(warmup)** and `stretch` blocks untouched and returns the original plan (same ref) when `pct>=100` or falsy. Source plan
data is never mutated. See "Settings + ramp-up intensity" below.

## State + stats — `state.js`

```js
DEFAULT_STATE = {
  nextPlan: 'A',                 // flips A↔B after each completed workout
  nextStretch: true,             // next workout gets the stretch holds after the warmup; flips too
  history: [ { dateISO, plan:'A'|'B', durationSec,
               sets:[ { exercise, target, targetMax|null, actual|null, done, stretch? } ] } ],
  currentChallenge: '3.5', challengesPassed: [], challengeNotified: false,
  rampPercent: 75,               // intensity %, [50,100]; 100 = full plan (no scaling)
  rampDisplay: 'full',           // LEGACY (old home widget display) — unused, kept for old saves
  workoutMode: 'normal',         // 'normal' | 'circuit' — persisted Settings row (was a per-start home toggle)
  stretchLog: [ { dateISO, durationSec, holds, total } ],  // STANDALONE stretch runs (holds actually held)
}
```
`load()` spreads DEFAULT over saved (so old saves missing new keys are fine; leftover removed keys
like `xp` are harmless), normalizes `workoutMode` (anything but `'circuit'` → `'normal'`),
`stretchLog` (non-array → `[]`) and `nextStretch` (anything but `false` → `true`). It also runs the **level migrations** — a local `levelUp(from,to)`
called once per level, oldest → newest (`'2.5'→'3.0'`, `'3.0'→'3.5'`): a save whose
`currentChallenge` is `from` (passed offline) **or `null`** (passed in-app while no next id existed
yet) advances to `to` and marks `from` passed, guarded by `challengesPassed.includes(to)` so a
finished level is never resurrected. Chaining is intentional — an ancient save walks up to the level
the owner actually trains now. **Adding a level = one more `levelUp(...)` line.** Ramp helpers: `clampRamp(p)`→[`RAMP_MIN=50`,`RAMP_MAX=100`], `RAMP_STEP=5`,
`nextRampDisplay(d)` (cycles full→readonly→hidden).

Real stats (`stats(state)`): totalWorkouts, totalTimeSec, totalSets (done, non-`stretch` results),
streak/longestStreak (`streaks()` — consecutive sessions within `GRACE_DAYS=4`, since goal is
3×/week), weekCount (`WEEKLY_GOAL=3`). `fmtDuration(sec)` → Hebrew "1ש' 12ד'".
`stretchStats(state)` → `{ total, totalTimeSec, weekCount, last }` over `stretchLog` + workouts
with done stretch holds (shown as 3 extra cells in the stats dialog).

**Challenge readiness** `challengeReadiness(state, challenge)`:
- Per sequence item, gather per-session capacity for `item.source` (newest first): max over that
  session's matching sets of `actual ?? targetMax` (null = no signal that session).
- Item `ready` only if it cleared `requirement` in the most recent **`CHALLENGE_STREAK=2`**
  sessions with data (exact threshold, no margin). Prevents one-off flukes.
- Returns `{ items:[{label,requirement,capacity,sessions,enough,ready}], readyCount, total,
  ready, percent }`. `percent` = mean of per-item `min(100, capacity/requirement*100)`.
- **Ramp interaction (honest):** ramped sessions store the *scaled* `targetMax`, so a lighter
  session shows less capacity — readiness % dips while ramping and recovers as `rampPercent`→100.
  Logging `actual` still overrides. Scaling reps does NOT cheat readiness.
- `recordChallengePass(state, id, nextId)` pushes id, sets `currentChallenge=nextId`, resets notify.

## Challenges — `challenges.js`

```js
CHALLENGES = [{ id, name, conditions:[...], sequence:[
  { kind:'hold', label, sec, source:'<workout exercise name>', requirement:<reps> }, // dragon flag: 3s, proxied by negative reps
  { kind:'reps', label, count, source:'<workout exercise name>', requirement:<reps> },
]}]
```
`source` MUST exactly match an exercise `name` in `workouts.js` or readiness can't find data.
`hold` items: `requirement` is in the **source's units** — a reps proxy when the source is a reps
exercise (2.5 dragon flag ← negative reps), plain seconds when the source is a `time()` hold
(3.0 אלסיט ← `time(15)`). 3.5 has no `hold` items — all five moves are `reps`. Old challenge
entries stay in `CHALLENGES` so `nextChallengeId` chains.
**Proxy sources:** when a challenge move has no exact-name twin in the plans, pick the *harder*
plan variant and say so in a comment — 3.5's "מתח רגיל" reads capacity from `'מתח רחב'` (clearing 10
wide pull-ups covers 10 regular ones). Never invent a `source` string that no plan uses.
Helpers: `getChallenge(id)`, `nextChallengeId(id)`, `reqText(item)`.

## UI flow — `app.js`

- **Home** (`renderHome`, reskinned 2026-08 after a reference mock): top bar = **⚙ settings**
  (physical top-left) + **🏋 workouts-count chip** (top-right; RTL → chip is the FIRST DOM child) →
  `openStats()` dialog (stage line `שלב בסיס · רמה <state.currentChallenge>` — derived, falls back
  to the last passed id, so it follows the data instead of drifting — + real stat grid, incl. weekly count and
  the 3 stretch cells) · **hero** = next workout name + exercises/sets + stretch note (stretch
  days only) + circuit note (shoe icon +
  "מצב מעגלי · N סבבים", only when `workoutMode==='circuit'`; no progress bar on home — owner
  removed it) · pill **התחל אימון** (pencil-hatched, width matches the action row) · bottom
  `action-row` of 3 round buttons: spyglass **preview** · stretch-figure **מתיחות** →
  `renderStretchPre()` · swords **challenge** (label shows readiness %) → `openChallenge()` dialog
  (per-move readiness rows + "התחל אתגר"). The old normal↔circuit toggle **moved to Settings**
  (2026-09, owner request) and is persisted (`state.workoutMode`, read via `workoutMode()`).
  START/preview run `sessionPlan(id)` (scaled + stretch holds on stretch days). The **intensity
  stepper lives in Settings** (not on home); closing Settings re-renders home, which re-derives the
  session plan + mode.
- **Standalone stretching run** (`renderStretchPre` → (`renderStretchPrep` → `renderStretchStep`)
  ×8 → `finishStretch`, `.view-stretch`): **hands-free after "התחל ▶"**. Pre-screen = numbered
  `.st-row` list (name · "40 שנ'" · per-step video button), "סרטון מלא", "התחל ▶", time estimate
  includes the preps (8×(40+15)s → "כ-8 דקות"). `renderStretchPrep` = the same prep screen as the
  workout (`prepTitle`/`prepNodes`, 15s ring, "התחל עכשיו ▶"; at 0 → `fx.restEnd()` + toast
  "מחזיקים!"). `renderStretchStep` = name + video, optional `.st-side` ("רגל ימין"), "החזק 40
  שניות", the countdown **ring** (`makeRing`) running **immediately**, one "דלג ⏭" button
  (skipping does not count as held); at 0 → `fx.complete()`, `run.done++`, next prep (or finish).
  `stretchHead`/`stepsBar(total, completed)` = head + equal-cell `.seg-track` on both screens.
  "יציאה" link (both screens) → home, timer stopped, nothing logged.
  `finishStretch` logs `{dateISO, durationSec, holds, total}` to `stretchLog` **only if holds>0**,
  then a summary dialog (holds `done/total` + time) → home. Wake lock held during the run.
- **Preview** (`renderPreview`): read-only block/exercise listing of the session plan (stretch
  holds = their own numbered blocks, meta "מתיחה") + a wide
  switch button ("הצג את אימון X ⇄") that re-renders with the **other** plan —
  `sessionPlan(otherId)` from pristine source data (no double-scaling; opposite stretch flag).
  Only the **upcoming** plan (`plan.id === state.nextPlan`) shows "התחל ⚔"; the other plan is
  reference-only with a `.pv-other-note` ("לעיון בלבד") so the A/B alternation can't be broken by
  accident.
- **Session** (`renderStep`→`completeStep`→`renderRest`): runs a **scaled copy** of the plan, so the
  shown target + stored `targetMax` are already ramp-scaled. Progress = **segmented bar**
  (`progressBar(session, completed)`, `.seg-track`/`.seg.on` — one cell per set), shown on BOTH the
  step screen (completed = `stepIndex`) and the rest screen (completed = `stepIndex + 1`, since the
  just-finished set counts). Per set show exercise(s) + target; superset shows both. Optional rep logging (`<details>` "רישום חזרות"). `time` targets get a
  count-up **hold timer** (`makeHoldTimer`) that auto-fills the logged seconds and **auto-stops at
  the prescribed cap** (`stopAt = max || min`): exact `time(v)` stops at v, `time(a,b)` pings at a
  (`pingAt` — only when a real range) and stops at b; a min-only/open-ended hold (neither) would
  never auto-stop. Auto-stop uses the *scaled* values. `makeHoldTimer(target, input, onCap)` returns
  `{ wrap, start, stop }` (`start()` = begin without a tap, no start sound); the step's controls live on `session.controls` and `stopControls(session)` ends a
  running hold on done/skip/abort (keeps the seconds held so far, and stops a stale timer from
  ticking — or auto-advancing — after its card is gone). `completeStep`
  stores `{exercise, target, targetMax, actual, done}` (+ `stretch:true` for stretch holds). Rest =
  countdown ring (SVG sweep, gold + ticks in last 3s) + "הבא:" line with per-exercise 🎥 preview
  buttons; no rest after final set. `finishWorkout` saves history, flips `nextPlan` and
  `nextStretch`, then the summary (sets + stretches on stretch days + time — **no XP**) asks **"היה מאתגר מספיק?"** (`קל מדי`/`בול`/`קשה מדי`) →
  nudges `rampPercent` ±`RAMP_STEP` for next time.
- **Challenge run**: `renderChallengePre` (conditions checklist) → `renderChallengeStep`
  (each move in order, no rest; hold move uses stopwatch to its `sec`) → `renderChallengeVerdict`
  (honest pass/fail) → `passChallenge` (record + advance + dialog). Ready-notification fires once
  via `maybeNotifyReady` when readiness crosses to ready.
- **Wake lock** (top of `app.js`): `requestWakeLock`/`releaseWakeLock` keep the screen on during a
  session/challenge run; released on home, preview, and finish. Robustness (2026-08 fix — screen
  used to sleep mid-workout): a sentinel `release` listener re-acquires when the UA drops the lock
  **while the page is visible** (battery saver, system pressure); `visibilitychange` re-acquires on
  tab return; `renderStep`/`renderChallengeStep` also call `requestWakeLock()` (no-op while held)
  to recover from transient denials. Guards: `_wakeLock`/`_wakeReqInFlight` prevent stacking; a
  lock resolving after `releaseWakeLock()` is released immediately. Battery saver can deny outright
  — not fixable in-app.

## Theme + feedback

- Theme (**hand-drawn ink-on-paper skin**, 2026-08, after the owner's reference mock): monochrome
  ink + warm paper, thick 2px outlines, **wobbly radii** (`--wobble`/`--wobble-s`/`--wobble-round`
  — asymmetric border-radius = sketchy look), **hard offset shadows** (`box-shadow: 3px 3px 0
  var(--shadow-ink)`; :active translates into the shadow), ✦ sparkles (`.sys-title::before`,
  `.btn-start::before/after`, `.hero-name::before/after`), dashed dividers. Vars on `:root` (dark =
  chalk-on-slate) + `[data-theme="light"]` (ink on cream): `--paper`/`--paper-2`/`--panel`,
  `--ink`/`--ink-dim`/`--ink-line`/`--ink-soft`/`--on-ink`, `--shadow-ink`, `--track-bg`,
  `--input-bg`, `--overlay-bg`, semantic `--ok`/`--gold`/`--danger`, `--font` — **'Playpen Sans
  Hebrew' first** (bundled woff2 `@font-face` with unicode-range per subset; covers Hebrew + Latin
  + digits in one handwriting style), then 'Segoe Print'/'Ink Free' → sans fallback. Button icons
  are hand-drawn SVGs from `js/icons.js` (no emoji) — sized per context in CSS
  (`.action-btn svg` 30px, `.icon-round svg` 22px, `.video-link svg` 17px, `.btn-ico svg` 18px,
  `.set-ico svg` 19px in settings rows / 20px in `.title-ico` dialog titles, `.inline-ico svg`
  16px for the home/preview circuit + stretch notes). **Settings + its dialogs carry no emoji** (owner request
  2026-09): row icons via `settingRow({ icon })` where `icon` is an SVG string **or a function**
  re-evaluated on every tap (theme → sun/moon, sound → speaker/speakerOff, mode → muscle/shoe);
  `iconLabel(icon, text, cls)` builds icon+text for rows and titles; `systemDialog` actions accept
  `icon` (copy button). Emoji elsewhere (session/rest/challenge titles, summary buttons) were left
  as they were. New icons must be drawn in the same 24-unit wobbly style; `node tools/gen-icons.mjs
  --preview` rasterizes every icon to `tools/icons-preview.png` for a look (the Read tool can view
  PNGs; pure-Node PNG encoder — no image tooling is installed here).
  `.btn-primary` = solid ink. Progress bars = outlined tracks with ink fill. Spacing is generous
  (`.view-home` gap 30px) — don't re-clutter home. `.sys-dialog` doubles as the in-view card class
  (session step / rest / challenge windows): max-width 420px + `margin-inline: auto` so it centers
  when `#app` (560px) is wider on desktop; session/rest/challenge `session-head` + `seg-track` are
  capped to the same 420px to stay aligned with the card. Theme-color hexes in THREE places, keep in
  sync: `applyTheme` (`app.js`), `<meta name="theme-color">` (`index.html`),
  `manifest.webmanifest` (`#faf7f0` light / `#211e1a` dark). Inline `<head>` script applies theme
  before paint. Animations minimal (one fade); honor `prefers-reduced-motion`.
- Feedback: `fx.{tap,start,complete,tick,restEnd,levelUp,finish}` synth + vibrate; gated by
  persisted prefs. Audio unlocked on first user gesture (`unlock()` from START).

## Settings + ramp-up intensity

- **Settings sheet** (`openSettings` + `settingRow` + `intensityRow`, `app.js`): the
  ⚙ button opens a `systemDialog` with one **row per setting**, in this order — theme, sound,
  haptics, **workout mode** (רגיל/מעגלי, persisted `state.workoutMode`; tap-to-cycle rows via
  `settingRow`), the **intensity stepper** (`intensityRow`: −/+ adjust `rampPercent` in place; also
  auto-nudged by the post-workout prompt), export, import (`openRow` = rows that open a dialog).
  Close → `renderHome()` — REQUIRED, it re-derives the session plan + mode after a change. CSS =
  `.set-*` + `.ramp-*` classes. `rampDisplay` in state is now **legacy/unused** (the old home intensity-widget display
  mode; kept so old saves load cleanly). Settings live **off the main UI** (one gear, not a toolbar).
- **Backup export/import** (`exportBackup`/`openExport`/`openImport`/`tryImport`, `app.js`; two
  extra settings rows): localStorage is per-browser (Edge ↔ Chrome don't share), so the backup is
  a JSON envelope `{app:'slworkout-backup', v:1, exported, data:{<raw localStorage strings>}}` over
  `BACKUP_KEYS` = state/prefs/theme — restored **verbatim**, no reinterpretation. Export dialog =
  readonly `.io-text` textarea (LTR) + clipboard copy (fallback select+execCommand). Import
  validates the envelope (bad paste → toast, storage untouched), shows a **confirm dialog with
  workout counts** (backup vs device, irreversible), then writes keys and `location.reload()` so
  every module re-reads storage (non-browser fallback: reload state + theme + re-render in place).
- **Ramp-up**: scales the prescribed plan down so sessions stay clean (e.g. 3×12 you grind into
  12/8/6 → 3×9 you actually own). `rampPercent` (default 75) in state; adjusted by the Settings
  intensity stepper (`±`) **and** the post-workout prompt (±`RAMP_STEP`, clamped [50,100]). Scaling is
  applied at **one** choke point — `sessionPlan(id)` (→ `scaledPlan(plan, rampPercent)`, then the
  stretch holds) in `renderHome`, passed into `startWorkout`/`renderPreview`; everything downstream
  (display, hold timer, history `targetMax`) consumes it with no extra edits. Warmup (block 0),
  stretch holds and pure `max()` are never scaled.
  Composes with circuit mode (orthogonal — circuit reorders steps, ramp scales targets). Readiness
  stays honest (scaled `targetMax` stored — see readiness section).

## PWA / deploy

- `sw.js`: list every shipped file in `SHELL`; **bump `CACHE` ('slworkout-vN')** whenever any
  cached file changes, or users get stale assets (2026-10: **v47**, push removed + stretches in the
  workout; v46 level-3.5 program data). Add new `js/*.js` to `SHELL`. The fetch handler **ignores
  cross-origin requests** entirely (early return) — required so the in-app YouTube embed iframe is
  never answered with the cached `index.html` offline; only same-origin GETs are cache-first,
  matched with `ignoreSearch:true` (a query string still gets the shell). No push handlers.
- Deploy = GitHub Pages on the repo's default branch (`master`) root; commit + push serves it.
  Use relative paths + relative SW scope (already done). Local check: any static HTTP server
  (`python -m http.server 8000`) — `file://` breaks modules+SW.
- Manifest `background_color` = **`#faf7f0` (light paper)** — the PWA **splash screen** background
  (owner request 2026-08; icon + name text on it at launch). It's a single static color (can't
  follow the theme), while `theme_color` stays dark `#211e1a`. Installed PWAs cache the manifest —
  splash changes may need uninstall + reinstall to show (Edge installs shortcut-style PWAs; same
  manifest fields as Chrome).

## How to verify (no full browser available here)

Edge/Chrome binaries are absent in this environment; PDFs/headless rendering are limited. Verify by:
1. `node --check` every changed `.js`.
2. **DOM-stub simulation in Node** (Node 24 here: `globalThis.navigator` is a **read-only getter** —
   install the stub with `Object.defineProperty(globalThis,'navigator',{value:nav,configurable:true})`,
   a plain assignment throws `Cannot set property navigator`) — stub `document`/`window`/`localStorage`/`requestAnimationFrame`,
   `import('./js/app.js')`, then find elements by text and `.click()` them to drive flows. This has
   reliably caught render/logic breaks for the workout flow, challenge run, video dialogs, wake
   lock, hold-timer auto-stop, and backup import/export. (Pattern: a minimal `N` node class with
   appendChild/textContent/listeners/classList — classList needs `toggle` too (`settingRow` uses
   it) and buttons found by `aria-label` when icon-only; seed `localStorage` before import to test
   specific states; stub `navigator.wakeLock`/`navigator.clipboard` to assert those flows; override
   `setInterval` (≥1000ms → 2ms) to fast-forward timers — but on Windows Node still ticks at the
   ~15ms timer resolution, so a 40s hold takes ~600ms: **poll for the expected state with a
   timeout instead of fixed sleeps**; dialogs live on `document.body` as
   `.sys-overlay` siblings of `#app` — search there, and allow ~250ms after close before asserting
   removal. 2026-09 additions: `innerHTML` must be a real setter/getter (icon spans are checked
   by comparing `innerHTML` to `ICONS.x`; the video dialog's iframe `src` — e.g. `start=10` — is
   read from it too). Test `sw.js` by evaluating its source with
   `new Function('self','caches','fetch', src)` against a stub `self` that records listeners, then
   fire fake `install` / `fetch` events with a `waitUntil` collector. Stretch-day checks
   (2026-10): the rest screen's "הבא:" line repeats the next exercise's name, so wait for the
   step's own controls (a stretch hold that auto-started shows "עצור ⏹"; a prep screen shows
   "התחל עכשיו ▶"), not just the name; Plan A = 25 steps
   (+8 on stretch days) but 32 work results, because a superset step logs one result per exercise.)
3. Pure logic (readiness, stats, streaks) tested by importing the functions directly with crafted
   `history` arrays.
Tell the user to do the real visual check by serving over HTTP (`file://` breaks modules+SW) and
opening in a browser / installing on phone (for haptics + sound).

---

# HOW TO READ A WORKOUT PDF AND IMPLEMENT IT

The program PDFs share one layout Procedure:

### 1. Extract the text
Native `pdftotext` is available but **Hebrew filenames fail** (encoding). Copy to an ASCII name
first, then extract with layout + UTF-8:
```bash
cp "<the hebrew file>.pdf" "$SCRATCHPAD/_tmp.pdf"       # glob (./*.pdf) in bash handles the bytes
pdftotext -layout -enc UTF-8 "$SCRATCHPAD/_tmp.pdf" "$SCRATCHPAD/_tmp.txt"
```
(Roei drops the new level PDF in the **project root**; keep temp files in the scratchpad.)
Then **Read** `_tmp.txt` with the Read tool (don't `cat` — and don't `sed`/`grep` with Hebrew
literals; bidi control chars (`‫ ‬`, `‪ ‬`) wrap every line and break pattern matches). Clean up
temp files when done. Rendering pages to images (`pdftoppm`) is NOT available here.

Text is logical-order RTL with bidi marks; read carefully, numbers are LTR.

**`-layout` interleaves the sets/reps/rest tables** — a bonus exercise's `סטים`/`מנוחה` row can
print *above* its own title, so reading the flat text alone mis-assigns values. Confirm every block
with a **positioned-text dump** (pypdf `extract_text(visitor_text=…)`, bucket words by `tm[5]` into
lines, sort each line by `-tm[4]` = RTL order, write UTF-8 to a file, then Read it). Each table then
reads as one clean line: `סטים | חזרות | מנוחה` followed by its values.
(Python here prints to a **cp1252** console — always write Hebrew output to a UTF-8 file, never to
stdout, or it dies with `UnicodeEncodeError`.)

**Video links:** `pdftotext` drops link annotations. Extract them with Python + `pypdf`
(`pip install pypdf`; installed 2026-08): iterate `page["/Annots"]`, take `/Subtype == /Link` →
`/A` `/URI` + `/Rect`, and match each rect to the text under it via `extract_text(visitor_text=…)`
to learn which exercise the link belongs to. Every exercise has a YouTube link; the challenge page
has a demo video; ignore the recurring promo/affiliate links and the generic "מה זה סופרסטים"
explainer (`PJqPEcy7JXU`). Put the results in the `VIDEOS` map (`workouts.js`) keyed by exact
exercise name, and the challenge demo in the challenge's `video` field.

### 2. Understand the page structure
Each level PDF, in order:
- **Intro**: name, `שלב הבסיס | רמה X`, settings (3×/week, alternate order `A B A1` then `B A B2`),
  bonus-legs note.
- **אימון A**: `לפני הכול - חימום` + `חימום פלג גוף עליון` (warmup), then exercise blocks.
- **אימון B**: same shape (note `(לא באותו יום עם אימון A)`).
- **אתגר מעבר X#**: explanation, 4 conditions, then `האתגר (מבצעים ברצף)` = the sequence
  (moves joined by `>-` / `->` arrows). **Changes every level** (move set and counts differ).
- `מפת התוכנית` (map), `אימון רגליים (בונוס)` (**legs bonus — currently SKIPPED**),
  `עליך לזכור` (4 iron rules).

### 3. Parse each exercise block
A block prints three labels — `סטים` (sets), `חזרות` (reps), `מנוחה` (rest) — around the values.
A **superset** shows `וישר בלי מנוחה >-` between two moves and the word `סופרסטים`, with a
per-exercise rep line each (e.g. `מקבילים: 5-8`, `שכיבות סמיכה: 10-15 חזרות`). Rest applies to the
whole superset.

### 4. Map notation → target type (`workouts.js`)
| PDF text                         | encode as            |
|----------------------------------|----------------------|
| `12`                             | `fixed(12)`          |
| `8-10`, `10-12`                  | `range(8,10)`        |
| `מקסימום`                         | `max()`              |
| `מקסימום עד 15`                   | `maxCap(15)`         |
| `החזקה 12-20 שניות`, `30-60 שניות`| `time(12,20)` (hold) |

Rest words → seconds: `דקה`=60, `דקה וחצי`=90, `2 דקות`=120, `2.5 דקות`=150, `3 דקות`=180,
`---`=0 (extend `restText` if a new value appears). Warmup superset (block 1) = **1 round**.

### 5. Write the plan data
Build `PLAN_A` / `PLAN_B` as ordered `blocks` (single/superset), exact Hebrew exercise `name`,
`target`, `sets`, `restSec`. Keep names consistent across A/B and the challenge `source` — the
challenge readiness matches exercises **by exact name string**.

### 6. Encode the rank-up challenge (`challenges.js`)
Add/replace the `CHALLENGES` entry for the level: `id` (e.g. `'2.5'`), `name`, `conditions` (the 4
lines), and `sequence` in order. For each move set `source` to the **matching workout exercise
name**, `requirement` to the challenge count (for the dragon-flag/timed hold, use a sensible
negative-rep proxy, e.g. `3`, since there's no direct hold metric). Set `state.js`
`DEFAULT_STATE.currentChallenge` if introducing the first/new current level.

### 7. Wire + verify
- Add any new `js` file to `sw.js` `SHELL` and **bump `CACHE`**.
- `node --check`, then DOM-stub simulate: home renders, full A & B run to summary, `nextPlan`
  flips, challenge card shows correct `%`, guided run passes. Test readiness with crafted history
  (e.g. logging ≥ requirement in 2 sessions flips a move to ready; 1 session does not).
- Confirm exercise-name strings in `challenges.js` `source` exactly equal those in `workouts.js`.

### Notes / gotchas
- Readiness for moves whose challenge count **exceeds** the workout's prescribed reps (e.g. needs
  14 pull-ups but plan prescribes 8–10) requires the user to **log actual reps** — by default
  capacity is only the prescribed max. The goal card nudges logging.
- `max()` (uncapped) yields no readiness signal unless reps are logged.
- **Ramp-up:** sessions run a *scaled copy* of the plan (`scaledPlan`); never mutate `PLAN_*`. Apply
  scaling only at the `renderHome` choke point (don't re-scale per render → double-scaling). Warmup
  (block 0) and pure `max()` are intentionally unscaled.
- Don't re-add XP/levels/rank. Don't add the bonus legs workout unless asked.
- The stretching routine is the owner's own list, not part of the PDF procedure — editing it means
  editing `stretches.js` (name/sec/video timestamp/side), nothing else; the run UI is generic.
