function defaultGetSimulatorClass(globalKey = 'WineX86') {
  if (typeof window === 'undefined') return undefined;
  const target = window[globalKey];
  if (!target) return undefined;
  return target.X86Simulator ?? target;
}

export function createX86SimulatorPlugin({ getSimulatorClass, globalKey = 'WineX86' } = {}) {
  const resolver =
    typeof getSimulatorClass === 'function' ? getSimulatorClass : () => defaultGetSimulatorClass(globalKey);
  return {
    id: 'x86-simulator',
    match: () => true,
    createSimulator({ buffer }) {
      const Simulator = resolver();
      if (!Simulator) return null;
      return new Simulator(buffer);
    },
  };
}
