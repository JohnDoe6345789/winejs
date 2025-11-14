export class BinaryReader {
  constructor(buffer) {
    if (!(buffer instanceof Uint8Array)) {
      throw new Error('BinaryReader expects Uint8Array input');
    }
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
