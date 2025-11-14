export function maskBits(value, bits) {
  const mask = (1n << BigInt(bits)) - 1n;
  return BigInt(value) & mask;
}
