import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import runtime from '../index.js';
import {
  createDirectXWebGLPlugin,
  detectDirectXImports,
} from '../src/runtime/plugins/directx-webgl-plugin.js';

const { WineJS } = runtime;

const HELLO_WORLD_FIXTURE = JSON.parse(
  readFileSync(path.join(process.cwd(), 'tests/fixtures/helloWorld.json'), 'utf8'),
);
const HELLO_WORLD_BASE64 = HELLO_WORLD_FIXTURE.helloWorldExe;
const HELLO_WORLD_BYTES = new Uint8Array(Buffer.from(HELLO_WORLD_BASE64, 'base64'));

function encodeUtf16le(value) {
  const buffer = new Uint8Array((value.length + 1) * 2);
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    buffer[i * 2] = code & 0xff;
    buffer[i * 2 + 1] = code >> 8;
  }
  return buffer;
}

function createHarness() {
  const consoleEl = document.createElement('pre');
  const stringEl = document.createElement('div');
  const canvasEl = document.createElement('div');
  const statusEl = document.createElement('div');
  return { consoleEl, stringEl, canvasEl, statusEl };
}

function createWine(overrides = {}) {
  const harness = { ...createHarness(), ...overrides };
  const wine = new WineJS(harness);
  return { wine, ...harness };
}

describe('WineJS', () => {
  let originalWineX86;

  beforeEach(() => {
    originalWineX86 = window.WineX86;
  });

  afterEach(() => {
    window.WineX86 = originalWineX86;
    vi.restoreAllMocks();
  });

  it('registers APIs case-insensitively', () => {
    const { wine } = createWine();
    const spy = vi.fn();
    wine.registerAPI('WriteConsole', spy);
    wine.callAPI('writeconsole', 'payload');
    expect(spy).toHaveBeenCalledWith('payload');
  });

  it('extracts printable strings from buffers', () => {
    const { wine } = createWine();
    const buffer = new Uint8Array([0, 65, 66, 67, 0, 10, 49, 50, 51, 0, 255]);
    const strings = wine.extractStrings(buffer);
    expect(strings).toEqual(['ABC', '\n123']);
  });

  it('shows fallback message when no strings found', () => {
    const { wine, stringEl } = createWine();
    wine.displayStrings([]);
    expect(stringEl.textContent).toContain('No printable strings');
  });

  it('renders top strings list with numbering', () => {
    const { wine, stringEl } = createWine();
    wine.displayStrings([' first ', 'second']);
    const items = stringEl.querySelectorAll('.stringList__item');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('#1');
    expect(items[0].textContent).toContain('first');
  });

  it('handles WriteConsoleW import by decoding UTF-16 payload', () => {
    const { wine } = createWine();
    const text = 'Hello!';
    const bytes = encodeUtf16le(`${text}\u0000`);
    const base = 0x2000n;
    const cpu = {
      readRegister: vi.fn((reg) => {
        if (reg === 'rdx') return base;
        if (reg === 'r8') return BigInt(text.length);
        return 0n;
      }),
      memory: {
        readByte: vi.fn((address) => {
          const offset = Number(address - base);
          return bytes[offset] ?? 0;
        }),
      },
    };
    const consoleLines = [];
    const result = wine.handleImportCall({
      name: 'KERNEL32.dll!WriteConsoleW',
      cpu,
      consoleLines,
      flagGui: vi.fn(),
    });
    expect(result).toEqual({ rax: 1 });
    expect(consoleLines).toEqual([text]);
  });

  it('flags GUI intent for MessageBox imports', () => {
    const { wine } = createWine();
    const text = 'Important';
    const bytes = encodeUtf16le(`${text}\u0000`);
    const base = 0x3000n;
    const cpu = {
      readRegister: vi.fn((reg) => {
        if (reg === 'rdx') return base;
        return 0n;
      }),
      memory: {
        readByte: vi.fn((address) => {
          const offset = Number(address - base);
          return bytes[offset] ?? 0;
        }),
      },
    };
    const flagGui = vi.fn();
    wine.log = vi.fn();
    wine.handleImportCall({
      name: 'user32!MessageBoxW',
      cpu,
      consoleLines: [],
      flagGui,
    });
    expect(flagGui).toHaveBeenCalled();
    expect(wine.log).toHaveBeenCalledWith(expect.stringContaining(text));
  });

  it('returns an error when the simulator is not wired', () => {
    const { wine } = createWine();
    delete window.WineX86;
    const result = wine.simulateBinary(new Uint8Array([0]));
    expect(result.error).toMatch(/simulator not wired/);
  });

  it('runs the simulator with hooks to capture console lines', () => {
    const { wine } = createWine();
    const payload = 'Sim console';
    const bytes = new TextEncoder().encode(`${payload}\u0000`);
    const base = 0x4000n;
    const fakeCpu = {
      readRegister: vi.fn((reg) => {
        if (reg === 'rdx') return base;
        if (reg === 'r8') return BigInt(payload.length);
        return 0n;
      }),
      memory: {
        readByte: vi.fn((address) => {
          const offset = Number(address - base);
          return bytes[offset] ?? 0;
        }),
      },
    };
    window.WineX86 = {
      X86Simulator: class {
        run({ hooks }) {
          hooks.handleImport('kernel32.dll!WriteConsoleA', fakeCpu, {});
          return { imports: [{ dll: 'kernel32.dll', name: 'WriteConsoleA' }] };
        }
      },
    };
    const result = wine.simulateBinary(new Uint8Array([0]));
    expect(result.consoleLines).toEqual([payload]);
    expect(result.guiIntent).toBe(false);
  });

  it('simulates the base64 encoded HelloWorld.exe payload and surfaces stdout', () => {
    const { wine } = createWine();
    let capturedBuffer;
    const stdout = 'Hello World!';
    const payloadBytes = new TextEncoder().encode(`${stdout}\u0000`);
    const base = 0x5000n;
    const fakeCpu = {
      readRegister: vi.fn((reg) => {
        if (reg === 'rdx') return base;
        if (reg === 'r8') return BigInt(stdout.length);
        return 0n;
      }),
      memory: {
        readByte: vi.fn((address) => {
          const offset = Number(address - base);
          return payloadBytes[offset] ?? 0;
        }),
      },
    };
    window.WineX86 = {
      X86Simulator: class {
        constructor(buffer) {
          capturedBuffer = buffer;
        }
        run({ hooks }) {
          hooks.handleImport('kernel32.dll!WriteConsoleA', fakeCpu, {});
          return { imports: [{ dll: 'kernel32.dll', name: 'WriteConsoleA' }] };
        }
      },
    };
    const result = wine.simulateBase64Executable(HELLO_WORLD_BASE64);
    expect(Array.from(capturedBuffer)).toEqual(Array.from(HELLO_WORLD_BYTES));
    expect(result.consoleLines).toEqual([stdout]);
    expect(result.guiIntent).toBe(false);
    expect(result.importTrace).toEqual([{ dll: 'kernel32.dll', name: 'WriteConsoleA' }]);
  });

  it('returns an error for invalid base64 payloads', () => {
    const { wine } = createWine();
    const result = wine.simulateBase64Executable('@@@not base64!!!');
    expect(result.error).toMatch(/base64/i);
  });

  describe('DirectX WebGL plugin', () => {
    it('detects DirectX imports from traces', () => {
      expect(detectDirectXImports([{ dll: 'd3d11.dll' }])).toBe(true);
      expect(
        detectDirectXImports([
          { dll: 'kernel32.dll', name: 'WriteConsoleA' },
          { name: 'RandomFunction' },
        ]),
      ).toBe(false);
    });

    it('pipes DirectX GUI intent into the WebGL renderer', () => {
      const renderSpy = vi.fn();
      const factorySpy = vi.fn(() => ({ render: renderSpy }));
      const plugin = createDirectXWebGLPlugin({
        detectDirectX: () => true,
        rendererFactory: factorySpy,
      });
      const { wine } = createWine({ plugins: [plugin] });
      const hwnd = wine.CreateWindowEx(12, 8, 160, 140, 'DX Window');
      const simulation = {
        importTrace: [{ dll: 'd3d11.dll', name: 'D3D11CreateDevice' }],
      };
      wine.runHook('onGuiIntent', { hwnd, simulation });
      expect(factorySpy).toHaveBeenCalledWith({
        canvas: expect.any(HTMLCanvasElement),
        hwnd,
        wine,
      });
      expect(renderSpy).toHaveBeenCalledWith({ importTrace: simulation.importTrace });
      const win = wine.windowManager.getWindow(hwnd);
      expect(win.skipDefaultPaint).toBe(true);
      expect(win.canvas.dataset.directxBridge).toBe('webgl');
    });

    it('logs when DirectX imports are detected post-sim', () => {
      const plugin = createDirectXWebGLPlugin({
        detectDirectX: () => true,
        rendererFactory: () => null,
      });
      const { wine } = createWine({ plugins: [plugin] });
      wine.log = vi.fn();
      wine.runHook('onAfterSimulate', {
        simulation: { importTrace: [{ dll: 'd3dcompiler_47.dll' }] },
      });
      expect(wine.log).toHaveBeenCalledWith(
        expect.stringContaining('DirectX imports detected'),
      );
    });
  });
});
