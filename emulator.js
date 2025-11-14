class BinaryReader {
  constructor(buffer) {
    this.buffer = buffer;
    this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }

  readUInt16(offset) {
    return this.view.getUint16(offset, true);
  }

  readUInt32(offset) {
    return this.view.getUint32(offset, true);
  }

  readInt32(offset) {
    return this.view.getInt32(offset, true);
  }

  readUInt64(offset) {
    const lo = this.view.getUint32(offset, true);
    const hi = this.view.getUint32(offset + 4, true);
    return (BigInt(hi) << 32n) | BigInt(lo);
  }

  readBytes(offset, length) {
    return new Uint8Array(this.buffer.buffer, this.buffer.byteOffset + offset, length);
  }
}

class PeFile {
  constructor(buffer) {
    if (!(buffer instanceof Uint8Array)) throw new Error('PEFile expects Uint8Array');
    this.reader = new BinaryReader(buffer);
    this.buffer = buffer;
    this.sections = [];
    this.imports = new Map();
    this.parseHeaders();
  }

  parseHeaders() {
    const reader = this.reader;
    if (reader.readUInt16(0) !== 0x5a4d) {
      throw new Error('Missing MZ header. Unsupported binary.');
    }
    const peOffset = reader.readUInt32(0x3c);
    const signature = reader.readUInt32(peOffset);
    if (signature !== 0x4550) throw new Error('Missing PE signature.');

    const coffOffset = peOffset + 4;
    const machine = reader.readUInt16(coffOffset);
    if (machine !== 0x8664) throw new Error('Only x86-64 PE files are supported.');
    const numberOfSections = reader.readUInt16(coffOffset + 2);
    const optionalHeaderSize = reader.readUInt16(coffOffset + 16);

    const optionalOffset = coffOffset + 20;
    const magic = reader.readUInt16(optionalOffset);
    if (magic !== 0x20b) throw new Error('Only PE32+ images supported.');

    this.imageBase = reader.readUInt64(optionalOffset + 24);
    this.entryRva = reader.readUInt32(optionalOffset + 16);
    this.sizeOfImage = reader.readUInt32(optionalOffset + 56);

    this.dataDirectories = [];
    const dirCount = reader.readUInt32(optionalOffset + 92);
    const dirBase = optionalOffset + 96;
    for (let i = 0; i < dirCount; i++) {
      const rva = reader.readUInt32(dirBase + i * 8);
      const size = reader.readUInt32(dirBase + i * 8 + 4);
      this.dataDirectories.push({ rva, size });
    }

    const sectionBase = optionalOffset + optionalHeaderSize;
    for (let i = 0; i < numberOfSections; i++) {
      const base = sectionBase + i * 40;
      const nameBytes = reader.readBytes(base, 8);
      let name = '';
      for (let j = 0; j < 8 && nameBytes[j] !== 0; j++) name += String.fromCharCode(nameBytes[j]);
      const virtualSize = reader.readUInt32(base + 8);
      const virtualAddress = reader.readUInt32(base + 12);
      const sizeOfRawData = reader.readUInt32(base + 16);
      const pointerToRawData = reader.readUInt32(base + 20);
      this.sections.push({ name, virtualSize, virtualAddress, sizeOfRawData, pointerToRawData });
    }
  }

  rvaToOffset(rva) {
    for (const section of this.sections) {
      const size = Math.max(section.virtualSize, section.sizeOfRawData);
      if (rva >= section.virtualAddress && rva < section.virtualAddress + size) {
        const delta = rva - section.virtualAddress;
        return section.pointerToRawData + delta;
      }
    }
    return null;
  }

  vaToOffset(va) {
    const rva = Number(va - this.imageBase);
    return this.rvaToOffset(rva);
  }

  readBytesAtVA(va, length) {
    const offset = this.vaToOffset(BigInt(va));
    if (offset == null) return null;
    return this.reader.readBytes(offset, length);
  }

  readBytesAtRva(rva, length) {
    const offset = this.rvaToOffset(rva);
    if (offset == null) return null;
    return this.reader.readBytes(offset, length);
  }

  readAnsiString(rva) {
    const chunk = [];
    let offset = this.rvaToOffset(rva);
    if (offset == null) return '';
    while (offset < this.buffer.length) {
      const byte = this.buffer[offset++];
      if (byte === 0) break;
      chunk.push(byte);
      if (chunk.length > 4096) break;
    }
    return String.fromCharCode(...chunk);
  }

  getImportDirectory() {
    const IMPORT_DIR_INDEX = 1;
    const entry = this.dataDirectories[IMPORT_DIR_INDEX];
    if (!entry || !entry.rva) return [];
    const imports = [];
    const descriptorSize = 20;
    let cursor = entry.rva;
    while (true) {
      const thunkRva = this.reader.readUInt32(this.rvaToOffset(cursor));
      const firstThunk = this.reader.readUInt32(this.rvaToOffset(cursor + 16));
      if (!thunkRva && !firstThunk) break;
      const nameRva = this.reader.readUInt32(this.rvaToOffset(cursor + 12));
      const dllName = this.readAnsiString(nameRva);
      let lookup = thunkRva;
      let address = firstThunk;
      while (true) {
        const lookupOffset = this.rvaToOffset(lookup);
        const thunkOffset = this.rvaToOffset(address);
        if (lookupOffset == null || thunkOffset == null) break;
        const lookupValue = this.reader.readUInt64(lookupOffset);
        if (!lookupValue) break;
        if ((lookupValue & (1n << 63n)) !== 0n) {
          // Ordinals not supported
        } else {
          const hintNameRva = Number(lookupValue & 0xffffffffn);
          const hintNameOffset = this.rvaToOffset(hintNameRva);
          if (hintNameOffset != null) {
            const hint = this.reader.readUInt16(hintNameOffset);
            let name = '';
            let idx = hintNameOffset + 2;
            while (idx < this.buffer.length) {
              const b = this.buffer[idx++];
              if (b === 0) break;
              name += String.fromCharCode(b);
              if (name.length > 512) break;
            }
            const iatAddress = this.imageBase + BigInt(address);
            this.imports.set(iatAddress, { dll: dllName.toLowerCase(), name, hint });
            imports.push({ dll: dllName.toLowerCase(), name, iatAddress });
          }
        }
        lookup += 8;
        address += 8;
      }
      cursor += descriptorSize;
    }
    return imports;
  }
}

class PeMemory {
  constructor(pe) {
    this.pe = pe;
    this.overrides = new Map();
  }

  readByte(address) {
    const key = address.toString();
    if (this.overrides.has(key)) {
      return this.overrides.get(key);
    }
    const offset = this.pe.vaToOffset(address);
    if (offset == null || offset < 0 || offset >= this.pe.buffer.length) return 0;
    return this.pe.buffer[offset];
  }

  read(address, size) {
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      bytes[i] = this.readByte(address + BigInt(i));
    }
    return bytes;
  }

  readUInt(address, size) {
    const bytes = this.read(address, size);
    let value = 0n;
    for (let i = 0; i < size; i++) {
      value |= BigInt(bytes[i]) << BigInt(8 * i);
    }
    return value;
  }

  write(address, bytes) {
    for (let i = 0; i < bytes.length; i++) {
      const key = (address + BigInt(i)).toString();
      this.overrides.set(key, bytes[i]);
    }
  }

  writeUInt(address, size, value) {
    const bytes = new Uint8Array(size);
    let tmp = BigInt(value);
    for (let i = 0; i < size; i++) {
      bytes[i] = Number(tmp & 0xffn);
      tmp >>= 8n;
    }
    this.write(address, bytes);
  }
}

function signExtend(value, bits) {
  const mask = 1n << BigInt(bits - 1);
  let result = BigInt(value);
  if (result & mask) {
    const fullMask = (1n << BigInt(bits)) - 1n;
    result = -((~result + 1n) & fullMask);
  }
  return result;
}

function maskBits(value, bits) {
  const mask = (1n << BigInt(bits)) - 1n;
  return BigInt(value) & mask;
}

const REG64 = ['rax', 'rcx', 'rdx', 'rbx', 'rsp', 'rbp', 'rsi', 'rdi', 'r8', 'r9', 'r10', 'r11', 'r12', 'r13', 'r14', 'r15'];
const REG32 = ['eax', 'ecx', 'edx', 'ebx', 'esp', 'ebp', 'esi', 'edi', 'r8d', 'r9d', 'r10d', 'r11d', 'r12d', 'r13d', 'r14d', 'r15d'];
const REG16 = ['ax', 'cx', 'dx', 'bx', 'sp', 'bp', 'si', 'di', 'r8w', 'r9w', 'r10w', 'r11w', 'r12w', 'r13w', 'r14w', 'r15w'];
const REG8 = ['al', 'cl', 'dl', 'bl', 'spl', 'bpl', 'sil', 'dil', 'r8b', 'r9b', 'r10b', 'r11b', 'r12b', 'r13b', 'r14b', 'r15b'];

class Operand {
  constructor(kind, props) {
    this.kind = kind;
    Object.assign(this, props);
  }
}

class X86Instruction {
  constructor({ mnemonic, length, operands = [], imm, rel }) {
    this.mnemonic = mnemonic;
    this.length = length;
    this.operands = operands;
    this.imm = imm;
    this.rel = rel;
  }
}

class X86Decoder {
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

  resolveOperand(opInfo, isReg, size, state) {
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
            this.resolveOperand(opInfo, false, state.rex.w ? 64 : 32, state),
            this.resolveOperand(opInfo, true, state.rex.w ? 64 : 32, state),
          ],
        });
      case 0x8b:
        return new X86Instruction({
          mnemonic: 'mov',
          operands: [
            this.resolveOperand(opInfo, true, state.rex.w ? 64 : 32, state),
            this.resolveOperand(opInfo, false, state.rex.w ? 64 : 32, state),
          ],
        });
      case 0x8d:
        return new X86Instruction({
          mnemonic: 'lea',
          operands: [
            this.resolveOperand(opInfo, true, 64, state),
            this.resolveOperand(opInfo, false, 64, state),
          ],
        });
      case 0x31:
        return new X86Instruction({
          mnemonic: 'xor',
          operands: [
            this.resolveOperand(opInfo, false, 32, state),
            this.resolveOperand(opInfo, true, 32, state),
          ],
        });
      case 0x33:
        return new X86Instruction({
          mnemonic: 'xor',
          operands: [
            this.resolveOperand(opInfo, true, 32, state),
            this.resolveOperand(opInfo, false, 32, state),
          ],
        });
      case 0x85:
        return new X86Instruction({
          mnemonic: 'test',
          operands: [
            this.resolveOperand(opInfo, false, state.rex.w ? 64 : 32, state),
            this.resolveOperand(opInfo, true, state.rex.w ? 64 : 32, state),
          ],
        });
      case 0x39:
        return new X86Instruction({
          mnemonic: 'cmp',
          operands: [
            this.resolveOperand(opInfo, false, state.rex.w ? 64 : 32, state),
            this.resolveOperand(opInfo, true, state.rex.w ? 64 : 32, state),
          ],
        });
      case 0x3b:
        return new X86Instruction({
          mnemonic: 'cmp',
          operands: [
            this.resolveOperand(opInfo, true, state.rex.w ? 64 : 32, state),
            this.resolveOperand(opInfo, false, state.rex.w ? 64 : 32, state),
          ],
        });
      case 0xff: {
        const subCode = opInfo.reg & 0x7;
        if (subCode === 2) {
          return new X86Instruction({
            mnemonic: 'call',
            operands: [this.resolveOperand(opInfo, false, 64, state)],
          });
        }
        if (subCode === 4) {
          return new X86Instruction({
            mnemonic: 'jmp',
            operands: [this.resolveOperand(opInfo, false, 64, state)],
          });
        }
        break;
      }
      case 0xc7: {
        const imm = this.readImm(state, 4, false);
        return new X86Instruction({
          mnemonic: 'mov',
          operands: [
            this.resolveOperand(opInfo, false, state.rex.w ? 64 : 32, state),
            new Operand('imm', { value: imm, size: state.rex.w ? 64 : 32 }),
          ],
        });
      }
      case 0xc6: {
        const imm = this.readImm(state, 1, false);
        return new X86Instruction({
          mnemonic: 'mov',
          operands: [
            this.resolveOperand(opInfo, false, 8, state),
            new Operand('imm', { value: BigInt(imm), size: 8 }),
          ],
        });
      }
      case 0x81:
      case 0x83: {
        const immediateSize = opcode === 0x81 ? 4 : 1;
        const immValue = this.readImm(state, immediateSize, true);
        const subCode = opInfo.reg & 0x7;
        const mnemonic = subCode === 5 ? 'sub' : subCode === 0 ? 'add' : null;
        if (!mnemonic) break;
        return new X86Instruction({
          mnemonic,
          operands: [
            this.resolveOperand(opInfo, false, state.rex.w ? 64 : 32, state),
            new Operand('imm', { value: immValue, size: state.rex.w ? 64 : 32 }),
          ],
        });
      }
      case 0x0fb6:
        return new X86Instruction({
          mnemonic: 'movzx',
          operands: [
            this.resolveOperand(opInfo, true, 32, state),
            this.resolveOperand(opInfo, false, 8, state),
          ],
        });
      case 0x0fb7:
        return new X86Instruction({
          mnemonic: 'movzx',
          operands: [
            this.resolveOperand(opInfo, true, 32, state),
            this.resolveOperand(opInfo, false, 16, state),
          ],
        });
      case 0x0f28:
      case 0x0f29:
      case 0x0f57:
      case 0x0f10:
      case 0x0f11:
      case 0x0f1f:
        // Treat SIMD and multi-byte nops as no-ops but consume operands for length accuracy.
        this.resolveOperand(opInfo, false, 128, state);
        return new X86Instruction({ mnemonic: 'nop' });
      default:
        return null;
    }
    return null;
  }
}

class X86CPU {
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

  readRegister(name) {
    if (!this.registers.has(name)) this.registers.set(name, 0n);
    return this.registers.get(name);
  }

  writeRegister(name, value, size = 64) {
    const bits = BigInt(size);
    const masked = maskBits(BigInt(value), Number(bits));
    if (size === 32) {
      const host = name.replace(/d$/, '');
      this.registers.set(host, masked & ((1n << 32n) - 1n));
      return;
    }
    if (size === 16 || size === 8) {
      const host = name.replace(/[bwd]$/, '');
      const current = this.registers.get(host) || 0n;
      const mask = size === 8 ? ((1n << 8n) - 1n) : ((1n << 16n) - 1n);
      const cleared = current & ~mask;
      this.registers.set(host, cleared | (masked & mask));
      return;
    }
    this.registers.set(name, masked);
  }

  computeAddress(desc) {
    if (desc.address.ripRelative) {
      return this.readRegister('rip') + BigInt(desc.address.displacement);
    }
    let base = desc.address.base ? this.readRegister(desc.address.base) : 0n;
    let index = desc.address.index ? this.readRegister(desc.address.index) : 0n;
    const scale = BigInt(desc.address.scale ?? 1);
    return base + index * scale + BigInt(desc.address.displacement);
  }

  readOperand(operand) {
    if (operand.kind === 'reg') {
      return this.readRegister(operand.name);
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
    const rsp = this.readRegister('rsp') - 8n;
    this.registers.set('rsp', rsp);
    this.memory.writeUInt(rsp, 8, value);
  }

  pop() {
    const rsp = this.readRegister('rsp');
    const value = this.memory.readUInt(rsp, 8);
    this.registers.set('rsp', rsp + 8n);
    return value;
  }

  run({ maxSteps = 50000, hooks } = {}) {
    const output = [];
    const visitedImports = [];
    for (let step = 0; step < maxSteps; step++) {
      const rip = this.readRegister('rip');
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
    const rip = this.readRegister('rip');
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
    const rip = this.readRegister('rip');
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

class X86Simulator {
  constructor(buffer) {
    this.pe = new PeFile(buffer);
  }

  run(options = {}) {
    const cpu = new X86CPU(this.pe);
    return cpu.run(options);
  }
}

const WineX86 = {
  PeFile,
  X86Simulator,
};

if (typeof window !== 'undefined') {
  window.WineX86 = WineX86;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = WineX86;
}
