const WINSOCK_DLL_REGEX = /(ws2_32|winsock|wsock32)/i;

function parseIPv4Sockaddr(bytes) {
  if (!bytes || bytes.length < 8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const family = view.getUint16(0, true);
  if (family !== 2) return null;
  const port = view.getUint16(2, false);
  const octets = Array.from(bytes.slice(4, 8));
  const host = octets.join('.');
  return { host, port };
}

function getSocketHandle(cpu, register = 'rcx') {
  const value = cpu.readRegister(register) & 0xffffffffn;
  return Number(value);
}

export function createWinsockWebSocketImportPlugin({
  getWinsockBridge,
  log,
  logTraffic = false,
  autoConnect = true,
} = {}) {
  const errorLogger = log ?? (() => {});
  const trafficLogger = logTraffic ? errorLogger : () => {};
  const resolveBridge = () => getWinsockBridge?.();

  function ensureBridge() {
    const bridge = resolveBridge();
    if (!bridge) return null;
    try {
      bridge.ensureBridge?.();
    } catch {
      return null;
    }
    return bridge;
  }

  function handleConnect(context) {
    const bridge = ensureBridge();
    if (!bridge) return { rax: 0 };
    const { cpu } = context;
    const socketHandle = getSocketHandle(cpu);
    const sockaddrPtr = cpu.readRegister('rdx');
    const nameLength = Number(cpu.readRegister('r8') & 0xffffffffn) || 16;
    const raw = cpu.memory.read(sockaddrPtr, Math.max(16, nameLength));
    const target = parseIPv4Sockaddr(raw);
    if (!target) {
      trafficLogger?.('[WineJS] Unable to parse winsock sockaddr, ignoring connect.');
      return { rax: 0 };
    }
    if (!autoConnect) {
      trafficLogger?.(`[WineJS] Auto-connect disabled. Skipping socket ${socketHandle} → ${target.host}:${target.port}`);
      return { rax: 0 };
    }
    bridge
      .openConnection({ connectionId: socketHandle, ...target })
      .catch((err) => errorLogger?.(`[WineJS] Winsock connect failed: ${err?.message ?? err}`));
    return { rax: 0 };
  }

  function handleSend(context) {
    const bridge = ensureBridge();
    if (!bridge) return { rax: 0 };
    const { cpu } = context;
    const socketHandle = getSocketHandle(cpu);
    const bufferPtr = cpu.readRegister('rdx');
    const length = Number(cpu.readRegister('r8') & 0xffffffffn) || 0;
    if (length <= 0) return { rax: 0 };
    const bytes = cpu.memory.read(bufferPtr, length);
    bridge
      .send(socketHandle, bytes)
      .catch((err) => errorLogger?.(`[WineJS] Winsock send failed: ${err?.message ?? err}`));
    return { rax: length };
  }

  function handleRecv(context) {
    const bridge = ensureBridge();
    if (!bridge) return { rax: 0 };
    const { cpu } = context;
    const socketHandle = getSocketHandle(cpu);
    const bufferPtr = cpu.readRegister('rdx');
    const length = Number(cpu.readRegister('r8') & 0xffffffffn) || 0;
    if (length <= 0) return { rax: 0 };
    const chunk = bridge.consume(socketHandle, length);
    if (chunk.length) {
      cpu.memory.write(bufferPtr, chunk);
      return { rax: chunk.length };
    }
    return { rax: 0 };
  }

  function handleClose(context) {
    const bridge = ensureBridge();
    if (!bridge) return { rax: 0 };
    const socketHandle = getSocketHandle(context.cpu);
    bridge
      .close(socketHandle)
      .catch((err) => errorLogger?.(`[WineJS] Winsock close failed: ${err?.message ?? err}`));
    return { rax: 0 };
  }

  return {
    id: 'winsock-websocket',
    match({ name }) {
      return WINSOCK_DLL_REGEX.test(name ?? '');
    },
    handle(context) {
      const lower = String(context.name ?? '').toLowerCase();
      if (lower.endsWith('wsastartup') || lower.endsWith('wsacleanup') || lower.endsWith('socket')) {
        return { rax: 0 };
      }
      if (lower.endsWith('connect')) {
        return handleConnect(context);
      }
      if (lower.endsWith('send')) {
        return handleSend(context);
      }
      if (lower.endsWith('recv')) {
        return handleRecv(context);
      }
      if (lower.endsWith('closesocket')) {
        return handleClose(context);
      }
      return undefined;
    },
  };
}
