// @ts-check
// One-off facts about the device the page landed on.

export function probeEnvironment() {
  return {
    ua: navigator.userAgent,
    viewport: `${innerWidth}x${innerHeight}`,
    dpr: devicePixelRatio,
    webgl: probeWebGL(),
    memoryApi: 'memory' in performance,
    cores: navigator.hardwareConcurrency || 0,
  };
}

/** Informational only: whether a WebGL context exists and how big a texture it allows. */
function probeWebGL() {
  try {
    const gl = /** @type {WebGLRenderingContext | null} */ (document.createElement('canvas').getContext('webgl'));
    if (!gl) return 'no';
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'renderer n/a';
    const result = `yes, max texture ${gl.getParameter(gl.MAX_TEXTURE_SIZE)}, ${renderer}`;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return result;
  } catch (e) {
    return `error ${e}`;
  }
}

/** Bucketised and refreshed only every 20 min in cast_shell: never a pass criterion. */
export function heapMB() {
  const m = /** @type {any} */ (performance).memory;
  return m ? `${Math.round(m.usedJSHeapSize / 1048576)} MB` : 'n/a';
}
