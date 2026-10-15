// @ts-check
// Spike orchestration: bench -> 9 measurement cells -> soak at the best passing cell.
// Everything the user needs is printed on the TV and sent back to connected senders.
import { BUILD } from './build.js';
import { CELLS, CELL_SECONDS, DISCARD_SECONDS, BENCH_MS, RESULTS_INTERVAL_MS, OVERLAY_REFRESH_MS, cellName } from './plan.js';
import { FrameWindow, summarize, passes, pickBest, PASS } from './metrics.js';
import { Overlay } from './overlay.js';
import { Road } from './road.js';
import { runBench } from './bench.js';
import { Sim } from './sim.js';
import { Synth } from './audio.js';
import { startCast, isCastDevice } from './cast.js';
import { probeEnvironment, heapMB } from './env.js';

const params = new URLSearchParams(location.search);
const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('view'));
const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d', { alpha: false }));

const state = {
  phase: 'bench', // bench -> waiting (for a sender's start) -> cell -> soak
  cellIndex: -1,
  cellStart: 0,
  results: /** @type {{ cell: typeof CELLS[0], summary: ReturnType<typeof summarize>, pass: boolean }[]} */ ([]),
  best: /** @type {typeof CELLS[0] | null} */ (null),
  soak: { start: 0, long50: 0, frames: 0, msgs: 0 },
  firstFrameMs: 0,
  events: /** @type {string[]} */ ([]),
  env: probeEnvironment(),
  bench: { fillMsPerOp: 0, drawImageMsPerOp: 0 },
};

const win = new FrameWindow();
const overlay = new Overlay();
const road = new Road();
const sim = new Sim();
const synth = new Synth();
let lastOverlayAt = 0, lastResultsAt = 0, lastFrameAt = 0;

const cast = params.has('dev') || !isCastDevice() ? null : startCast({
  debug: params.has('debug'),
  onMessage: (senderId, data) => {
    win.noteMessage(performance.now());
    if (state.phase === 'soak') state.soak.msgs++;
    if (data?.t === 'ping') send({ t: 'pong', at: data.at });
    if (data?.t === 'results') sendResults();
    if (data?.t === 'restart') location.reload();
    if (data?.t === 'start' && state.phase === 'waiting') state.phase = 'cell';
    synth.resume();
  },
  onEvent: (type, detail) => logEvent(`${type} ${detail}`),
});
logEvent(cast ? 'cast receiver started' : /CrKey/.test(navigator.userAgent) ? 'CAST SDK FAILED TO LOAD (gstatic unreachable?)' : 'no Cast (dev mode)');
window.addEventListener('error', (e) => logEvent(`ERROR ${e.message}`));
window.addEventListener('keydown', () => { synth.resume(); if (state.phase === 'waiting') state.phase = 'cell'; });

synth.start();
applyCell(CELLS[0]);
state.bench = runBench(ctx, road.atlas, canvas.width, canvas.height, BENCH_MS);
// With a sender, cells wait for its "Start" so every cell runs under the 120 msg/s flood.
state.phase = cast ? 'waiting' : 'cell';
document.getElementById('boot')?.remove();
requestAnimationFrame(tick);

/** @param {number} now rAF timestamp */
function tick(now) {
  requestAnimationFrame(tick); // first, so nothing below can end the loop
  const t0 = performance.now();
  if (!state.firstFrameMs) state.firstFrameMs = Math.round(t0);
  const interval = lastFrameAt ? now - lastFrameAt : 0;
  lastFrameAt = now;
  const dt = Math.min(0.1, interval / 1000 || 1 / 60);

  advance(now);
  sim.step(dt);
  synth.modulate(road.speedPercent);
  road.render(ctx, dt);
  if (now - lastOverlayAt > OVERLAY_REFRESH_MS) { lastOverlayAt = now; overlay.update(lines(now)); }
  overlay.draw(ctx);

  const callbackMs = performance.now() - t0;
  const inCell = state.phase === 'cell' && now - state.cellStart >= DISCARD_SECONDS * 1000;
  if (inCell || state.phase === 'soak') win.record(interval, callbackMs);
  if (state.phase === 'soak') { state.soak.frames++; if (interval > 50) state.soak.long50++; }
  if (now - lastResultsAt > RESULTS_INTERVAL_MS) { lastResultsAt = now; sendResults(); }
}

/** Moves bench -> cells -> soak on the rAF clock. */
function advance(now) {
  if (state.phase === 'cell') {
    if (state.cellIndex < 0) startCell(0, now);
    else if (now - state.cellStart >= CELL_SECONDS * 1000) {
      const cell = CELLS[state.cellIndex];
      const summary = summarize(win, CELL_SECONDS - DISCARD_SECONDS);
      state.results.push({ cell, summary, pass: passes(summary, cell) });
      if (state.cellIndex + 1 < CELLS.length) startCell(state.cellIndex + 1, now);
      else startSoak(now);
    }
  }
}

function startCell(index, now) {
  state.cellIndex = index;
  state.cellStart = now;
  win.reset();
  applyCell(CELLS[index]);
}

function startSoak(now) {
  const best = pickBest(state.results);
  state.best = best ? best.cell : null;
  state.phase = 'soak';
  state.soak.start = now;
  win.reset();
  applyCell(state.best || CELLS[CELLS.length - 1]); // nothing passed: soak the lightest cell anyway
  logEvent(best ? `soak at ${cellName(best.cell)}` : 'FAIL: no cell passed -> top-down fallback (approach B); soaking lightest cell for crash/crackle only');
}

/** @param {typeof CELLS[0]} cell */
function applyCell(cell) {
  canvas.width = cell.w; canvas.height = cell.h;
  road.drawDistance = cell.segments;
  road.resize(ctx, cell.w, cell.h);
  overlay.resize(cell.w, cell.h);
}

function lines(now) {
  const e = state.env, b = state.bench, s = state.soak;
  const out = [
    `CastRally spike ${BUILD}   ${phaseLabel(now)}   senders ${cast ? cast.senderCount() : 'n/a'}`,
    `UA ${e.ua.slice(0, 90)}`,
    `viewport ${e.viewport} dpr ${e.dpr} cores ${e.cores}  canvas ${canvas.width}x${canvas.height}  first frame ${state.firstFrameMs} ms`,
    `WebGL ${e.webgl}`.slice(0, 90),
    `audio ${synth.status}`,
    `bench fill ${b.fillMsPerOp} ms/op  drawImage ${b.drawImageMsPerOp} ms/op  heap ${heapMB()} (bucketised)`,
    `pass = segments>=${PASS.minSegments} (60-seg rows n/a), p99<=${PASS.intervalP99Ms} ms, cb95<=${PASS.callbackP95Ms} ms, msgs ~120/s`,
  ];
  if (state.phase === 'waiting') out.push('WAITING: press Flood, then Start on the sender page');
  for (const r of state.results) {
    const m = r.summary;
    const verdict = r.cell.segments < PASS.minSegments ? 'n/a ' : r.pass ? 'PASS' : 'FAIL';
    out.push(`${verdict} ${cellName(r.cell).padEnd(13)} rAF ${m.rafRate}/s p99 ${m.intervalP99} cb95 ${m.callbackP95} long ${m.long50} msgs ${m.msgsPerSec}/s gap ${m.maxGapMs}`);
  }
  if (state.phase === 'soak') {
    const mins = ((now - s.start) / 60000).toFixed(1);
    out.push(state.best ? `best ${cellName(state.best)}  soak ${mins} min  long>50 ${s.long50}/${s.frames}  msgs ${s.msgs}` : `FAIL: nothing passed -> approach B. soak ${mins} min (lightest cell, not a pass)`);
  }
  out.push(...state.events.slice(-5));
  return out;
}

function phaseLabel(now) {
  if (state.phase !== 'cell') return state.phase;
  const t = Math.floor((now - state.cellStart) / 1000);
  return `cell ${state.cellIndex + 1}/${CELLS.length} ${cellName(CELLS[state.cellIndex])} ${t}s${t < DISCARD_SECONDS ? ' warm-up' : ''}`;
}

function logEvent(text) {
  state.events.push(`${new Date().toISOString().slice(11, 19)} ${text}`);
  if (state.events.length > 50) state.events.shift();
}

function sendResults() {
  const payload = { t: 'results', build: BUILD, phase: state.phase, env: state.env, bench: state.bench, firstFrameMs: state.firstFrameMs,
    cells: state.results, best: state.best, soak: state.soak, events: state.events.slice(-20) };
  send(payload);
  try { localStorage.setItem('castrally-spike', JSON.stringify(payload)); } catch { /* storage may be unavailable */ }
}

/** sendCustomMessage throws before READY; a throw must never end the frame loop. */
function send(data) {
  try { cast?.send(data); } catch (e) { logEvent(`send failed ${e}`); }
}
