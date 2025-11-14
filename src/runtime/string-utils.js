export function extractPrintableStrings(buffer) {
  const strings = [];
  let current = [];
  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];
    if ((byte >= 32 && byte <= 126) || byte === 10 || byte === 13) {
      current.push(String.fromCharCode(byte));
    } else if (current.length) {
      strings.push(current.join(''));
      current = [];
    }
  }
  if (current.length) strings.push(current.join(''));
  return strings;
}
