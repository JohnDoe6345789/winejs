import { WineJS } from './wine-js.js';
import { createConsoleAPIPlugin } from './plugins/console-api-plugin.js';
import { createDirectXWebGLPlugin } from './plugins/directx-webgl-plugin.js';

export function setupWineRuntime() {
  if (typeof document === 'undefined') return null;
  const consoleEl = document.getElementById('consoleOutput');
  const stringEl = document.getElementById('stringList');
  const canvasEl = document.getElementById('canvasContainer');
  const statusEl = document.getElementById('statusBar');
  const input = document.getElementById('exeFile');
  if (!consoleEl || !stringEl || !canvasEl || !statusEl || !input) return null;

  const wine = new WineJS({
    consoleEl,
    stringEl,
    canvasEl,
    statusEl,
    plugins: [createConsoleAPIPlugin(), createDirectXWebGLPlugin()],
  });

  input.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    wine.setStatus(`Loading ${file.name} (${(file.size / 1024).toFixed(1)} KB)…`);
    try {
      await wine.loadBinary(file);
      wine.run(file);
    } catch (err) {
      wine.setStatus(`Failed to load ${file.name}. ${err?.message ?? err}`);
    }
  });

  return wine;
}

export function bootWineRuntime() {
  if (typeof document === 'undefined') return;
  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        setupWineRuntime();
      },
      { once: true },
    );
  } else {
    setupWineRuntime();
  }
}
