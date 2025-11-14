class WineJS {
  constructor({ consoleEl, stringEl, canvasEl, statusEl }) {
    this.consoleEl = consoleEl;
    this.stringEl = stringEl;
    this.canvasEl = canvasEl;
    this.statusEl = statusEl;

    this.apiHooks = {};
    this.modules = new Map();
    this.windows = new Map();
    this.messageQueue = [];
    this.nextHwnd = 1;
  }

  // --- UI helpers ---------------------------------------------------------
  log(message) {
    this.consoleEl.textContent += message + '\n';
    this.consoleEl.scrollTop = this.consoleEl.scrollHeight;
  }

  clearConsole() {
    this.consoleEl.textContent = '';
  }

  clearStrings() {
    this.stringEl.innerHTML = '';
  }

  clearWindows() {
    this.canvasEl.innerHTML = '';
    this.windows.clear();
    this.nextHwnd = 1;
  }

  setStatus(text) {
    this.statusEl.textContent = text;
  }

  // --- API bridging -------------------------------------------------------
  registerAPI(name, fn) {
    this.apiHooks[name.toLowerCase()] = fn;
  }

  callAPI(name, ...args) {
    const fn = this.apiHooks[name.toLowerCase()];
    if (fn) return fn(...args);
    this.log(`[WineJS] API ${name} not implemented`);
  }

  // --- Binary handling ----------------------------------------------------
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
    const strings = [];
    let current = [];
    for (let i = 0; i < buffer.length; i++) {
      const byte = buffer[i];
      if ((byte >= 32 && byte <= 126) || byte === 10 || byte === 13) {
        current.push(String.fromCharCode(byte));
      } else if (current.length) {
        strings.push(current.join(''));
        current = [];
      }
    }
    if (current.length) strings.push(current.join(''));
    return strings;
  }

  displayStrings(strings) {
    this.clearStrings();
    if (!strings.length) {
      this.stringEl.textContent = 'No printable strings located in this executable.';
      return;
    }
    const frag = document.createDocumentFragment();
    const limit = 120;
    strings.slice(0, limit).forEach((value, index) => {
      if (!value.trim()) return;
      const div = document.createElement('div');
      div.className = 'stringList__item';
      const label = document.createElement('strong');
      label.textContent = `#${index + 1}`;
      const text = document.createElement('span');
      text.textContent = value.trim();
      div.append(label, text);
      frag.appendChild(div);
    });
    this.stringEl.appendChild(frag);
    if (strings.length > limit) {
      const note = document.createElement('div');
      note.className = 'stringList__item';
      note.textContent = `…and ${strings.length - limit} more strings. Refine the binary to narrow things down.`;
      this.stringEl.appendChild(note);
    }
  }

  detectGuiIntent(strings) {
    const guiHints = ['CreateWindow', 'DialogBox', 'WinMain', 'RegisterClass', 'WM_', 'MessageBox'];
    return strings.some((s) => guiHints.some((hint) => s.includes(hint)));
  }

  analyzeBinary({ file, buffer }) {
    const strings = this.extractStrings(buffer);
    const isLikelyGui = this.detectGuiIntent(strings);
    const printableLines = strings.filter((s) => s.trim());
    const status = `${file.name} — ${(file.size / 1024).toFixed(1)} KB — ${printableLines.length} printable chunks detected (${isLikelyGui ? 'GUI' : 'CLI'} heuristic).`;
    return { strings: printableLines, isLikelyGui, status };
  }

  // --- Fake windowing -----------------------------------------------------
  CreateWindowEx(x, y, width, height, title) {
    const hwnd = this.nextHwnd++;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.style.left = `${x}px`;
    canvas.style.top = `${y}px`;
    this.canvasEl.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    this.windows.set(hwnd, { canvas, ctx, width, height, title });
    return hwnd;
  }

  ShowWindow(hwnd) {
    this.PumpMessage(hwnd, 'WM_PAINT');
  }

  PumpMessage(hwnd, msg) {
    this.messageQueue.push({ hwnd, msg });
    this.ProcessMessages();
  }

  ProcessMessages() {
    while (this.messageQueue.length) {
      const { hwnd, msg } = this.messageQueue.shift();
      const win = this.windows.get(hwnd);
      if (!win) continue;
      if (msg === 'WM_PAINT') {
        const ctx = win.ctx;
        ctx.fillStyle = '#f5f5f5';
        ctx.fillRect(0, 0, win.width, win.height);
        ctx.fillStyle = '#0f62fe';
        ctx.fillRect(0, 0, win.width, 32);
        ctx.fillStyle = '#fff';
        ctx.font = '16px "Segoe UI", sans-serif';
        ctx.fillText(win.title, 12, 22);
        ctx.strokeStyle = '#0d1b2a';
        ctx.strokeRect(0, 0, win.width, win.height);
        ctx.fillStyle = '#222';
        ctx.fillText('WM_PAINT dispatched by WineJS shim', 12, 56);
      }
    }
  }

  // --- Runtime driver -----------------------------------------------------
  run(file) {
    const buffer = this.modules.get(file.name);
    if (!buffer) {
      this.log('[WineJS] No binary loaded.');
      return;
    }

    this.clearConsole();
    this.clearWindows();

    const { strings, isLikelyGui, status } = this.analyzeBinary({ file, buffer });
    this.setStatus(status);
    this.displayStrings(strings);

    if (isLikelyGui) {
      this.log('[WineJS] GUI intent detected; painting faux window.');
      const hwnd = this.CreateWindowEx(20, 20, 420, 300, file.name);
      this.ShowWindow(hwnd);
    } else {
      this.log('[WineJS] Treating binary as console-oriented.');
      strings.forEach((line) => this.callAPI('WriteConsole', line));
    }
  }
}

// --- Wiring ---------------------------------------------------------------
const consoleEl = document.getElementById('consoleOutput');
const stringEl = document.getElementById('stringList');
const canvasEl = document.getElementById('canvasContainer');
const statusEl = document.getElementById('statusBar');
const wine = new WineJS({ consoleEl, stringEl, canvasEl, statusEl });

wine.registerAPI('WriteConsole', (text) => {
  text.split(/\r?\n/).forEach((line) => {
    if (line.trim()) wine.log(`[WineJS] ${line.trim()}`);
  });
});

const input = document.getElementById('exeFile');
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
