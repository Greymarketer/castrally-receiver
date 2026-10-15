// @ts-check
// Frame-time bookkeeping and the pass/fail rule. Pure: no DOM, so node --test can run it.

export const PASS = { minSegments: 100, intervalP99Ms: 36, callbackP95Ms: 20 };

/** Fixed-capacity sample window: typed arrays so measuring does not itself allocate. */
export class FrameWindow {
  constructor(capacity = 2400) {
    this.intervals = new Float64Array(capacity);
    this.callbacks = new Float64Array(capacity);
    this.reset();
  }

  reset() {
    this.n = 0;
    this.overflow = 0;   // samples beyond capacity (soak runs for minutes)
    this.long50 = 0;     // frames whose rAF interval exceeded 50 ms
    this.msgs = 0;
    this.maxGapMs = 0;
    this.lastMsgAt = 0;
  }

  /** @param {number} intervalMs rAF-to-rAF  @param {number} callbackMs time spent inside the callback */
  record(intervalMs, callbackMs) {
    if (this.n < this.intervals.length) {
      this.intervals[this.n] = intervalMs;
      this.callbacks[this.n] = callbackMs;
      this.n++;
    } else {
      this.overflow++;
    }
    if (intervalMs > 50) this.long50++;
  }

  /** @param {number} nowMs */
  noteMessage(nowMs) {
    this.msgs++;
    if (this.lastMsgAt) this.maxGapMs = Math.max(this.maxGapMs, nowMs - this.lastMsgAt);
    this.lastMsgAt = nowMs;
  }
}

/** Nearest-rank percentile over the first n values. @param {Float64Array} values */
export function percentile(values, n, p) {
  if (n === 0) return NaN;
  const sorted = values.slice(0, n).sort();
  return sorted[Math.max(0, Math.ceil(p * n) - 1)];
}

/** @param {FrameWindow} win @param {number} seconds measured span */
export function summarize(win, seconds) {
  const frames = win.n + win.overflow;
  return {
    frames,
    rafRate: round(frames / seconds, 1),
    intervalP99: round(percentile(win.intervals, win.n, 0.99), 1),
    callbackP95: round(percentile(win.callbacks, win.n, 0.95), 1),
    long50: win.long50,
    msgsPerSec: round(win.msgs / seconds, 1),
    maxGapMs: Math.round(win.maxGapMs),
  };
}

/** @param {ReturnType<typeof summarize>} s @param {{ segments: number }} cell */
export function passes(s, cell) {
  return cell.segments >= PASS.minSegments
    && s.intervalP99 <= PASS.intervalP99Ms
    && s.callbackP95 <= PASS.callbackP95Ms;
}

/**
 * Best passing cell: highest resolution first, then longest draw distance.
 * @template {{ cell: { w: number, segments: number }, pass: boolean }} R
 * @param {R[]} results @returns {R | null}
 */
export function pickBest(results) {
  const passing = results.filter((r) => r.pass);
  passing.sort((a, b) => (b.cell.w - a.cell.w) || (b.cell.segments - a.cell.segments));
  return passing[0] || null;
}

const round = (x, d) => Number.isFinite(x) ? Number(x.toFixed(d)) : x;
