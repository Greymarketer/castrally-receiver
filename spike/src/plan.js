// @ts-check
// The measurement grid: 3 canvas resolutions x 3 draw distances. Resolution-major order,
// so the T2/T3 pair (same segments, different resolution) is adjacent in the results.

/** @typedef {{ w: number, h: number, segments: number }} Cell */

const RESOLUTIONS = [[1280, 720], [960, 540], [854, 480]];
const SEGMENTS = [150, 100, 60];

/** @type {Cell[]} */
export const CELLS = RESOLUTIONS.flatMap(([w, h]) => SEGMENTS.map((segments) => ({ w, h, segments })));

const fast = new URLSearchParams(location.search).has('fast');
export const CELL_SECONDS = fast ? 3 : 15;
export const DISCARD_SECONDS = fast ? 1 : 5; // JIT and shader warm-up skew the first seconds
export const BENCH_MS = fast ? 200 : 1000;   // per micro-benchmark
export const RESULTS_INTERVAL_MS = 5000;     // how often results go back to the senders
export const OVERLAY_REFRESH_MS = 500;

/** @param {Cell} cell */
export const cellName = (cell) => `${cell.w}x${cell.h}/${cell.segments}`;
