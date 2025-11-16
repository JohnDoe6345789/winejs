import { describe, it, expect } from 'vitest';
import { X86Decoder } from '../src/emulator/x86/decoder.js';
import { X86CPU } from '../src/emulator/x86/cpu.js';

function decode(bytes) {
  const memory = {
    readByte(address) {
      const index = Number(address);
      return bytes[index] ?? 0;
    },
  };
  const decoder = new X86Decoder(memory);
  return decoder.decode(0n);
}

function createCpu() {
  const pe = {
    buffer: new Uint8Array(64),
    vaToOffset() {
      return 0;
    },
    imageBase: 0n,
    entryRva: 0,
    getImportDirectory() {
      return [];
    },
    imports: new Map(),
  };
  const cpu = new X86CPU(pe);
  cpu.reset();
  return cpu;
}

describe('x86 bitwise instruction coverage', () => {
  it('decodes stack alignment AND immediates', () => {
    const instr = decode(Uint8Array.from([0x48, 0x83, 0xe4, 0xf0]));
    expect(instr.mnemonic).toBe('and');
    expect(instr.operands[0]).toMatchObject({ kind: 'reg', name: 'rsp' });
    expect(instr.operands[1]).toMatchObject({ kind: 'imm', value: -16n });
  });

  it('decodes register OR operations', () => {
    const instr = decode(Uint8Array.from([0x48, 0x09, 0xd8]));
    expect(instr.mnemonic).toBe('or');
    expect(instr.operands[0]).toMatchObject({ kind: 'reg', name: 'rax' });
    expect(instr.operands[1]).toMatchObject({ kind: 'reg', name: 'rbx' });
  });

  it('executes AND to align the stack pointer', () => {
    const cpu = createCpu();
    cpu.writeRegister('rsp', 0x12345n);
    const instr = {
      mnemonic: 'and',
      operands: [
        { kind: 'reg', name: 'rsp', size: 64 },
        { kind: 'imm', value: -16n, size: 64 },
      ],
    };
    cpu.executeInstruction(instr, { nextRip: cpu.readRegister('rip'), hooks: {}, output: [], visitedImports: [] });
    expect(cpu.readRegister('rsp')).toBe(0x12340n);
    expect(cpu.flags.zf).toBe(false);
  });

  it('executes OR immediates and updates flags', () => {
    const cpu = createCpu();
    cpu.writeRegister('rax', 0x10n);
    const instr = {
      mnemonic: 'or',
      operands: [
        { kind: 'reg', name: 'rax', size: 64 },
        { kind: 'imm', value: 0x3n, size: 64 },
      ],
    };
    cpu.executeInstruction(instr, { nextRip: cpu.readRegister('rip'), hooks: {}, output: [], visitedImports: [] });
    expect(cpu.readRegister('rax')).toBe(0x13n);
    expect(cpu.flags.zf).toBe(false);
    expect(cpu.flags.sf).toBe(false);
  });

  it('sets the zero flag when AND results in zero', () => {
    const cpu = createCpu();
    cpu.writeRegister('rax', 0x10n);
    const instr = {
      mnemonic: 'and',
      operands: [
        { kind: 'reg', name: 'rax', size: 64 },
        { kind: 'imm', value: 0n, size: 64 },
      ],
    };
    cpu.executeInstruction(instr, { nextRip: cpu.readRegister('rip'), hooks: {}, output: [], visitedImports: [] });
    expect(cpu.readRegister('rax')).toBe(0n);
    expect(cpu.flags.zf).toBe(true);
  });
});
