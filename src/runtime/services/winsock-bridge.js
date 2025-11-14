import { bytesToBase64, base64ToBytes } from '../utils/base64-buffer.js';

export class WinsockBridge {
  constructor({ bridge, log } = {}) {
    this.bridge = null;
    this.log = log ?? (() => {});
    this.buffers = new Map();
    this.listeners = new Map();
    this.unsubscribeFns = [];
    this.connectionMeta = new Map();
    if (bridge) {
      this.setBridge(bridge);
    }
  }

  setBridge(bridge) {
    this.cleanup();
    this.bridge = bridge ?? null;
    this.buffers.clear();
    this.connectionMeta.clear();
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
    const buffer = base64ToBytes(data);
    queue.push(buffer);
    this.buffers.set(id, queue);
    const meta = this.touchMeta(id, { bytesReceived: buffer.length });
    this.emit('data', { connectionId: id, byteLength: buffer.length, meta });
  }

  handleClose({ connectionId }) {
    const id = String(connectionId);
    this.buffers.delete(id);
    const meta = this.touchMeta(id, { status: 'closed' });
    this.emit('closed', { connectionId: id, meta });
  }

  handleEvent(event, payload) {
    const id = payload?.connectionId ? String(payload.connectionId) : null;
    const meta = id ? this.touchMeta(id, event === 'error' ? { status: 'error' } : {}) : null;
    this.emit(event, meta ? { ...payload, meta } : payload);
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
    const id = String(connectionId);
    const meta = {
      connectionId: id,
      host,
      port,
      openedAt: Date.now(),
      status: 'opening',
      bytesReceived: 0,
      bytesSent: 0,
    };
    this.connectionMeta.set(id, meta);
    this.emit('opening', { meta });
    return this.ensureBridge()
      .request('winsock:open', { connectionId, host, port })
      .then((response) => {
        this.touchMeta(id, { status: 'open' });
        return response;
      })
      .catch((err) => {
        this.touchMeta(id, { status: 'error' });
        this.emit('error', { connectionId, meta: this.connectionMeta.get(id), error: err?.message ?? String(err) });
        throw err;
      });
  }

  send(connectionId, bytes) {
    const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
    const id = String(connectionId);
    return this.ensureBridge()
      .request('winsock:send', {
        connectionId,
        data: bytesToBase64(buffer),
      })
      .then((response) => {
        const meta = this.touchMeta(id, { bytesSent: buffer.length });
        this.emit('sent', { connectionId: id, byteLength: buffer.length, meta });
        return response;
      });
  }

  close(connectionId) {
    const id = String(connectionId);
    return this.ensureBridge()
      .request('winsock:close', { connectionId })
      .then((response) => {
        const meta = this.touchMeta(id, { status: 'closing' });
        this.emit('closing', { connectionId: id, meta });
        return response;
      });
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

  touchMeta(connectionId, delta = {}) {
    if (!connectionId) return null;
    const id = String(connectionId);
    const meta = this.connectionMeta.get(id) ?? {
      connectionId: id,
      host: undefined,
      port: undefined,
      openedAt: Date.now(),
      status: 'unknown',
      bytesReceived: 0,
      bytesSent: 0,
    };
    if (typeof delta.bytesReceived === 'number') {
      meta.bytesReceived += delta.bytesReceived;
    }
    if (typeof delta.bytesSent === 'number') {
      meta.bytesSent += delta.bytesSent;
    }
    if (delta.status) {
      meta.status = delta.status;
    }
    this.connectionMeta.set(id, meta);
    return meta;
  }
}
