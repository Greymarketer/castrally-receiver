// @ts-check
// Two micro-benchmarks that tell GPU-backed canvas from software raster:
// full-screen fills (fill-rate bound) and scaled drawImage calls (draw-call bound).
import { SPRITES } from './atlas.js';

/**
 * @param {CanvasRenderingContext2D} ctx @param {HTMLCanvasElement} atlas
 * @param {number} ms wall time to spend on each benchmark
 */
export function runBench(ctx, atlas, w, h, ms) {
  return {
    fillMsPerOp: timeOps(ctx, ms, 50, (i) => {
      ctx.fillStyle = i & 1 ? '#123456' : '#654321';
      ctx.fillRect(0, 0, w, h);
    }),
    drawImageMsPerOp: timeOps(ctx, ms, 500, (i) => {
      const s = SPRITES.car0;
      ctx.drawImage(atlas, s.x, s.y, s.w, s.h, (i * 37) % w, (i * 53) % h, 100 + (i % 5) * 20, 75 + (i % 5) * 15);
    }),
  };
}

/** Runs batches of `batch` ops until `ms` elapsed; a 1-pixel readback forces the GPU to finish. */
function timeOps(ctx, ms, batch, op) {
  const start = performance.now();
  let ops = 0;
  while (performance.now() - start < ms) {
    for (let i = 0; i < batch; i++) op(i);
    ctx.getImageData(0, 0, 1, 1);
    ops += batch;
  }
  return Number(((performance.now() - start) / ops).toFixed(3));
}
