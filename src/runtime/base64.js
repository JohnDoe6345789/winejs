export function decodeBase64Executable(payload) {
  if (typeof payload !== 'string' || !payload.trim()) {
    throw new Error('Executable payload must be a non-empty base64 string.');
  }
  const normalized = payload.replace(/\s+/g, '');
  if (!normalized) {
    throw new Error('Executable payload must be a non-empty base64 string.');
  }
  if (typeof atob === 'function') {
    try {
      const binary = atob(normalized);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    } catch (err) {
      throw new Error(`Executable payload is not valid base64 data. ${err?.message ?? ''}`.trim());
    }
  }
  if (typeof Buffer !== 'undefined') {
    try {
      return new Uint8Array(Buffer.from(normalized, 'base64'));
    } catch (err) {
      throw new Error(`Executable payload is not valid base64 data. ${err?.message ?? ''}`.trim());
    }
  }
  throw new Error('No base64 decoder available in this environment.');
}
