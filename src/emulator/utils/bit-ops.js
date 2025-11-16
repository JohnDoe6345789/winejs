export function maskBits(value, bits) {
  const mask = (1n << BigInt(bits)) - 1n;
  return BigInt(value) & mask;
}

export function signExtend(value, bits) {
  const bigBits = BigInt(bits);
  const mask = (1n << bigBits) - 1n;
  let masked = BigInt(value) & mask;
  const signBit = 1n << (bigBits - 1n);
  if (masked & signBit) {
    masked -= 1n << bigBits;
  }
  return masked;
}
