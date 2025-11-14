export class PeMemory {
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
