// Simple countdown rest timer. Calls onTick(remainingSec) each second and
// onDone() when it reaches zero. Returns a handle with stop().

export function startTimer(seconds, onTick, onDone) {
  let remaining = seconds;
  let stopped = false;
  onTick(remaining);

  const id = setInterval(() => {
    if (stopped) return;
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(id);
      onTick(0);
      onDone();
    } else {
      onTick(remaining);
    }
  }, 1000);

  return {
    stop() {
      stopped = true;
      clearInterval(id);
    },
  };
}

// Count-up stopwatch. Calls onTick(elapsedSec) each second (and once at 0).
export function startStopwatch(onTick) {
  let sec = 0;
  onTick(0);
  const id = setInterval(() => {
    sec += 1;
    onTick(sec);
  }, 1000);
  return {
    stop() { clearInterval(id); },
    get elapsed() { return sec; },
  };
}

export function fmtClock(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
