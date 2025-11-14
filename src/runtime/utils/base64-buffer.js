export function bytesToBase64(bytes) {
  if (!bytes) return '';
  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    return Buffer.from(bytes).toString('base64');
  }
  if (typeof btoa !== 'function') {
    throw new Error('Base64 encoding is not available in this environment.');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBytes(base64) {
  if (!base64) return new Uint8Array();
  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  if (typeof atob !== 'function') {
    throw new Error('Base64 decoding is not available in this environment.');
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
