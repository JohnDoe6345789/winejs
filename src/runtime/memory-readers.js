export function readAnsiString(cpu, address, decoder, maxLength = 256) {
  if (!address || !decoder) return '';
  const bytes = [];
  const limit = Math.min(maxLength ?? 256, 4096);
  for (let i = 0; i < limit; i++) {
    const value = cpu.memory.readByte(address + BigInt(i));
    if (value === 0) break;
    bytes.push(value);
  }
  if (!bytes.length) return '';
  return decoder.decode(new Uint8Array(bytes));
}

export function readWideString(cpu, address, decoder, maxChars = 256) {
  if (!address || !decoder) return '';
  const bytes = [];
  const limit = Math.min(maxChars ?? 256, 2048);
  for (let i = 0; i < limit; i++) {
    const lo = cpu.memory.readByte(address + BigInt(i * 2));
    const hi = cpu.memory.readByte(address + BigInt(i * 2 + 1));
    if (lo === 0 && hi === 0) break;
    bytes.push(lo, hi);
  }
  if (!bytes.length) return '';
  return decoder.decode(new Uint8Array(bytes));
}
