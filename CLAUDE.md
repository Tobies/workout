# CLAUDE.md — Workout PWA ("System" tracker)

Project memory + operating manual. Read this first when resuming work.

## What this is

Personal calisthenics workout-tracking **PWA**, hosted on **GitHub Pages**, built for Roei
(owner). Tracks his coach's program (the "שלב הבסיס" / Base Stage calisthenics plan). Two
alternating upper-body workouts **Plan A** / **Plan B**, plus a per-level **rank-up challenge**
("אתגר מעבר") used to advance to the next level.

- **Hebrew / RTL**, mobile-first, also fine on desktop.
- **Offline-capable, installable** PWA. Persists everything in `localStorage`.
- **No build step.** Vanilla HTML/CSS/ES-modules. Commit files → GitHub Pages serves them.

## NON-NEGOTIABLE PRINCIPLES (do not violate without explicit ask)

1. **Real, tangible data only. No fake gamification.** XP, levels, hunter rank, fabricated RPG
   stat windows were deliberately **removed**. Do NOT reintroduce them. Stats must derive from
   actual logged workout history. (The Solo-Leveling *visual* theme — terminal "System" framing —
   stays; the fake *progression mechanics* do not.)
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
assets/icons/icon.svg   single SVG icon (no PNGs — no image tooling available here)
js/
  app.js        entry. View router + all rendering: home, workout session, rest, summary,
                challenge card + guided challenge run, theme toggle, sound/haptic toggles.
  state.js      localStorage load/save; derived real stats; challenge readiness prediction.
  workouts.js   Plan A & B data + target/rest helpers.
  challenges.js rank-up challenge data + helpers.
  timer.js      startTimer (countdown), startStopwatch (count-up), fmtClock.
  system.js     DOM helpers: el(), clear(), systemWindow(), systemDialog(), notify().
  feedback.js   WebAudio synth sounds + navigator.vibrate haptics; persisted prefs + toggles.
```

`localStorage` keys: `slworkout.v1` (state), `slworkout.prefs` (sound/haptics), `slworkout.theme`.

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

`targetMax` = the **prescribed max**, used as the default capacity when the user didn't log reps
(decision: assume they hit the prescribed max). Uncapped `max()` → null → no readiness signal.

`restText(sec)`: 60→"דקה", 90→"דקה וחצי", multiples of 60→"N דקות", else "N שניות".
⚠ Odd rests seen in PDFs (e.g. **150s = "2.5 דקות"**, or "---" = no rest). If a new level uses
those, extend `restText` rather than mis-render.

`totalSets(plan)` sums sets.

## State + stats — `state.js`

```js
DEFAULT_STATE = {
  nextPlan: 'A',                 // flips A↔B after each completed workout
  history: [ { dateISO, plan:'A'|'B', durationSec,
               sets:[ { exercise, target, targetMax|null, actual|null, done } ] } ],
  currentChallenge: '2.5', challengesPassed: [], challengeNotified: false,
}
```
`load()` spreads DEFAULT over saved (so old saves missing new keys are fine; leftover removed keys
like `xp` are harmless).

Real stats (`stats(state)`): totalWorkouts, totalTimeSec, totalSets, streak/longestStreak
(`streaks()` — consecutive sessions within `GRACE_DAYS=4`, since goal is 3×/week), weekCount
(`WEEKLY_GOAL=3`). `fmtDuration(sec)` → Hebrew "1ש' 12ד'".

**Challenge readiness** `challengeReadiness(state, challenge)`:
- Per sequence item, gather per-session capacity for `item.source` (newest first): max over that
  session's matching sets of `actual ?? targetMax` (null = no signal that session).
- Item `ready` only if it cleared `requirement` in the most recent **`CHALLENGE_STREAK=2`**
  sessions with data (exact threshold, no margin). Prevents one-off flukes.
- Returns `{ items:[{label,requirement,capacity,sessions,enough,ready}], readyCount, total,
  ready, percent }`. `percent` = mean of per-item `min(100, capacity/requirement*100)`.
- `recordChallengePass(state, id, nextId)` pushes id, sets `currentChallenge=nextId`, resets notify.

## Challenges — `challenges.js`

```js
CHALLENGES = [{ id, name, conditions:[...], sequence:[
  { kind:'hold', label, sec, source:'<workout exercise name>', requirement:<reps> }, // dragon flag: 3s, proxied by negative reps
  { kind:'reps', label, count, source:'<workout exercise name>', requirement:<reps> },
]}]
```
`source` MUST exactly match an exercise `name` in `workouts.js` or readiness can't find data.
Helpers: `getChallenge(id)`, `nextChallengeId(id)`, `reqText(item)`.

## UI flow — `app.js`

- **Home** (`renderHome`): top bar (theme 🌙/☀️, sound 🔊/🔇, haptic 📳 toggles) · **נתונים** stats
  window (header `שלב בסיס · רמה 2.5` + real stat grid) · **יעד** challenge goal card (collapsed
  `<details>`, summary shows `X% מוכן` + bar; expand for per-move readiness + run button) ·
  **המשימה הבאה** next plan + START.
- **Session** (`renderStep`→`completeStep`→`renderRest`): per set show exercise(s) + target;
  superset shows both. Optional rep logging (`<details>` "רישום חזרות"). `time` targets get a
  count-up **hold timer** (`makeHoldTimer`) that auto-fills the logged seconds. `completeStep`
  stores `{exercise, target, targetMax, actual, done}`. Rest = countdown ring (SVG sweep, gold +
  ticks in last 3s); no rest after final set. `finishWorkout` saves history, flips `nextPlan`,
  shows plain summary (sets + time — **no XP**).
- **Challenge run**: `renderChallengePre` (conditions checklist) → `renderChallengeStep`
  (each move in order, no rest; hold move uses stopwatch to its `sec`) → `renderChallengeVerdict`
  (honest pass/fail) → `passChallenge` (record + advance + dialog). Ready-notification fires once
  via `maybeNotifyReady` when readiness crosses to ready.

## Theme + feedback

- Theme: CSS vars on `:root` (dark) + `:root[data-theme="light"]`. All surfaces use vars
  (`--cell-bg`, `--track-bg`, `--input-bg`, `--overlay-bg`, `--primary-bg`). `app.js`
  loadTheme/applyTheme/toggleTheme; inline `<head>` script applies before paint (no flash).
  Keep animations minimal (one fade); honor `prefers-reduced-motion`.
- Feedback: `fx.{tap,start,complete,tick,restEnd,levelUp,finish}` synth + vibrate; gated by
  persisted prefs. Audio unlocked on first user gesture (`unlock()` from START).

## PWA / deploy

- `sw.js`: list every shipped file in `SHELL`; **bump `CACHE` ('slworkout-vN')** whenever any
  cached file changes, or users get stale assets. Add new `js/*.js` to `SHELL`.
- Deploy = enable GitHub Pages on the repo's default branch root. Not yet a git repo — `git init`
  when asked. Use relative paths + relative SW scope (already done).

## How to verify (no full browser available here)

Edge/Chrome binaries are absent in this environment; PDFs/headless rendering are limited. Verify by:
1. `node --check` every changed `.js`.
2. **DOM-stub simulation in Node** — stub `document`/`window`/`localStorage`/`requestAnimationFrame`,
   `import('./js/app.js')`, then find elements by text and `.click()` them to drive flows. This has
   reliably caught render/logic breaks for the workout flow and challenge run. (Pattern: a minimal
   `N` node class with appendChild/textContent/listeners/classList; seed `localStorage` before
   import to test specific states.)
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
cd "C:/Users/Roei/Downloads/Workouts App"
cp "old workouts/<the hebrew file>.pdf" ./_tmp.pdf      # glob in bash handles the bytes
pdftotext -layout -enc UTF-8 ./_tmp.pdf ./_tmp.txt
```
Then **Read** `_tmp.txt` with the Read tool (don't `cat` — and don't `sed`/`grep` with Hebrew
literals; bidi control chars (`‫ ‬`, `‪ ‬`) wrap every line and break pattern matches). Clean up
temp files when done. Rendering pages to images (`pdftoppm`) is NOT available here.

Text is logical-order RTL with bidi marks; read carefully, numbers are LTR.

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
- Don't re-add XP/levels/rank. Don't add the bonus legs workout unless asked.
