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
  const backendForm = document.getElementById('backendConfig');
  const backendUrlInput = document.getElementById('backendUrl');
  const backendStatusText = document.getElementById('backendStatusText');
  const blockSizeInput = document.getElementById('blockSizeInput');
  const blockCountInput = document.getElementById('blockCountInput');
  const filesystemLabelInput = document.getElementById('filesystemLabel');
  const backendLog = document.getElementById('backendLog');
  const formatBlockButton = document.getElementById('formatBlockDevice');
  const createFsButton = document.getElementById('createFilesystemButton');
  const disconnectBackendButton = document.getElementById('disconnectBackend');
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

  function appendBackendLog(message) {
    if (!backendLog) return;
    const entry = document.createElement('div');
    const timestamp = new Date().toLocaleTimeString();
    entry.textContent = `[${timestamp}] ${message}`;
    backendLog.append(entry);
    backendLog.scrollTop = backendLog.scrollHeight;
  }

  function updateBackendStatus(message) {
    if (backendStatusText) backendStatusText.textContent = message;
  }

  function parseNumberInput(inputEl, fallback) {
    const value = Number(inputEl?.value);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  backendForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const url = backendUrlInput?.value?.trim();
    if (!url) {
      updateBackendStatus('Backend URL cannot be empty.');
      return;
    }
    updateBackendStatus(`Connecting to ${url}…`);
    try {
      await wine.connectBackend(url);
      const blockSize = parseNumberInput(blockSizeInput, 4096);
      const blockCount = parseNumberInput(blockCountInput, 2048);
      const geometry = await wine.getBlockDeviceClient().configure({ blockSize, blockCount });
      updateBackendStatus(
        `Connected: ${geometry.blockSize.toLocaleString()} bytes × ${geometry.blockCount.toLocaleString()} blocks`,
      );
      appendBackendLog(`Backend connected at ${url}`);
    } catch (err) {
      updateBackendStatus(`Backend connection failed: ${err?.message ?? err}`);
      appendBackendLog(`Backend error: ${err?.message ?? err}`);
    }
  });

  disconnectBackendButton?.addEventListener('click', () => {
    wine.disconnectBackend();
    updateBackendStatus('Backend disconnected.');
    appendBackendLog('Backend disconnected by user.');
  });

  formatBlockButton?.addEventListener('click', async () => {
    try {
      await wine.getBlockDeviceClient().format();
      updateBackendStatus('Block device formatted.');
      appendBackendLog('Block device formatted to zeros.');
    } catch (err) {
      updateBackendStatus(`Format failed: ${err?.message ?? err}`);
      appendBackendLog(`Format error: ${err?.message ?? err}`);
    }
  });

  createFsButton?.addEventListener('click', async () => {
    const label = filesystemLabelInput?.value?.trim() || 'WineJS';
    try {
      const meta = await wine.getBlockDeviceClient().createFilesystem({ label });
      updateBackendStatus(`Filesystem ${meta.label} created.`);
      appendBackendLog(`Filesystem ${meta.label} created at ${meta.createdAt}.`);
    } catch (err) {
      updateBackendStatus(`Filesystem creation failed: ${err?.message ?? err}`);
      appendBackendLog(`Filesystem error: ${err?.message ?? err}`);
    }
  });

  const winsockBridge = wine.getWinsockBridge();
  winsockBridge?.subscribe('open', ({ connectionId }) => {
    appendBackendLog(`Winsock socket ${connectionId} opened.`);
  });
  winsockBridge?.subscribe('data', ({ connectionId }) => {
    appendBackendLog(`Winsock socket ${connectionId} received data.`);
  });
  winsockBridge?.subscribe('closed', ({ connectionId }) => {
    appendBackendLog(`Winsock socket ${connectionId} closed.`);
  });
  winsockBridge?.subscribe('error', ({ connectionId, message }) => {
    appendBackendLog(`Winsock socket ${connectionId} error: ${message}`);
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
