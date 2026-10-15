// @ts-check
// Big on-TV text. Rendered to its own canvas at 2 Hz and blitted each frame with one drawImage,
// so the text itself is not what the spike measures.

const LINE = 1.3;

export class Overlay {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = /** @type {CanvasRenderingContext2D} */ (this.canvas.getContext('2d'));
    this.fontPx = 24;
    this.margin = 0;
  }

  /** Text is sized from the canvas height; the 5% margin is the standard TV safe zone. */
  resize(w, h) {
    this.fontPx = Math.round(h / 36); // ~94 chars per line, 22 lines fit at 720p and 480p
    this.margin = Math.round(w * 0.05);
    this.canvas.width = w - this.margin * 2;
    this.canvas.height = h - Math.round(h * 0.05) * 2;
  }

  /** @param {string[]} lines */
  update(lines) {
    const c = this.ctx, lh = this.fontPx * LINE, pad = this.fontPx / 2;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.fillStyle = 'rgba(0,0,0,0.7)';
    c.fillRect(0, 0, this.canvas.width, Math.min(this.canvas.height, lines.length * lh + pad * 2));
    c.font = `${this.fontPx}px Menlo, Consolas, monospace`;
    c.textBaseline = 'top';
    lines.forEach((line, i) => {
      c.fillStyle = line.startsWith('FAIL') ? '#ff6b6b' : line.startsWith('PASS') ? '#7CFC98' : '#fff';
      c.fillText(line, pad, pad + i * lh);
    });
  }

  /** @param {CanvasRenderingContext2D} ctx */
  draw(ctx) {
    ctx.drawImage(this.canvas, this.margin, Math.round(ctx.canvas.height * 0.05));
  }
}
