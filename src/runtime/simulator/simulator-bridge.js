import { decodeBase64Executable } from '../base64.js';

export class SimulatorBridge {
  constructor({ importHandler, getSimulatorClass }) {
    this.importHandler = importHandler;
    this.getSimulatorClass = getSimulatorClass;
  }

  createSimulator(buffer) {
    const Simulator = this.getSimulatorClass?.();
    if (!Simulator) {
      return null;
    }
    return new Simulator(buffer);
  }

  simulateBinary(buffer) {
    const simulator = this.createSimulator(buffer);
    if (!simulator) {
      return { error: 'x86-64 simulator not wired into page.' };
    }
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

  simulateBase64Executable(payload) {
    try {
      const buffer = decodeBase64Executable(payload);
      return this.simulateBinary(buffer);
    } catch (err) {
      return { error: err?.message ?? 'Invalid base64 executable payload.' };
    }
  }
}
