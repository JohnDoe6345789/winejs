import { bytesToBase64, base64ToBytes } from '../utils/base64-buffer.js';

export class WinsockBridge {
  constructor({ bridge, log } = {}) {
    this.bridge = null;
    this.log = log ?? (() => {});
    this.buffers = new Map();
    this.listeners = new Map();
    this.unsubscribeFns = [];
    if (bridge) {
      this.setBridge(bridge);
    }
  }

  setBridge(bridge) {
    this.cleanup();
    this.bridge = bridge ?? null;
    this.buffers.clear();
    if (!bridge || !bridge.subscribe) {
      return;
    }
    this.unsubscribeFns = [
      bridge.subscribe('winsock:data', (payload) => this.handleData(payload)),
      bridge.subscribe('winsock:error', (payload) => this.handleEvent('error', payload)),
      bridge.subscribe('winsock:closed', (payload) => this.handleClose(payload)),
      bridge.subscribe('winsock:open', (payload) => this.handleEvent('open', payload)),
    ];
  }

  cleanup() {
    this.unsubscribeFns.forEach((fn) => {
      try {
        fn?.();
      } catch {
        // ignore
      }
    });
    this.unsubscribeFns = [];
  }

  subscribe(event, handler) {
    if (!event || typeof handler !== 'function') return () => {};
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    const set = this.listeners.get(event);
    set.add(handler);
    return () => {
      set.delete(handler);
      if (!set.size) this.listeners.delete(event);
    };
  }

  emit(event, payload) {
    const set = this.listeners.get(event);
    if (!set) return;
    set.forEach((handler) => {
      try {
        handler(payload);
      } catch (err) {
        this.log?.(`[WineJS] Winsock listener error (${event}): ${err?.message ?? err}`);
      }
    });
  }

  handleData({ connectionId, data }) {
    if (!connectionId || !data) return;
    const id = String(connectionId);
    const queue = this.buffers.get(id) ?? [];
    queue.push(base64ToBytes(data));
    this.buffers.set(id, queue);
    this.emit('data', { connectionId: id });
  }

  handleClose({ connectionId }) {
    const id = String(connectionId);
    this.buffers.delete(id);
    this.emit('closed', { connectionId: id });
  }

  handleEvent(event, payload) {
    this.emit(event, payload);
  }

  ensureBridge() {
    if (!this.bridge?.request) {
      throw new Error('Backend bridge not configured for winsock tunneling.');
    }
    if (!this.bridge.isConnected?.()) {
      throw new Error('Backend bridge disconnected.');
    }
    return this.bridge;
  }

  openConnection({ connectionId, host, port }) {
    return this.ensureBridge().request('winsock:open', { connectionId, host, port });
  }

  send(connectionId, bytes) {
    const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
    return this.ensureBridge().request('winsock:send', {
      connectionId,
      data: bytesToBase64(buffer),
    });
  }

  close(connectionId) {
    return this.ensureBridge().request('winsock:close', { connectionId });
  }

  consume(connectionId, length) {
    const id = String(connectionId);
    const queue = this.buffers.get(id);
    if (!queue?.length || length <= 0) {
      return new Uint8Array();
    }
    const chunks = [];
    let remaining = length;
    while (remaining > 0 && queue.length) {
      const chunk = queue[0];
      if (chunk.length <= remaining) {
        chunks.push(chunk);
        queue.shift();
        remaining -= chunk.length;
      } else {
        chunks.push(chunk.subarray(0, remaining));
        queue[0] = chunk.subarray(remaining);
        remaining = 0;
      }
    }
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    chunks.forEach((chunk) => {
      result.set(chunk, offset);
      offset += chunk.length;
    });
    return result;
  }
}
