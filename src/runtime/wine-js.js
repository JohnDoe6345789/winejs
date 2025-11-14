import { extractPrintableStrings } from './string-utils.js';
import { StringPanel } from './ui/string-panel.js';
import { WindowManager } from './ui/window-manager.js';
import { readAnsiString, readWideString } from './memory-readers.js';
import { createImportHandler } from './import-handler.js';
import { SimulatorBridge } from './simulator/simulator-bridge.js';
import { decodeBase64Executable } from './base64.js';

function getSimulatorClass() {
  if (typeof window === 'undefined') return undefined;
  return window.WineX86?.X86Simulator;
}

export class WineJS {
  constructor({ consoleEl, stringEl, canvasEl, statusEl }) {
    this.consoleEl = consoleEl;
    this.statusEl = statusEl;
    this.apiHooks = {};
    this.modules = new Map();
    this.stringPanel = new StringPanel(stringEl);
    this.windowManager = new WindowManager(canvasEl);
    this.utf8Decoder = new TextDecoder();
    this.utf16Decoder = new TextDecoder('utf-16le');

    const importHandler = createImportHandler({
      readAnsiString: (cpu, address, maxLength) =>
        readAnsiString(cpu, address, this.utf8Decoder, maxLength),
      readWideString: (cpu, address, maxChars) =>
        readWideString(cpu, address, this.utf16Decoder, maxChars),
      log: (message) => this.log(message),
    });

    this.importHandler = importHandler;
    this.simulatorBridge = new SimulatorBridge({
      importHandler: (params) => this.importHandler(params),
      getSimulatorClass,
    });
  }

  log(message) {
    if (!this.consoleEl) return;
    this.consoleEl.textContent += `${message}\n`;
    this.consoleEl.scrollTop = this.consoleEl.scrollHeight;
  }

  clearConsole() {
    if (this.consoleEl) {
      this.consoleEl.textContent = '';
    }
  }

  clearStrings() {
    this.stringPanel.clear();
  }

  clearWindows() {
    this.windowManager.clear();
  }

  setStatus(text) {
    if (this.statusEl) {
      this.statusEl.textContent = text;
    }
  }

  registerAPI(name, fn) {
    this.apiHooks[name.toLowerCase()] = fn;
  }

  callAPI(name, ...args) {
    const fn = this.apiHooks[name.toLowerCase()];
    if (fn) return fn(...args);
    this.log(`[WineJS] API ${name} not implemented`);
    return undefined;
  }

  async loadBinary(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const buffer = new Uint8Array(reader.result);
        this.modules.set(file.name, buffer);
        resolve(buffer);
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  extractStrings(buffer) {
    return extractPrintableStrings(buffer);
  }

  displayStrings(strings) {
    this.stringPanel.render(strings);
  }

  handleImportCall(payload) {
    return this.importHandler(payload);
  }

  simulateBinary(buffer) {
    return this.simulatorBridge.simulateBinary(buffer);
  }

  decodeBase64Executable(payload) {
    return decodeBase64Executable(payload);
  }

  simulateBase64Executable(payload) {
    return this.simulatorBridge.simulateBase64Executable(payload);
  }

  readAnsiString(cpu, address, maxLength = 256) {
    return readAnsiString(cpu, address, this.utf8Decoder, maxLength);
  }

  readWideString(cpu, address, maxChars = 256) {
    return readWideString(cpu, address, this.utf16Decoder, maxChars);
  }

  CreateWindowEx(x, y, width, height, title) {
    return this.windowManager.createWindow(x, y, width, height, title);
  }

  ShowWindow(hwnd) {
    this.windowManager.showWindow(hwnd);
  }

  PumpMessage(hwnd, msg) {
    this.windowManager.pumpMessage(hwnd, msg);
  }

  ProcessMessages() {
    this.windowManager.processMessages();
  }

  run(file) {
    const buffer = this.modules.get(file.name);
    if (!buffer) {
      this.log('[WineJS] No binary loaded.');
      return;
    }

    this.clearConsole();
    this.clearWindows();

    const simulation = this.simulateBinary(buffer);
    const printableStrings = this.extractStrings(buffer).filter((s) => s.trim());
    const statusChunks = [`${file.name}`, `${(file.size / 1024).toFixed(1)} KB`];
    if (simulation.error) {
      statusChunks.push(`simulation failed: ${simulation.error}`);
      this.setStatus(statusChunks.join(' — '));
      this.displayStrings(printableStrings);
      this.log(`[WineJS] x86 simulation failed: ${simulation.error}`);
      return;
    }
    statusChunks.push(`imports walked: ${simulation.importTrace.length}`);
    statusChunks.push(simulation.guiIntent ? 'GUI intent via API usage' : 'Console intent via API usage');
    this.setStatus(statusChunks.join(' — '));
    this.displayStrings(printableStrings);

    if (simulation.guiIntent) {
      this.log('[WineJS] GUI intent detected from simulated API calls.');
      const hwnd = this.CreateWindowEx(20, 20, 420, 300, file.name);
      this.ShowWindow(hwnd);
    }
    if (simulation.consoleLines.length) {
      simulation.consoleLines.forEach((line) => {
        if (line.trim()) this.callAPI('WriteConsole', line);
      });
    } else if (!simulation.guiIntent) {
      this.log('[WineJS] Simulation completed with no console output detected.');
    }
  }
}
