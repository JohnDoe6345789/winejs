import { decodeBase64Executable } from '../base64.js';

export class SimulatorBridge {
  constructor({ importHandler }) {
    this.importHandler = importHandler;
    this.plugins = [];
  }

  registerPlugin(plugin) {
    if (!plugin) return;
    this.plugins.push(plugin);
  }

  createSimulator(buffer, options = {}) {
    for (const plugin of this.plugins) {
      if (!plugin) continue;
      const shouldUse = plugin.match ? plugin.match({ buffer, options }) : true;
      if (!shouldUse) continue;
      const simulator = plugin.createSimulator?.({ buffer, options });
      if (simulator) {
        return { simulator, plugin };
      }
    }
    return null;
  }

  simulateBinary(buffer, options = {}) {
    const created = this.createSimulator(buffer, options);
    if (!created) {
      return { error: this.describeMissingSimulator() };
    }
    const { simulator } = created;
    try {
      const consoleLines = [];
      let guiIntent = false;
      const hooks = {
        handleImport: (name, cpu, context) =>
          this.importHandler({
            name,
            cpu,
            consoleLines,
            flagGui: () => {
              guiIntent = true;
            },
          }),
      };
      const result = simulator.run({ hooks });
      if (!guiIntent) {
        guiIntent = result.imports?.some((imp) => imp.dll?.includes('user32')) ?? false;
      }
      return {
        consoleLines,
        guiIntent,
        importTrace: result.imports ?? [],
      };
    } catch (err) {
      return { error: err?.message ?? String(err) };
    }
  }

  simulateBase64Executable(payload, options = {}) {
    try {
      const buffer = decodeBase64Executable(payload);
      return this.simulateBinary(buffer, options);
    } catch (err) {
      return { error: err?.message ?? 'Invalid base64 executable payload.' };
    }
  }

  describeMissingSimulator() {
    const hasX86Plugin = this.plugins.some((plugin) => plugin?.id === 'x86-simulator');
    if (hasX86Plugin) {
      return 'x86-64 simulator not wired into page.';
    }
    if (this.plugins.length) {
      return 'No simulator plugin available for this binary.';
    }
    return 'No simulator plugins registered.';
  }
}
