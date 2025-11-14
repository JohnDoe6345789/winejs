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
  const driveCountInput = document.getElementById('driveCountInput');
  const driveLetterInput = document.getElementById('driveLetterInput');
  const driveSummary = document.getElementById('driveSummary');
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

  let availableDrives = ['C'];
  let activeDrive = 'C';

  function updateDriveState(geometry) {
    availableDrives = geometry?.drives?.map((drive) => drive?.letter).filter(Boolean) ?? ['C'];
    activeDrive = geometry?.primaryDrive ?? availableDrives[0] ?? activeDrive ?? 'C';
    if (driveCountInput) driveCountInput.value = geometry?.driveCount ?? availableDrives.length;
    if (driveLetterInput) driveLetterInput.value = activeDrive;
    if (driveSummary) driveSummary.textContent = availableDrives.join(', ');
  }

  function getTargetDrive() {
    const manual = driveLetterInput?.value?.trim()?.toUpperCase();
    if (manual && availableDrives.includes(manual)) {
      activeDrive = manual;
      return manual;
    }
    return activeDrive ?? 'C';
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
      const driveCount = parseNumberInput(driveCountInput, 1);
      const geometry = await wine.getBlockDeviceClient().configure({ blockSize, blockCount, driveCount });
      updateDriveState(geometry);
      updateBackendStatus(
        `Connected: ${geometry.blockSize.toLocaleString()} bytes × ${geometry.blockCount.toLocaleString()} blocks · ${
          geometry.driveCount ?? availableDrives.length
        } drive(s) (${availableDrives.join(', ')})`,
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
    availableDrives = ['C'];
    activeDrive = 'C';
    if (driveLetterInput) driveLetterInput.value = 'C';
    if (driveSummary) driveSummary.textContent = 'C';
    appendBackendLog('Backend disconnected by user.');
  });

  formatBlockButton?.addEventListener('click', async () => {
    const driveLetter = getTargetDrive();
    try {
      await wine.getBlockDeviceClient().format({ driveLetter });
      updateBackendStatus(`Drive ${driveLetter} formatted.`);
      appendBackendLog(`Drive ${driveLetter} formatted to zeros.`);
    } catch (err) {
      updateBackendStatus(`Format failed: ${err?.message ?? err}`);
      appendBackendLog(`Format error: ${err?.message ?? err}`);
    }
  });

  createFsButton?.addEventListener('click', async () => {
    const label = filesystemLabelInput?.value?.trim() || 'WineJS';
    const driveLetter = getTargetDrive();
    try {
      const meta = await wine.getBlockDeviceClient().createFilesystem({ label, driveLetter });
      updateBackendStatus(`Filesystem ${meta.label} created on ${meta.driveLetter ?? driveLetter}.`);
      appendBackendLog(`Filesystem ${meta.label} created on ${meta.driveLetter ?? driveLetter} at ${meta.createdAt}.`);
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
