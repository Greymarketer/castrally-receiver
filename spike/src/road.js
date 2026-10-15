// @ts-check
// Pseudo-3D road: projected segments plus scaled sprites, the same recipe the game will use.
// Auto-drives a looping track with 8 rival cars; nothing here allocates per frame.
import { SPRITES, ROADSIDE, CARS, buildAtlas } from './atlas.js';

const SEGMENT_LENGTH = 200;
const ROAD_WIDTH = 2000;        // half-width in world units
const RUMBLE_LENGTH = 3;
const LANES = 3;
const CAMERA_HEIGHT = 1000;
const CAMERA_DEPTH = 1 / Math.tan((100 / 2) * Math.PI / 180); // 100 degree field of view
const MAX_SPEED = SEGMENT_LENGTH * 60;
const SPRITE_SCALE = 0.3 / SPRITES.car0.w; // a car is ~0.15 of the road width; player stays below the horizon
const RIVAL_COUNT = 8;
const COLORS = [
  { road: '#6b6b6b', grass: '#10a010', rumble: '#555', lane: '#ccc' },
  { road: '#696969', grass: '#009000', rumble: '#bbb', lane: '' },
];

export class Road {
  constructor() {
    this.atlas = buildAtlas();
    this.segments = buildTrack();
    this.trackLength = this.segments.length * SEGMENT_LENGTH;
    // Rivals start inside the draw window and all run slower than the player (0.9),
    // so every frame has cars at several depths; a passed car respawns at the far edge.
    this.rivals = Array.from({ length: RIVAL_COUNT }, (_, i) => ({
      z: 1500 + i * 3000,
      offset: -0.6 + (i % 4) * 0.4,
      speed: MAX_SPEED * (0.8 + 0.012 * i),
      sprite: SPRITES[CARS[i % CARS.length]],
      segment: 0,
    }));
    this.drawDistance = 100;
    this.position = 0;
    this.time = 0;
    this.speedPercent = 0.9;
    this.w = 0; this.h = 0;
    this.sky = /** @type {CanvasGradient | null} */ (null);
    this.hills = document.createElement('canvas');
    this.trees = document.createElement('canvas');
    this.skyOffset = 0;
  }

  /** @param {CanvasRenderingContext2D} ctx */
  resize(ctx, w, h) {
    this.w = w; this.h = h;
    this.sky = ctx.createLinearGradient(0, 0, 0, h / 2);
    this.sky.addColorStop(0, '#2b6cb0'); this.sky.addColorStop(1, '#bfe3ff');
    paintSilhouette(this.hills, w, h, '#4a7c59', 0.5, 4);
    paintSilhouette(this.trees, w, h, '#2f5e3a', 0.3, 11);
  }

  /** @param {CanvasRenderingContext2D} ctx @param {number} dt seconds */
  render(ctx, dt) {
    const { w, h, segments, trackLength } = this;
    const speed = MAX_SPEED * this.speedPercent;
    this.time += dt;
    this.position = (this.position + speed * dt) % trackLength;
    for (const car of this.rivals) {
      car.z = (car.z + car.speed * dt) % trackLength;
      const ahead = (car.z - this.position + trackLength) % trackLength;
      if (ahead > trackLength / 2) car.z = (this.position + (this.drawDistance - 2) * SEGMENT_LENGTH) % trackLength;
      car.segment = Math.floor(car.z / SEGMENT_LENGTH);
    }
    const base = segments[Math.floor(this.position / SEGMENT_LENGTH)];
    const basePercent = (this.position % SEGMENT_LENGTH) / SEGMENT_LENGTH;
    const playerX = Math.sin(this.time * 0.4) * 0.5;
    const playerY = lerp(base.p1.world.y, base.p2.world.y, basePercent);
    const cameraX = playerX * ROAD_WIDTH;
    const cameraY = playerY + CAMERA_HEIGHT;

    this.skyOffset = (this.skyOffset + base.curve * this.speedPercent * 0.004 + 1) % 1;
    ctx.fillStyle = /** @type {CanvasGradient} */ (this.sky);
    ctx.fillRect(0, 0, w, h);
    const half = Math.round(h / 2);
    ctx.drawImage(this.hills, Math.round(this.skyOffset * w * 0.5), 0, w, half, 0, 0, w, half);
    ctx.drawImage(this.trees, Math.round(this.skyOffset * w), 0, w, half, 0, 0, w, half);

    let maxy = h, x = 0, dx = -(base.curve * basePercent);
    for (let n = 0; n < this.drawDistance; n++) {
      const seg = segments[(base.index + n) % segments.length];
      const loopFix = seg.index < base.index ? trackLength : 0;
      project(seg.p1, cameraX - x, cameraY, this.position - loopFix, w, h);
      project(seg.p2, cameraX - x - dx, cameraY, this.position - loopFix, w, h);
      x += dx; dx += seg.curve;
      seg.clip = maxy;
      if (seg.p1.camera.z <= CAMERA_DEPTH || seg.p2.screen.y >= seg.p1.screen.y || seg.p2.screen.y >= maxy) continue;
      drawSegment(ctx, w, seg);
      maxy = seg.p1.screen.y;
    }

    for (let n = this.drawDistance - 1; n >= 0; n--) {
      const seg = segments[(base.index + n) % segments.length];
      if (seg.p1.camera.z <= CAMERA_DEPTH) continue;
      const s1 = seg.p1.screen;
      for (const sp of seg.sprites) {
        this.drawSprite(ctx, sp.sprite, s1.scale, s1.x + s1.scale * sp.offset * ROAD_WIDTH * w / 2, s1.y, sp.offset < 0 ? -1 : 0, seg.clip);
      }
      for (const car of this.rivals) {
        if (car.segment !== seg.index) continue;
        const p = (car.z % SEGMENT_LENGTH) / SEGMENT_LENGTH;
        const scale = lerp(s1.scale, seg.p2.screen.scale, p);
        const sx = lerp(s1.x, seg.p2.screen.x, p) + scale * car.offset * ROAD_WIDTH * w / 2;
        this.drawSprite(ctx, car.sprite, scale, sx, lerp(s1.y, seg.p2.screen.y, p), -0.5, seg.clip);
      }
    }
    this.drawSprite(ctx, SPRITES.car0, 1 / CAMERA_HEIGHT, w / 2, h, -0.5, 0);
  }

  /** @param {CanvasRenderingContext2D} ctx @param {{x:number,y:number,w:number,h:number}} sprite */
  drawSprite(ctx, sprite, scale, destX, destY, anchorX, clipY) {
    const destW = sprite.w * scale * (this.w / 2) * SPRITE_SCALE * ROAD_WIDTH;
    const destH = sprite.h * scale * (this.w / 2) * SPRITE_SCALE * ROAD_WIDTH;
    destX += destW * anchorX;
    destY -= destH;
    const clipH = clipY ? Math.max(0, destY + destH - clipY) : 0;
    if (clipH < destH) {
      ctx.drawImage(this.atlas, sprite.x, sprite.y, sprite.w, sprite.h - (sprite.h * clipH / destH), destX, destY, destW, destH - clipH);
    }
  }
}

function project(p, cameraX, cameraY, cameraZ, w, h) {
  p.camera.x = p.world.x - cameraX;
  p.camera.y = p.world.y - cameraY;
  p.camera.z = p.world.z - cameraZ;
  p.screen.scale = CAMERA_DEPTH / p.camera.z;
  p.screen.x = Math.round(w / 2 + p.screen.scale * p.camera.x * w / 2);
  p.screen.y = Math.round(h / 2 - p.screen.scale * p.camera.y * h / 2);
  p.screen.w = Math.round(p.screen.scale * ROAD_WIDTH * w / 2);
}

/** @param {CanvasRenderingContext2D} ctx */
function drawSegment(ctx, w, seg) {
  const { x: x1, y: y1, w: w1 } = seg.p1.screen;
  const { x: x2, y: y2, w: w2 } = seg.p2.screen;
  const r1 = w1 / Math.max(6, 2 * LANES), r2 = w2 / Math.max(6, 2 * LANES);
  const l1 = w1 / Math.max(32, 8 * LANES), l2 = w2 / Math.max(32, 8 * LANES);
  const color = seg.color;
  ctx.fillStyle = color.grass;
  ctx.fillRect(0, y2, w, y1 - y2);
  polygon(ctx, x1 - w1 - r1, y1, x1 - w1, y1, x2 - w2, y2, x2 - w2 - r2, y2, color.rumble);
  polygon(ctx, x1 + w1 + r1, y1, x1 + w1, y1, x2 + w2, y2, x2 + w2 + r2, y2, color.rumble);
  polygon(ctx, x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2, color.road);
  if (color.lane) {
    const lw1 = w1 * 2 / LANES, lw2 = w2 * 2 / LANES;
    let lx1 = x1 - w1 + lw1, lx2 = x2 - w2 + lw2;
    for (let lane = 1; lane < LANES; lane++, lx1 += lw1, lx2 += lw2) {
      polygon(ctx, lx1 - l1 / 2, y1, lx1 + l1 / 2, y1, lx2 + l2 / 2, y2, lx2 - l2 / 2, y2, color.lane);
    }
  }
}

function polygon(ctx, x1, y1, x2, y2, x3, y3, x4, y4, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4); ctx.closePath();
  ctx.fill();
}

/** A looping track: curve/hill sections whose height changes sum to zero. */
function buildTrack() {
  const segments = [];
  const point = () => ({ world: { x: 0, y: 0, z: 0 }, camera: { x: 0, y: 0, z: 0 }, screen: { x: 0, y: 0, w: 0, scale: 0 } });
  const add = (curve, y) => {
    const n = segments.length;
    const lastY = n ? segments[n - 1].p2.world.y : 0;
    const seg = { index: n, p1: point(), p2: point(), curve, color: COLORS[Math.floor(n / RUMBLE_LENGTH) % 2], sprites: [], clip: 0 };
    seg.p1.world.y = lastY; seg.p1.world.z = n * SEGMENT_LENGTH;
    seg.p2.world.y = y; seg.p2.world.z = (n + 1) * SEGMENT_LENGTH;
    // 1.5 roadside sprites per segment on average, so 100 segments ≈ 150 sprites + rivals.
    const count = n % 2 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const side = (n + i) % 2 ? 1 : -1;
      seg.sprites.push({ sprite: SPRITES[ROADSIDE[(n * 7 + i) % ROADSIDE.length]], offset: side * (1.2 + ((n * 13 + i * 5) % 7) / 10) });
    }
    segments.push(seg);
  };
  const section = (enter, hold, leave, curve, hill) => {
    const startY = segments.length ? segments[segments.length - 1].p2.world.y : 0;
    const endY = startY + hill * SEGMENT_LENGTH;
    const total = enter + hold + leave;
    for (let n = 0; n < enter; n++) add(easeIn(0, curve, n / enter), easeInOut(startY, endY, n / total));
    for (let n = 0; n < hold; n++) add(curve, easeInOut(startY, endY, (enter + n) / total));
    for (let n = 0; n < leave; n++) add(easeInOut(curve, 0, n / leave), easeInOut(startY, endY, (enter + hold + n) / total));
  };
  section(0, 50, 0, 0, 0);
  section(50, 100, 50, 2, 20);
  section(50, 50, 50, -2, -20);
  section(50, 100, 50, 0, 40);
  section(50, 50, 50, 3, -40);
  section(50, 100, 50, -3, 30);
  section(50, 50, 50, 0, -30);
  segments[segments.length - 1].p2.world.y = 0; // close the loop exactly
  return segments;
}

/** Paints a repeating silhouette twice across a 2w-wide canvas so one drawImage can scroll it. */
function paintSilhouette(canvas, w, h, color, heightFraction, bumps) {
  canvas.width = w * 2; canvas.height = Math.round(h / 2);
  const c = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  c.clearRect(0, 0, canvas.width, canvas.height);
  c.fillStyle = color;
  c.beginPath(); c.moveTo(0, canvas.height);
  for (let x = 0; x <= canvas.width; x += 8) {
    const t = ((x % w) / w) * Math.PI * bumps; // identical halves, so the scroll wrap is seamless
    c.lineTo(x, canvas.height - canvas.height * heightFraction * (0.6 + 0.4 * Math.abs(Math.sin(t)) * Math.cos(t * 0.37)));
  }
  c.lineTo(canvas.width, canvas.height); c.closePath(); c.fill();
}

const lerp = (a, b, p) => a + (b - a) * p;
const easeIn = (a, b, p) => a + (b - a) * p * p;
const easeInOut = (a, b, p) => a + (b - a) * (-Math.cos(p * Math.PI) / 2 + 0.5);
