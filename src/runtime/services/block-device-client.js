import { bytesToBase64, base64ToBytes } from '../utils/base64-buffer.js';

export class BlockDeviceClient {
  constructor({ bridge, log } = {}) {
    this.bridge = bridge ?? null;
    this.log = log ?? (() => {});
    this.blockSize = 4096;
    this.blockCount = 2048;
    this.initialized = false;
  }

  setBridge(bridge) {
    this.bridge = bridge ?? null;
    if (!bridge) {
      this.initialized = false;
    }
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
    return this.getGeometry();
  }

  async readBlock(blockIndex) {
    const payload = await this.ensureBridge().request('block:read', { blockIndex });
    if (!payload?.data) return new Uint8Array();
    return base64ToBytes(payload.data);
  }

  async writeBlock(blockIndex, bytes) {
    const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
    await this.ensureBridge().request('block:write', {
      blockIndex,
      data: bytesToBase64(buffer),
    });
  }

  async format(fill = 0) {
    await this.ensureBridge().request('block:format', { fill });
  }

  async createFilesystem({ label, fill = 0 } = {}) {
    const payload = await this.ensureBridge().request('block:createfs', { label, fill });
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
