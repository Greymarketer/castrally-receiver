// @ts-check
// A procedural sprite sheet drawn once at boot, so the spike exercises the real hot path
// (scaled 9-argument drawImage from one image) without shipping any art.

export const SPRITES = {
  tree: { x: 0, y: 0, w: 160, h: 240 },
  bush: { x: 160, y: 120, w: 160, h: 120 },
  sign: { x: 320, y: 80, w: 120, h: 160 },
  car0: { x: 0, y: 240, w: 160, h: 120 },
  car1: { x: 160, y: 240, w: 160, h: 120 },
  car2: { x: 320, y: 240, w: 160, h: 120 },
  car3: { x: 480, y: 240, w: 160, h: 120 },
};
export const ROADSIDE = ['tree', 'bush', 'sign', 'tree'];
export const CARS = ['car0', 'car1', 'car2', 'car3'];

const CAR_COLORS = ['#d62828', '#1d4ed8', '#f4a300', '#15803d'];

/** @returns {HTMLCanvasElement} a plain canvas element (OffscreenCanvas is deliberately not used) */
export function buildAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const c = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

  // tree
  c.fillStyle = '#5b3a1e'; c.fillRect(70, 170, 20, 70);
  c.fillStyle = '#1f7a1f'; triangle(c, 80, 0, 0, 180, 160, 180);
  c.fillStyle = '#2f9e2f'; triangle(c, 80, 40, 20, 150, 140, 150);
  // bush
  c.fillStyle = '#2d8a2d';
  for (const [x, r] of [[205, 40], [240, 55], [275, 40]]) { c.beginPath(); c.arc(x, 185, r, 0, Math.PI * 2); c.fill(); }
  // sign
  c.fillStyle = '#777'; c.fillRect(372, 160, 16, 80);
  c.fillStyle = '#ffd23f'; c.fillRect(320, 80, 120, 80);
  c.fillStyle = '#000'; c.font = 'bold 48px sans-serif'; c.textAlign = 'center'; c.fillText('!', 380, 140);
  // cars, rear view
  CARS.forEach((_, i) => car(c, SPRITES[CARS[i]].x, SPRITES[CARS[i]].y, CAR_COLORS[i]));
  return canvas;
}

function triangle(c, x1, y1, x2, y2, x3, y3) {
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineTo(x3, y3); c.closePath(); c.fill();
}

/** Rear view of a car in a 160x120 cell. */
function car(c, x, y, color) {
  c.fillStyle = '#111';
  c.fillRect(x + 8, y + 84, 36, 36); c.fillRect(x + 116, y + 84, 36, 36);        // wheels
  c.fillStyle = color;
  c.fillRect(x + 16, y + 40, 128, 60);                                            // body
  c.fillRect(x + 36, y + 14, 88, 36);                                             // cabin
  c.fillStyle = '#9ecbff'; c.fillRect(x + 44, y + 20, 72, 24);                    // rear window
  c.fillStyle = '#ff3b30'; c.fillRect(x + 20, y + 62, 24, 10); c.fillRect(x + 116, y + 62, 24, 10); // lights
}
