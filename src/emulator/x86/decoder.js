import { Operand, X86Instruction, REG64, REG32, REG16, REG8 } from './instruction.js';

export class X86Decoder {
  constructor(memory) {
    this.memory = memory;
  }

  readByte(addr) {
    return this.memory.readByte(addr);
  }

  decode(rip) {
    const start = rip;
    let cursor = rip;
    const prefixes = [];
    let rex = { w: 0, r: 0, x: 0, b: 0 };
    let done = false;
    while (!done) {
      const byte = this.readByte(cursor);
      if (byte >= 0x40 && byte <= 0x4f) {
        rex = {
          w: (byte >> 3) & 1,
          r: (byte >> 2) & 1,
          x: (byte >> 1) & 1,
          b: byte & 1,
        };
        cursor += 1n;
      } else if (byte === 0x66 || byte === 0x67 || byte === 0xf0 || byte === 0xf2 || byte === 0xf3) {
        prefixes.push(byte);
        cursor += 1n;
      } else {
        done = true;
      }
    }
    let opcode = this.readByte(cursor);
    cursor += 1n;
    let opcodeExt = null;
    if (opcode === 0x0f) {
      opcodeExt = this.readByte(cursor);
      cursor += 1n;
      opcode = (opcode << 8) | opcodeExt;
    }
    const state = { start, cursor, rex, prefixes };
    const instr = this.decodeOpcode(state, opcode);
    if (!instr) throw new Error(`Unsupported opcode 0x${opcode.toString(16)}`);
    const length = Number(state.cursor - start);
    instr.length = length;
    return instr;
  }

  decodeOpcode(state, opcode) {
    if (opcode >= 0x50 && opcode <= 0x57) {
      const regIndex = (opcode - 0x50) + (state.rex.b ? 8 : 0);
      const regName = this.registerNameForSize(regIndex, 64);
      return new X86Instruction({
        mnemonic: 'push',
        operands: [new Operand('reg', { name: regName, size: 64 })],
      });
    }
    if (opcode >= 0x58 && opcode <= 0x5f) {
      const regIndex = (opcode - 0x58) + (state.rex.b ? 8 : 0);
      const regName = this.registerNameForSize(regIndex, 64);
      return new X86Instruction({
        mnemonic: 'pop',
        operands: [new Operand('reg', { name: regName, size: 64 })],
      });
    }
    if (opcode >= 0xb8 && opcode <= 0xbf) {
      const regIndex = (opcode - 0xb8) + (state.rex.b ? 8 : 0);
      const size = state.rex.w ? 64 : 32;
      const imm = this.readImm(state, size === 64 ? 8 : 4, false);
      const regName = this.registerNameForSize(regIndex, size);
      return new X86Instruction({
        mnemonic: 'mov',
        operands: [new Operand('reg', { name: regName, size }), new Operand('imm', { value: imm, size })],
      });
    }
    switch (opcode) {
      case 0x90:
        return new X86Instruction({ mnemonic: 'nop' });
      case 0xf4:
        return new X86Instruction({ mnemonic: 'hlt' });
      case 0xc3:
        return new X86Instruction({ mnemonic: 'ret' });
      case 0xe8: {
        const imm = Number(this.readImm(state, 4, true));
        return new X86Instruction({ mnemonic: 'call', rel: imm });
      }
      case 0xe9: {
        const imm = Number(this.readImm(state, 4, true));
        return new X86Instruction({ mnemonic: 'jmp', rel: imm });
      }
      case 0xeb: {
        const imm = Number(this.readImm(state, 1, true));
        return new X86Instruction({ mnemonic: 'jmp', rel: imm });
      }
      case 0x74:
      case 0x75: {
        const imm = Number(this.readImm(state, 1, true));
        const mnemonic = opcode === 0x74 ? 'je' : 'jne';
        return new X86Instruction({ mnemonic, rel: imm });
      }
      case 0x0f84:
      case 0x0f85: {
        const imm = Number(this.readImm(state, 4, true));
        const mnemonic = opcode === 0x0f84 ? 'je' : 'jne';
        return new X86Instruction({ mnemonic, rel: imm });
      }
      default:
        return this.decodeWithModRm(state, opcode);
    }
  }

  readImm(state, size, signed = false) {
    const bytes = [];
    for (let i = 0; i < size; i++) {
      bytes.push(this.readByte(state.cursor));
      state.cursor += 1n;
    }
    let value = 0n;
    for (let i = 0; i < size; i++) {
      value |= BigInt(bytes[i]) << BigInt(8 * i);
    }
    if (signed) {
      const bits = size * 8;
      const mask = 1n << BigInt(bits - 1);
      if (value & mask) {
        const full = (1n << BigInt(bits)) - 1n;
        value = -((~value + 1n) & full);
      }
    }
    return value;
  }

  decodeWithModRm(state, opcode) {
    const { rex } = state;
    const modrmByte = this.readByte(state.cursor);
    state.cursor += 1n;
    const mod = (modrmByte >> 6) & 0x3;
    const rawReg = (modrmByte >> 3) & 0x7;
    const rawRm = modrmByte & 0x7;
    const reg = rawReg;
    const rm = rawRm;
    let sib = null;
    if (rawRm === 4 && mod !== 3) {
      const sibByte = this.readByte(state.cursor);
      state.cursor += 1n;
      sib = {
        scale: 1 << ((sibByte >> 6) & 0x3),
        rawIndex: (sibByte >> 3) & 0x7,
        rawBase: sibByte & 0x7,
      };
    }
    let displacement = 0;
    let dispSize = 0;
    if (mod === 0 && rawRm === 5) {
      displacement = this.readImm(state, 4, true);
      dispSize = 4;
    } else if (mod === 1) {
      displacement = this.readImm(state, 1, true);
      dispSize = 1;
    } else if (mod === 2) {
      displacement = this.readImm(state, 4, true);
      dispSize = 4;
    }
    const operandInfo = {
      mod,
      reg: rawReg + (rex.r ? 8 : 0),
      rm: rawRm + (rex.b ? 8 : 0),
      rawReg,
      rawRm,
      displacement,
      dispSize,
      sib: sib
        ? {
            scale: sib.scale,
            index: sib.rawIndex + (rex.x ? 8 : 0),
            base: sib.rawBase + (rex.b ? 8 : 0),
            rawIndex: sib.rawIndex,
            rawBase: sib.rawBase,
          }
        : null,
    };
    return this.mapOpcodeWithOperands(state, opcode, operandInfo);
  }

  resolveOperand(opInfo, isReg, size) {
    if (isReg) {
      const regIndex = opInfo.reg;
      const regName = this.registerNameForSize(regIndex, size);
      return new Operand('reg', { name: regName, size });
    }
    if (opInfo.mod === 3) {
      const regName = this.registerNameForSize(opInfo.rm, size);
      return new Operand('reg', { name: regName, size });
    }
    let baseName = null;
    let ripRelative = false;
    if (opInfo.sib) {
      const hasBase = !(opInfo.mod === 0 && opInfo.sib.rawBase === 5);
      baseName = hasBase ? this.registerNameForSize(opInfo.sib.base, 64) : null;
    } else if (opInfo.mod === 0 && opInfo.rawRm === 5) {
      ripRelative = true;
    } else {
      baseName = this.registerNameForSize(opInfo.rm, 64);
    }
    if (opInfo.mod === 0 && opInfo.rawRm === 5 && !opInfo.sib) {
      ripRelative = true;
    }
    let indexName = null;
    if (opInfo.sib && opInfo.sib.rawIndex !== 4) {
      indexName = this.registerNameForSize(opInfo.sib.index, 64);
    }
    const address = {
      base: baseName,
      index: indexName,
      scale: opInfo.sib ? opInfo.sib.scale : 1,
      displacement: opInfo.displacement,
      ripRelative,
    };
    return new Operand('mem', { size, address });
  }

  registerNameForSize(index, size) {
    switch (size) {
      case 8:
        return REG8[index];
      case 16:
        return REG16[index];
      case 32:
        return REG32[index];
      default:
        return REG64[index];
    }
  }

  mapOpcodeWithOperands(state, opcode, opInfo) {
    switch (opcode) {
      case 0x89:
        return new X86Instruction({
          mnemonic: 'mov',
          operands: [
            this.resolveOperand(opInfo, false, state.rex.w ? 64 : 32),
            this.resolveOperand(opInfo, true, state.rex.w ? 64 : 32),
          ],
        });
      case 0x8b:
        return new X86Instruction({
          mnemonic: 'mov',
          operands: [
            this.resolveOperand(opInfo, true, state.rex.w ? 64 : 32),
            this.resolveOperand(opInfo, false, state.rex.w ? 64 : 32),
          ],
        });
      case 0x8d:
        return new X86Instruction({
          mnemonic: 'lea',
          operands: [
            this.resolveOperand(opInfo, true, 64),
            this.resolveOperand(opInfo, false, 64),
          ],
        });
      case 0x21:
        return new X86Instruction({
          mnemonic: 'and',
          operands: [
            this.resolveOperand(opInfo, false, state.rex.w ? 64 : 32),
            this.resolveOperand(opInfo, true, state.rex.w ? 64 : 32),
          ],
        });
      case 0x23:
        return new X86Instruction({
          mnemonic: 'and',
          operands: [
            this.resolveOperand(opInfo, true, state.rex.w ? 64 : 32),
            this.resolveOperand(opInfo, false, state.rex.w ? 64 : 32),
          ],
        });
      case 0x09:
        return new X86Instruction({
          mnemonic: 'or',
          operands: [
            this.resolveOperand(opInfo, false, state.rex.w ? 64 : 32),
            this.resolveOperand(opInfo, true, state.rex.w ? 64 : 32),
          ],
        });
      case 0x0b:
        return new X86Instruction({
          mnemonic: 'or',
          operands: [
            this.resolveOperand(opInfo, true, state.rex.w ? 64 : 32),
            this.resolveOperand(opInfo, false, state.rex.w ? 64 : 32),
          ],
        });
      case 0x31:
        return new X86Instruction({
          mnemonic: 'xor',
          operands: [
            this.resolveOperand(opInfo, false, 32),
            this.resolveOperand(opInfo, true, 32),
          ],
        });
      case 0x33:
        return new X86Instruction({
          mnemonic: 'xor',
          operands: [
            this.resolveOperand(opInfo, true, 32),
            this.resolveOperand(opInfo, false, 32),
          ],
        });
      case 0x85:
        return new X86Instruction({
          mnemonic: 'test',
          operands: [
            this.resolveOperand(opInfo, false, state.rex.w ? 64 : 32),
            this.resolveOperand(opInfo, true, state.rex.w ? 64 : 32),
          ],
        });
      case 0x39:
        return new X86Instruction({
          mnemonic: 'cmp',
          operands: [
            this.resolveOperand(opInfo, false, state.rex.w ? 64 : 32),
            this.resolveOperand(opInfo, true, state.rex.w ? 64 : 32),
          ],
        });
      case 0x3b:
        return new X86Instruction({
          mnemonic: 'cmp',
          operands: [
            this.resolveOperand(opInfo, true, state.rex.w ? 64 : 32),
            this.resolveOperand(opInfo, false, state.rex.w ? 64 : 32),
          ],
        });
      case 0xff: {
        const subCode = opInfo.reg & 0x7;
        if (subCode === 2) {
          return new X86Instruction({
            mnemonic: 'call',
            operands: [this.resolveOperand(opInfo, false, 64)],
          });
        }
        if (subCode === 4) {
          return new X86Instruction({
            mnemonic: 'jmp',
            operands: [this.resolveOperand(opInfo, false, 64)],
          });
        }
        break;
      }
      case 0x0faf:
        return new X86Instruction({
          mnemonic: 'imul',
          operands: [
            this.resolveOperand(opInfo, true, state.rex.w ? 64 : 32),
            this.resolveOperand(opInfo, false, state.rex.w ? 64 : 32),
          ],
        });
      case 0x69: {
        const operandSize = state.rex.w ? 64 : 32;
        const immBytes = operandSize === 16 ? 2 : 4;
        const imm = this.readImm(state, immBytes, true);
        return new X86Instruction({
          mnemonic: 'imul',
          operands: [
            this.resolveOperand(opInfo, true, state.rex.w ? 64 : 32),
            this.resolveOperand(opInfo, false, state.rex.w ? 64 : 32),
            new Operand('imm', { value: imm, size: immBytes * 8 }),
          ],
        });
      }
      case 0x6b: {
        const imm = this.readImm(state, 1, true);
        return new X86Instruction({
          mnemonic: 'imul',
          operands: [
            this.resolveOperand(opInfo, true, state.rex.w ? 64 : 32),
            this.resolveOperand(opInfo, false, state.rex.w ? 64 : 32),
            new Operand('imm', { value: imm, size: 8 }),
          ],
        });
      }
      case 0xc7: {
        const imm = this.readImm(state, 4, false);
        return new X86Instruction({
          mnemonic: 'mov',
          operands: [
            this.resolveOperand(opInfo, false, state.rex.w ? 64 : 32),
            new Operand('imm', { value: imm, size: state.rex.w ? 64 : 32 }),
          ],
        });
      }
      case 0xc6: {
        const imm = this.readImm(state, 1, false);
        return new X86Instruction({
          mnemonic: 'mov',
          operands: [
            this.resolveOperand(opInfo, false, 8),
            new Operand('imm', { value: BigInt(imm), size: 8 }),
          ],
        });
      }
      case 0xc1: {
        const mnemonic = this.shiftMnemonic(opInfo.reg & 0x7);
        if (!mnemonic) break;
        const imm = this.readImm(state, 1, false);
        return new X86Instruction({
          mnemonic,
          operands: [
            this.resolveOperand(opInfo, false, state.rex.w ? 64 : 32),
            new Operand('imm', { value: BigInt(imm), size: 8 }),
          ],
        });
      }
      case 0xd1: {
        const mnemonic = this.shiftMnemonic(opInfo.reg & 0x7);
        if (!mnemonic) break;
        return new X86Instruction({
          mnemonic,
          operands: [
            this.resolveOperand(opInfo, false, state.rex.w ? 64 : 32),
            new Operand('imm', { value: 1n, size: 8 }),
          ],
        });
      }
      case 0xd3: {
        const mnemonic = this.shiftMnemonic(opInfo.reg & 0x7);
        if (!mnemonic) break;
        return new X86Instruction({
          mnemonic,
          operands: [
            this.resolveOperand(opInfo, false, state.rex.w ? 64 : 32),
            new Operand('reg', { name: 'cl', size: 8 }),
          ],
        });
      }
      case 0x81:
      case 0x83: {
        const immediateSize = opcode === 0x81 ? 4 : 1;
        const immValue = this.readImm(state, immediateSize, true);
        const subCode = opInfo.reg & 0x7;
        let mnemonic = null;
        switch (subCode) {
          case 0:
            mnemonic = 'add';
            break;
          case 1:
            mnemonic = 'or';
            break;
          case 4:
            mnemonic = 'and';
            break;
          case 5:
            mnemonic = 'sub';
            break;
          case 6:
            mnemonic = 'xor';
            break;
          default:
            mnemonic = null;
        }
        if (!mnemonic) break;
        return new X86Instruction({
          mnemonic,
          operands: [
            this.resolveOperand(opInfo, false, state.rex.w ? 64 : 32),
            new Operand('imm', { value: immValue, size: state.rex.w ? 64 : 32 }),
          ],
        });
      }
      case 0x0fb6:
        return new X86Instruction({
          mnemonic: 'movzx',
          operands: [
            this.resolveOperand(opInfo, true, 32),
            this.resolveOperand(opInfo, false, 8),
          ],
        });
      case 0x0fb7:
        return new X86Instruction({
          mnemonic: 'movzx',
          operands: [
            this.resolveOperand(opInfo, true, 32),
            this.resolveOperand(opInfo, false, 16),
          ],
        });
      case 0x0f28:
      case 0x0f29:
      case 0x0f57:
      case 0x0f10:
      case 0x0f11:
      case 0x0f1f:
        this.resolveOperand(opInfo, false, 128);
        return new X86Instruction({ mnemonic: 'nop' });
      default:
        return null;
    }
    return null;
  }

  shiftMnemonic(subCode) {
    switch (subCode) {
      case 4:
        return 'shl';
      case 5:
        return 'shr';
      case 7:
        return 'sar';
      default:
        return null;
    }
  }
}
