import { extractPrintableStrings } from './string-utils.js';
import { StringPanel } from './ui/string-panel.js';
import { WindowManager } from './ui/window-manager.js';
import { readAnsiString, readWideString } from './memory-readers.js';
import { createImportHandler } from './import-handler.js';
import { SimulatorBridge } from './simulator/simulator-bridge.js';
import { decodeBase64Executable } from './base64.js';
import { createConsoleOutputImportPlugin } from './import-plugins/console-output-plugin.js';
import { createWinsockWebSocketImportPlugin } from './import-plugins/winsock-websocket-plugin.js';
import { createX86SimulatorPlugin } from './simulator/plugins/x86-simulator-plugin.js';
import { BackendBridge } from './services/backend-bridge.js';
import { BlockDeviceClient } from './services/block-device-client.js';
import { WinsockBridge } from './services/winsock-bridge.js';

export class WineJS {
  constructor({ consoleEl, stringEl, canvasEl, statusEl, plugins = [], importPlugins, simulatorPlugins } = {}) {
    this.consoleEl = consoleEl;
    this.statusEl = statusEl;
    this.apiHooks = {};
    this.modules = new Map();
    this.stringPanel = new StringPanel(stringEl);
    this.windowManager = new WindowManager(canvasEl);
    this.utf8Decoder = new TextDecoder();
    this.utf16Decoder = new TextDecoder('utf-16le');
    this.plugins = [];
    this.importPlugins = [];
    this.backendBridge = null;
    this.blockDevice = new BlockDeviceClient({
      log: (message) => this.log(message),
    });
    this.winsockBridge = new WinsockBridge({
      log: (message) => this.log(message),
    });

    const importHandler = createImportHandler({
      readAnsiString: (cpu, address, maxLength) =>
        readAnsiString(cpu, address, this.utf8Decoder, maxLength),
      readWideString: (cpu, address, maxChars) =>
        readWideString(cpu, address, this.utf16Decoder, maxChars),
      log: (message) => this.log(message),
      plugins: this.importPlugins,
    });

    this.importHandler = importHandler;
    this.simulatorBridge = new SimulatorBridge({
      importHandler: (params) => this.importHandler(params),
    });

    const defaultImportPlugins =
      importPlugins ??
      [
        createConsoleOutputImportPlugin(),
        createWinsockWebSocketImportPlugin({
          getWinsockBridge: () => this.winsockBridge,
          log: (message) => this.log(message),
        }),
      ];
    defaultImportPlugins.forEach((plugin) => this.registerImportPlugin(plugin));

    const defaultSimulatorPlugins = simulatorPlugins ?? [createX86SimulatorPlugin()];
    defaultSimulatorPlugins.forEach((plugin) => this.registerSimulatorPlugin(plugin));

    plugins.forEach((plugin) => this.registerPlugin(plugin));
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

  registerPlugin(plugin) {
    if (!plugin) return;
    this.plugins.push(plugin);
    if (typeof plugin.onInit === 'function') {
      try {
        plugin.onInit({ wine: this });
      } catch (err) {
        this.log(`[WineJS] Plugin onInit failed: ${err?.message ?? err}`);
      }
    }
  }

  runHook(name, payload) {
    this.plugins.forEach((plugin) => {
      const hook = plugin?.[name];
      if (typeof hook !== 'function') return;
      try {
        hook({ wine: this, ...payload });
      } catch (err) {
        const pluginId = plugin?.id || plugin?.name || 'anonymous plugin';
        this.log(`[WineJS] Plugin ${pluginId} hook ${name} failed: ${err?.message ?? err}`);
      }
    });
  }

  registerImportPlugin(plugin) {
    if (!plugin) return;
    this.importPlugins.push(plugin);
  }

  registerSimulatorPlugin(plugin) {
    if (!plugin) return;
    this.simulatorBridge.registerPlugin(plugin);
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
        this.runHook('onFileLoaded', { file, buffer });
        resolve(buffer);
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  extractStrings(buffer) {
    const strings = extractPrintableStrings(buffer);
    this.runHook('onStringsExtracted', { buffer, strings });
    return strings;
  }

  displayStrings(strings) {
    this.stringPanel.render(strings);
    this.runHook('onStringsDisplayed', { strings });
  }

  handleImportCall(payload) {
    return this.importHandler(payload);
  }

  simulateBinary(buffer, options = {}) {
    return this.simulatorBridge.simulateBinary(buffer, options);
  }

  decodeBase64Executable(payload) {
    return decodeBase64Executable(payload);
  }

  simulateBase64Executable(payload, options = {}) {
    return this.simulatorBridge.simulateBase64Executable(payload, options);
  }

  readAnsiString(cpu, address, maxLength = 256) {
    return readAnsiString(cpu, address, this.utf8Decoder, maxLength);
  }

  readWideString(cpu, address, maxChars = 256) {
    return readWideString(cpu, address, this.utf16Decoder, maxChars);
  }

  async connectBackend(url) {
    const bridge = new BackendBridge({
      url,
      log: (message) => this.log(message),
    });
    await bridge.connect(url);
    this.backendBridge?.disconnect?.();
    this.backendBridge = bridge;
    this.blockDevice.setBridge(bridge);
    this.winsockBridge.setBridge(bridge);
    return bridge;
  }

  disconnectBackend() {
    this.backendBridge?.disconnect?.();
    this.backendBridge = null;
    this.blockDevice.setBridge(null);
    this.winsockBridge.setBridge(null);
  }

  getBackendStatus() {
    if (!this.backendBridge) {
      return { connected: false, url: null };
    }
    return {
      connected: this.backendBridge.isConnected?.() ?? false,
      url: this.backendBridge.url,
    };
  }

  getBlockDeviceClient() {
    return this.blockDevice;
  }

  getWinsockBridge() {
    return this.winsockBridge;
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

    this.runHook('onBeforeSimulate', { file, buffer });
    const simulation = this.simulateBinary(buffer, { file });
    this.runHook('onAfterSimulate', { file, buffer, simulation });
    const printableStrings = this.extractStrings(buffer).filter((s) => s.trim());
    const statusChunks = [`${file.name}`, `${(file.size / 1024).toFixed(1)} KB`];
    if (simulation.error) {
      statusChunks.push(`simulation failed: ${simulation.error}`);
      this.setStatus(statusChunks.join(' — '));
      this.displayStrings(printableStrings);
      this.log(`[WineJS] x86 simulation failed: ${simulation.error}`);
      this.runHook('onSimulationError', { file, buffer, error: simulation.error });
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
      this.runHook('onGuiIntent', { file, simulation, hwnd });
    }
    if (simulation.consoleLines.length) {
      simulation.consoleLines.forEach((line) => {
        if (!line.trim()) return;
        this.runHook('onConsoleLine', { file, line, simulation });
        this.callAPI('WriteConsole', line);
      });
    } else if (!simulation.guiIntent) {
      this.log('[WineJS] Simulation completed with no console output detected.');
      this.runHook('onSilentConsole', { file, simulation });
    }
  }
}
