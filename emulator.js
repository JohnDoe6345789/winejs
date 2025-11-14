import { PeFile } from './src/emulator/pe-file.js';
import { X86Simulator } from './src/emulator/x86/simulator.js';

const WineX86 = {
  PeFile,
  X86Simulator,
};

if (typeof window !== 'undefined') {
  window.WineX86 = WineX86;
}

export { PeFile, X86Simulator };
export default WineX86;
