import { bytesToBase64, base64ToBytes } from '../utils/base64-buffer.js';

export class BlockDeviceClient {
  constructor({ bridge, log } = {}) {
    this.bridge = bridge ?? null;
    this.log = log ?? (() => {});
    this.blockSize = 4096;
    this.blockCount = 2048;
    this.initialized = false;
    this.listeners = new Map();
  }

  setBridge(bridge) {
    this.bridge = bridge ?? null;
    if (!bridge) {
      this.initialized = false;
    }
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
        this.log?.(`[WineJS] Block device client listener error (${event}): ${err?.message ?? err}`);
      }
    });
  }

  emitActivity(type, payload = {}) {
    this.emit('activity', {
      type,
      timestamp: Date.now(),
      blockSize: this.blockSize,
      blockCount: this.blockCount,
      ...payload,
    });
  }

  getGeometry() {
    return { blockSize: this.blockSize, blockCount: this.blockCount };
  }

  isReady() {
    return Boolean(this.bridge?.isConnected?.());
  }

  async configure(params = {}) {
    const response = await this.ensureBridge().request('block:init', {
      blockSize: params.blockSize ?? this.blockSize,
      blockCount: params.blockCount ?? this.blockCount,
    });
    if (response?.blockSize) this.blockSize = response.blockSize;
    if (response?.blockCount) this.blockCount = response.blockCount;
    this.initialized = true;
    this.emitActivity('configure', {
      blockSize: this.blockSize,
      blockCount: this.blockCount,
    });
    return this.getGeometry();
  }

  async readBlock(blockIndex) {
    const payload = await this.ensureBridge().request('block:read', { blockIndex });
    if (!payload?.data) {
      this.emitActivity('read', { blockIndex, bytes: 0 });
      return new Uint8Array();
    }
    const buffer = base64ToBytes(payload.data);
    this.emitActivity('read', { blockIndex, bytes: buffer.length });
    return buffer;
  }

  async writeBlock(blockIndex, bytes) {
    const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
    await this.ensureBridge().request('block:write', {
      blockIndex,
      data: bytesToBase64(buffer),
    });
    this.emitActivity('write', { blockIndex, bytes: buffer.length });
  }

  async format(fill = 0) {
    await this.ensureBridge().request('block:format', { fill });
    this.emitActivity('format', { fill });
  }

  async createFilesystem({ label, fill = 0 } = {}) {
    const payload = await this.ensureBridge().request('block:createfs', { label, fill });
    this.emitActivity('createFilesystem', {
      label: payload?.label ?? label,
      fill,
    });
    return payload;
  }

  ensureBridge() {
    if (!this.bridge?.request) {
      throw new Error('Backend bridge not configured for block device client.');
    }
    if (!this.bridge.isConnected?.()) {
      throw new Error('Backend bridge disconnected.');
    }
    return this.bridge;
  }
}
