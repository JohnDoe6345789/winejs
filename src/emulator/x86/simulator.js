import { PeFile } from '../pe-file.js';
import { X86CPU } from './cpu.js';

export class X86Simulator {
  constructor(buffer) {
    this.pe = new PeFile(buffer);
  }

  run(options = {}) {
    const cpu = new X86CPU(this.pe);
    return cpu.run(options);
  }
}
