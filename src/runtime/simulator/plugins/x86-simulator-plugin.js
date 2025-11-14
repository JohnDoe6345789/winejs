function defaultGetSimulatorClass() {
  if (typeof window === 'undefined') return undefined;
  return window.WineX86?.X86Simulator;
}

export function createX86SimulatorPlugin({ getSimulatorClass = defaultGetSimulatorClass } = {}) {
  return {
    id: 'x86-simulator',
    match: () => true,
    createSimulator({ buffer }) {
      const Simulator = getSimulatorClass();
      if (!Simulator) return null;
      return new Simulator(buffer);
    },
  };
}
