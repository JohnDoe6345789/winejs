import { PeMemory } from '../pe-memory.js';
import { X86Decoder } from './decoder.js';
import { maskBits, signExtend } from '../utils/bit-ops.js';

export class X86CPU {
  constructor(pe) {
    this.pe = pe;
    this.memory = new PeMemory(pe);
    this.decoder = new X86Decoder(this.memory);
    this.registers = new Map();
    this.flags = { zf: false, sf: false };
    this.imports = pe.getImportDirectory();
    this.iatMap = pe.imports;
    this.reset();
  }

  reset() {
    const baseRegs = [
      'rax',
      'rbx',
      'rcx',
      'rdx',
      'rsi',
      'rdi',
      'rbp',
      'rsp',
      'r8',
      'r9',
      'r10',
      'r11',
      'r12',
      'r13',
      'r14',
      'r15',
    ];
    baseRegs.forEach((reg) => this.registers.set(reg, 0n));
    this.registers.set('rsp', 0x100000000n);
    this.registers.set('rip', this.pe.imageBase + BigInt(this.pe.entryRva));
    this.flags = { zf: false, sf: false };
  }

  baseRegisterName(name) {
    if (!name) return name;
    const lower = name.toLowerCase();
    if (this.registers.has(lower)) return lower;
    const special = {
      eax: 'rax',
      ebx: 'rbx',
      ecx: 'rcx',
      edx: 'rdx',
      esi: 'rsi',
      edi: 'rdi',
      ebp: 'rbp',
      esp: 'rsp',
      ax: 'rax',
      bx: 'rbx',
      cx: 'rcx',
      dx: 'rdx',
      si: 'rsi',
      di: 'rdi',
      bp: 'rbp',
      sp: 'rsp',
      al: 'rax',
      bl: 'rbx',
      cl: 'rcx',
      dl: 'rdx',
      spl: 'rsp',
      bpl: 'rbp',
      sil: 'rsi',
      dil: 'rdi',
    };
    if (special[lower]) return special[lower];
    if (/^r(1[0-5]|[8-9])(d|w|b)$/.test(lower)) {
      return lower.slice(0, -1);
    }
    return lower;
  }

  readRegister(name, size = 64) {
    const host = this.baseRegisterName(name);
    if (!host) return 0n;
    if (!this.registers.has(host)) this.registers.set(host, 0n);
    const value = this.registers.get(host);
    if (size >= 64) return value;
    return maskBits(value, size);
  }

  writeRegister(name, value, size = 64) {
    const host = this.baseRegisterName(name);
    if (!host) return;
    const bits = BigInt(size);
    const masked = maskBits(BigInt(value), Number(bits));
    if (size === 32) {
      this.registers.set(host, masked);
      return;
    }
    if (size === 16 || size === 8) {
      const current = this.registers.get(host) || 0n;
      const mask = (1n << bits) - 1n;
      const cleared = current & ~mask;
      this.registers.set(host, cleared | (masked & mask));
      return;
    }
    this.registers.set(host, masked);
  }

  computeAddress(desc) {
    if (desc.address.ripRelative) {
      return this.readRegister('rip', 64) + BigInt(desc.address.displacement);
    }
    let base = desc.address.base ? this.readRegister(desc.address.base, 64) : 0n;
    let index = desc.address.index ? this.readRegister(desc.address.index, 64) : 0n;
    const scale = BigInt(desc.address.scale ?? 1);
    return base + index * scale + BigInt(desc.address.displacement);
  }

  readOperand(operand) {
    if (operand.kind === 'reg') {
      return this.readRegister(operand.name, operand.size ?? 64);
    }
    if (operand.kind === 'imm') {
      return operand.value;
    }
    if (operand.kind === 'mem') {
      const address = this.computeAddress(operand);
      return this.memory.readUInt(address, operand.size / 8);
    }
    return 0n;
  }

  writeOperand(operand, value) {
    if (operand.kind === 'reg') {
      this.writeRegister(operand.name, value, operand.size);
    } else if (operand.kind === 'mem') {
      const address = this.computeAddress(operand);
      this.memory.writeUInt(address, operand.size / 8, value);
    }
  }

  push(value) {
    const rsp = this.readRegister('rsp', 64) - 8n;
    this.registers.set('rsp', rsp);
    this.memory.writeUInt(rsp, 8, value);
  }

  pop() {
    const rsp = this.readRegister('rsp', 64);
    const value = this.memory.readUInt(rsp, 8);
    this.registers.set('rsp', rsp + 8n);
    return value;
  }

  run({ maxSteps = 50000, hooks } = {}) {
    const output = [];
    const visitedImports = [];
    for (let step = 0; step < maxSteps; step++) {
      const rip = this.readRegister('rip', 64);
      const instr = this.decoder.decode(rip);
      const nextRip = rip + BigInt(instr.length);
      const action = this.executeInstruction(instr, { nextRip, hooks, output, visitedImports });
      if (action === 'halt') break;
      if (action === 'jump') continue;
      this.registers.set('rip', nextRip);
    }
    return { output, imports: visitedImports };
  }

  executeInstruction(instr, context) {
    switch (instr.mnemonic) {
      case 'nop':
        return;
      case 'hlt':
        return 'halt';
      case 'mov': {
        const value = this.readOperand(instr.operands[1]);
        this.writeOperand(instr.operands[0], value);
        return;
      }
      case 'lea': {
        const address = this.computeAddress(instr.operands[1]);
        this.writeOperand(instr.operands[0], address);
        return;
      }
      case 'sub': {
        const dest = instr.operands[0];
        const left = this.readOperand(dest);
        const right = this.readOperand(instr.operands[1]);
        const result = left - right;
        this.writeOperand(dest, result);
        this.flags.zf = result === 0n;
        this.flags.sf = result < 0n;
        return;
      }
      case 'and': {
        const dest = instr.operands[0];
        const left = this.readOperand(dest);
        const right = this.readOperand(instr.operands[1]);
        const result = left & right;
        this.writeOperand(dest, result);
        this.flags.zf = result === 0n;
        this.flags.sf = result < 0n;
        return;
      }
      case 'or': {
        const dest = instr.operands[0];
        const left = this.readOperand(dest);
        const right = this.readOperand(instr.operands[1]);
        const result = left | right;
        this.writeOperand(dest, result);
        this.flags.zf = result === 0n;
        this.flags.sf = result < 0n;
        return;
      }
      case 'add': {
        const dest = instr.operands[0];
        const left = this.readOperand(dest);
        const right = this.readOperand(instr.operands[1]);
        const result = left + right;
        this.writeOperand(dest, result);
        this.flags.zf = result === 0n;
        this.flags.sf = result < 0n;
        return;
      }
      case 'xor': {
        const dest = instr.operands[0];
        const left = this.readOperand(dest);
        const right = this.readOperand(instr.operands[1]);
        const result = left ^ right;
        this.writeOperand(dest, result);
        this.flags.zf = result === 0n;
        this.flags.sf = result < 0n;
        return;
      }
      case 'shl':
      case 'shr':
      case 'sar': {
        const dest = instr.operands[0];
        const countOperand = instr.operands[1];
        const size = dest.size ?? 64;
        let count = Number(this.readOperand(countOperand));
        count &= 0x3f;
        const value = maskBits(this.readOperand(dest), size);
        let result;
        if (instr.mnemonic === 'shl') {
          result = maskBits(value << BigInt(count), size);
        } else if (instr.mnemonic === 'shr') {
          result = maskBits(value >> BigInt(count), size);
        } else {
          const signed = signExtend(value, size);
          result = maskBits(signed >> BigInt(count), size);
        }
        this.writeOperand(dest, result);
        const signedResult = signExtend(result, size);
        this.flags.zf = result === 0n;
        this.flags.sf = signedResult < 0n;
        return;
      }
      case 'imul': {
        const dest = instr.operands[0];
        const size = dest.size ?? 64;
        let left;
        let right;
        if (instr.operands.length === 3) {
          left = this.readOperand(instr.operands[1]);
          right = this.readOperand(instr.operands[2]);
        } else {
          left = this.readOperand(dest);
          right = this.readOperand(instr.operands[1]);
        }
        const signedLeft = signExtend(left, size);
        const signedRight = signExtend(right, size);
        const product = signedLeft * signedRight;
        const masked = maskBits(product, size);
        this.writeOperand(dest, masked);
        const signedResult = signExtend(masked, size);
        this.flags.zf = masked === 0n;
        this.flags.sf = signedResult < 0n;
        return;
      }
      case 'cmp':
      case 'test': {
        const left = this.readOperand(instr.operands[0]);
        const right = this.readOperand(instr.operands[1]);
        const result = instr.mnemonic === 'cmp' ? left - right : left & right;
        this.flags.zf = result === 0n;
        this.flags.sf = result < 0n;
        return;
      }
      case 'movzx': {
        const value = this.readOperand(instr.operands[1]);
        this.writeOperand(instr.operands[0], value);
        this.flags.zf = value === 0n;
        return;
      }
      case 'push': {
        const value = this.readOperand(instr.operands[0]);
        this.push(value);
        return;
      }
      case 'pop': {
        const value = this.pop();
        this.writeOperand(instr.operands[0], value);
        return;
      }
      case 'call':
        return this.handleCall(instr, context);
      case 'jmp':
        return this.handleJump(instr);
      case 'je':
        if (this.flags.zf) return this.handleJump(instr);
        return;
      case 'jne':
        if (!this.flags.zf) return this.handleJump(instr);
        return;
      case 'ret': {
        const target = this.pop();
        this.registers.set('rip', target);
        return 'jump';
      }
      default:
        throw new Error(`Unsupported instruction ${instr.mnemonic}`);
    }
  }

  handleCall(instr, context) {
    const rip = this.readRegister('rip', 64);
    if (instr.rel != null) {
      const target = rip + BigInt(instr.rel);
      this.push(context.nextRip);
      this.registers.set('rip', target);
      return 'jump';
    }
    if (!instr.operands.length) throw new Error('call requires operand');
    const operand = instr.operands[0];
    let target;
    if (operand.kind === 'mem') {
      const address = this.computeAddress(operand);
      target = this.memory.readUInt(address, 8);
      const imp = this.iatMap.get(target);
      if (imp) {
        context.visitedImports.push(imp);
        const hookName = `${imp.dll}!${imp.name}`;
        const handled = context.hooks?.handleImport?.(hookName, this, context);
        if (handled) {
          if (typeof handled === 'object' && handled.rax !== undefined) {
            this.writeRegister('rax', BigInt(handled.rax));
          }
          this.registers.set('rip', context.nextRip);
          return 'jump';
        }
      }
    } else if (operand.kind === 'reg') {
      target = this.readOperand(operand);
    } else {
      target = this.readOperand(operand);
    }
    this.push(context.nextRip);
    this.registers.set('rip', target);
    return 'jump';
  }

  handleJump(instr) {
    const rip = this.readRegister('rip', 64);
    if (instr.rel != null) {
      this.registers.set('rip', rip + BigInt(instr.rel));
      return 'jump';
    }
    if (instr.operands.length) {
      const operand = instr.operands[0];
      const target = this.readOperand(operand);
      this.registers.set('rip', target);
      return 'jump';
    }
    return;
  }
}
