export function createImportHandler({ readAnsiString, readWideString, log }) {
  return function handleImportCall({ name, cpu, consoleLines, flagGui }) {
    const lower = name.toLowerCase();
    if (lower.includes('user32.dll')) flagGui?.();
    if (lower.endsWith('writeconsolew')) {
      const pointer = cpu.readRegister('rdx');
      const charCount = Number(cpu.readRegister('r8') & 0xffffffffn) || undefined;
      const text = readWideString(cpu, pointer, charCount);
      if (text) consoleLines.push(text);
      return { rax: 1 };
    }
    if (lower.endsWith('writeconsolea')) {
      const pointer = cpu.readRegister('rdx');
      const byteCount = Number(cpu.readRegister('r8') & 0xffffffffn) || undefined;
      const text = readAnsiString(cpu, pointer, byteCount);
      if (text) consoleLines.push(text);
      return { rax: 1 };
    }
    if (lower.includes('messagebox')) {
      flagGui?.();
      const textPtr = cpu.readRegister('rdx');
      const text = readWideString(cpu, textPtr, 256);
      if (text) log?.(`[WineJS] MessageBox payload: ${text}`);
      return { rax: 1 };
    }
    if (lower.includes('createwindow') || lower.includes('dialogbox') || lower.includes('registerclass')) {
      flagGui?.();
      return { rax: 1 };
    }
    return { rax: 0 };
  };
}
