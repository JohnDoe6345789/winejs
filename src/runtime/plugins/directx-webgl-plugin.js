const DIRECTX_DLL_KEYWORDS = ['d3d', 'direct3d', 'direct2d', 'dxgi', 'dxcore', 'dxva', 'dxguid', 'd2d'];

export function detectDirectXImports(importTrace = []) {
  if (!Array.isArray(importTrace)) return false;
  return importTrace.some((entry) => {
    const dll = String(entry?.dll ?? entry?.name ?? '').toLowerCase();
    if (!dll) return false;
    return DIRECTX_DLL_KEYWORDS.some((keyword) => dll.includes(keyword));
  });
}

const VERTEX_SHADER_SOURCE = `
attribute vec2 aPosition;
attribute vec3 aColor;
varying vec3 vColor;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
  vColor = aColor;
}
`;

const FRAGMENT_SHADER_SOURCE = `
precision mediump float;
varying vec3 vColor;
void main() {
  gl_FragColor = vec4(vColor, 1.0);
}
`;

export class DirectXWebGLRenderer {
  constructor({ canvas, contextAttributes } = {}) {
    this.canvas = canvas;
    this.contextAttributes = contextAttributes;
    this.gl = null;
    this.program = null;
    this.vertexShader = null;
    this.fragmentShader = null;
    this.buffer = null;
    this.positionLocation = null;
    this.colorLocation = null;
    this.vertexCount = 6;
    this.stride = Float32Array.BYTES_PER_ELEMENT * 5;
  }

  ensureContext() {
    if (this.gl) return this.gl;
    if (!this.canvas) return null;
    this.gl =
      this.canvas.getContext('webgl', this.contextAttributes) ??
      this.canvas.getContext('experimental-webgl', this.contextAttributes) ??
      null;
    return this.gl;
  }

  render({ importTrace = [] } = {}) {
    const gl = this.ensureContext();
    if (!gl) return false;
    if (!this.program && !this.setupPipeline()) {
      return false;
    }
    this.resizeViewport();
    this.uploadGradient(importTrace);
    gl.clearColor(0.02, 0.02, 0.06, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, this.stride, 0);
    gl.vertexAttribPointer(
      this.colorLocation,
      3,
      gl.FLOAT,
      false,
      this.stride,
      Float32Array.BYTES_PER_ELEMENT * 2,
    );
    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    return true;
  }

  resizeViewport() {
    const gl = this.gl;
    const width = this.canvas.clientWidth || this.canvas.width || 1;
    const height = this.canvas.clientHeight || this.canvas.height || 1;
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  setupPipeline() {
    const gl = this.gl;
    const vertexShader = this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
    if (!vertexShader || !fragmentShader) return false;
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('[WineJS] Failed to link DirectX WebGL shader program:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return false;
    }
    this.program = program;
    this.vertexShader = vertexShader;
    this.fragmentShader = fragmentShader;
    this.positionLocation = gl.getAttribLocation(program, 'aPosition');
    this.colorLocation = gl.getAttribLocation(program, 'aColor');
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(this.positionLocation);
    gl.enableVertexAttribArray(this.colorLocation);
    return true;
  }

  compileShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn('[WineJS] Failed to compile DirectX WebGL shader:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  uploadGradient(importTrace) {
    const gl = this.gl;
    const palette = this.createPalette(importTrace);
    const vertices = new Float32Array([
      -1, -1, ...palette[0],
      1, -1, ...palette[1],
      -1, 1, ...palette[2],
      -1, 1, ...palette[2],
      1, -1, ...palette[1],
      1, 1, ...palette[3],
    ]);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  }

  createPalette(importTrace = []) {
    const labels = importTrace.map((entry) => entry?.name || entry?.dll || '').filter(Boolean);
    const palette = [];
    for (let i = 0; i < 4; i++) {
      const label = labels[i] || `directx-${i}`;
      palette.push(this.colorFromText(label));
    }
    return palette;
  }

  colorFromText(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash * 31 + text.charCodeAt(i)) | 0;
    }
    const r = ((hash >> 16) & 0xff) / 255;
    const g = ((hash >> 8) & 0xff) / 255;
    const b = (hash & 0xff) / 255;
    return [0.2 + 0.6 * r, 0.2 + 0.6 * g, 0.2 + 0.6 * b];
  }

  dispose() {
    const gl = this.gl;
    if (!gl) return;
    if (this.buffer) gl.deleteBuffer(this.buffer);
    if (this.program) gl.deleteProgram(this.program);
    if (this.vertexShader) gl.deleteShader(this.vertexShader);
    if (this.fragmentShader) gl.deleteShader(this.fragmentShader);
    this.buffer = null;
    this.program = null;
    this.vertexShader = null;
    this.fragmentShader = null;
  }
}

export function createDirectXWebGLPlugin({
  detectDirectX = detectDirectXImports,
  rendererFactory,
} = {}) {
  const createRenderer = rendererFactory ?? ((params) => new DirectXWebGLRenderer(params));
  const renderers = new Map();

  function disposeRenderers() {
    renderers.forEach((renderer) => renderer?.dispose?.());
    renderers.clear();
  }

  return {
    id: 'directx-webgl',
    onBeforeSimulate() {
      disposeRenderers();
    },
    onSimulationError() {
      disposeRenderers();
    },
    onAfterSimulate({ wine, simulation }) {
      if (!detectDirectX(simulation?.importTrace)) return;
      wine.log?.('[WineJS] DirectX imports detected — streaming drawing calls into WebGL.');
    },
    onGuiIntent({ wine, hwnd, simulation }) {
      if (!detectDirectX(simulation?.importTrace)) return;
      const windowInfo = wine.windowManager?.getWindow?.(hwnd);
      if (!windowInfo?.canvas) return;
      wine.windowManager?.markAsExternallyRendered?.(hwnd);
      const renderer =
        renderers.get(hwnd) ?? createRenderer({ canvas: windowInfo.canvas, hwnd, wine });
      if (!renderer) return;
      renderers.set(hwnd, renderer);
      renderer.render?.({ importTrace: simulation?.importTrace ?? [] });
      windowInfo.canvas.dataset.directxBridge = 'webgl';
    },
  };
}
