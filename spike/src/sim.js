// @ts-check
// Stand-in for the game's physics: 8 cars of float math at a fixed 60 Hz, so the spike's
// frame budget includes simulation cost, not just drawing.

const STEP = 1 / 60;
const MAX_STEPS = 3; // cap catch-up after a long frame; the rest is dropped on purpose

export class Sim {
  constructor(cars = 8) {
    this.cars = Array.from({ length: cars }, (_, i) => ({ x: i * 0.3, v: 40 + i, heading: 0, yaw: 0, susp: 0, suspV: 0 }));
    this.acc = 0;
    this.steps = 0;
  }

  /** @param {number} dt seconds since the previous frame */
  step(dt) {
    this.acc = Math.min(this.acc + dt, STEP * MAX_STEPS);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.steps++;
      for (const c of this.cars) {
        const steer = Math.sin(this.steps * 0.01 + c.x) * 0.3;
        const grip = 1 - Math.min(0.8, Math.abs(c.yaw) * 0.5);
        c.yaw += (steer * c.v * 0.02 - c.yaw * grip) * STEP;
        c.heading += c.yaw * STEP;
        c.v += (50 - c.v * 0.1 - Math.abs(c.yaw) * 5) * STEP;
        c.x += Math.cos(c.heading) * c.v * STEP;
        const bump = Math.sin(c.x * 0.05) * 0.02;
        c.suspV += (bump - c.susp) * 400 * STEP - c.suspV * 8 * STEP;
        c.susp += c.suspV * STEP;
      }
    }
  }
}
