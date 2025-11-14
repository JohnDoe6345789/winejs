export const REG64 = [
  'rax',
  'rcx',
  'rdx',
  'rbx',
  'rsp',
  'rbp',
  'rsi',
  'rdi',
  'r8',
  'r9',
  'r10',
  'r11',
  'r12',
  'r13',
  'r14',
  'r15',
];

export const REG32 = [
  'eax',
  'ecx',
  'edx',
  'ebx',
  'esp',
  'ebp',
  'esi',
  'edi',
  'r8d',
  'r9d',
  'r10d',
  'r11d',
  'r12d',
  'r13d',
  'r14d',
  'r15d',
];

export const REG16 = [
  'ax',
  'cx',
  'dx',
  'bx',
  'sp',
  'bp',
  'si',
  'di',
  'r8w',
  'r9w',
  'r10w',
  'r11w',
  'r12w',
  'r13w',
  'r14w',
  'r15w',
];

export const REG8 = [
  'al',
  'cl',
  'dl',
  'bl',
  'spl',
  'bpl',
  'sil',
  'dil',
  'r8b',
  'r9b',
  'r10b',
  'r11b',
  'r12b',
  'r13b',
  'r14b',
  'r15b',
];

export class Operand {
  constructor(kind, props) {
    this.kind = kind;
    Object.assign(this, props);
  }
}

export class X86Instruction {
  constructor({ mnemonic, length = 0, operands = [], imm, rel }) {
    this.mnemonic = mnemonic;
    this.length = length;
    this.operands = operands;
    this.imm = imm;
    this.rel = rel;
  }
}
