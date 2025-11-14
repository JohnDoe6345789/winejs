import { BinaryReader } from './binary-reader.js';

export class PeFile {
  constructor(buffer) {
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

    const NUMBER_OF_RVA_AND_SIZES_OFFSET = 0x6c;
    const DATA_DIRECTORY_OFFSET = 0x70;
    const dirCount = reader.readUInt32(optionalOffset + NUMBER_OF_RVA_AND_SIZES_OFFSET);
    const dirBase = optionalOffset + DATA_DIRECTORY_OFFSET;
    this.dataDirectories = [];
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
      for (let j = 0; j < 8 && nameBytes[j] !== 0; j++) {
        name += String.fromCharCode(nameBytes[j]);
      }
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
