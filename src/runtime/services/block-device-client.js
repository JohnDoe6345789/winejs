import { bytesToBase64, base64ToBytes } from '../utils/base64-buffer.js';

export class BlockDeviceClient {
  constructor({ bridge, log } = {}) {
    this.bridge = bridge ?? null;
    this.log = log ?? (() => {});
    this.blockSize = 4096;
    this.blockCount = 2048;
    this.driveCount = 1;
    this.primaryDrive = 'C';
    this.driveLetters = ['C'];
    this.driveMetadata = new Map([
      [
        'C',
        {
          letter: 'C',
          blockSize: this.blockSize,
          blockCount: this.blockCount,
        },
      ],
    ]);
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
      blockSize: payload.blockSize ?? this.blockSize,
      blockCount: payload.blockCount ?? this.blockCount,
      driveLetter: payload.driveLetter ?? this.primaryDrive,
      ...payload,
    });
  }

  getDriveLetters() {
    return [...this.driveLetters];
  }

  getGeometry(driveLetter = this.primaryDrive) {
    const letter = this.resolveDriveLetter(driveLetter);
    const drive = this.driveMetadata.get(letter) ?? {
      blockSize: this.blockSize,
      blockCount: this.blockCount,
    };
    return {
      blockSize: drive.blockSize,
      blockCount: drive.blockCount,
      driveLetter: letter,
      driveCount: this.driveCount,
      drives: this.getDriveLetters(),
    };
  }

  isReady() {
    return Boolean(this.bridge?.isConnected?.());
  }

  async configure(params = {}) {
    const response = await this.ensureBridge().request('block:init', {
      blockSize: params.blockSize ?? this.blockSize,
      blockCount: params.blockCount ?? this.blockCount,
      driveCount: params.driveCount ?? this.driveCount,
    });
    if (response?.blockSize) this.blockSize = response.blockSize;
    if (response?.blockCount) this.blockCount = response.blockCount;
    if (response?.driveCount) this.driveCount = response.driveCount;
    this.updateDriveMetadata(response?.drives, response?.primaryDrive);
    this.initialized = true;
    this.emitActivity('configure', {
      blockSize: this.blockSize,
      blockCount: this.blockCount,
      driveCount: this.driveCount,
      driveLetters: this.getDriveLetters(),
    });
    return {
      blockSize: this.blockSize,
      blockCount: this.blockCount,
      driveCount: this.driveCount,
      primaryDrive: this.primaryDrive,
      drives: this.getDriveLetters().map((letter) => this.driveMetadata.get(letter)),
    };
  }

  async readBlock(blockIndex, { driveLetter } = {}) {
    const letter = this.resolveDriveLetter(driveLetter);
    const payload = await this.ensureBridge().request('block:read', {
      blockIndex,
      driveLetter: letter,
    });
    if (!payload?.data) {
      this.emitActivity('read', { blockIndex, bytes: 0, driveLetter: letter });
      return new Uint8Array();
    }
    const buffer = base64ToBytes(payload.data);
    this.emitActivity('read', {
      blockIndex: payload?.blockIndex ?? blockIndex,
      bytes: buffer.length,
      driveLetter: payload?.driveLetter ?? letter,
    });
    return buffer;
  }

  async writeBlock(blockIndex, bytes, { driveLetter } = {}) {
    const letter = this.resolveDriveLetter(driveLetter);
    const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
    const payload = await this.ensureBridge().request('block:write', {
      blockIndex,
      data: bytesToBase64(buffer),
      driveLetter: letter,
    });
    this.emitActivity('write', {
      blockIndex: payload?.blockIndex ?? blockIndex,
      bytes: buffer.length,
      driveLetter: payload?.driveLetter ?? letter,
    });
  }

  async format(options = {}) {
    const normalized = typeof options === 'number' ? { fill: options } : options ?? {};
    const fill = normalized.fill ?? 0;
    const letter = this.resolveDriveLetter(normalized.driveLetter);
    const payload = await this.ensureBridge().request('block:format', { fill, driveLetter: letter });
    this.emitActivity('format', {
      fill,
      driveLetter: payload?.driveLetter ?? letter,
    });
  }

  async createFilesystem(options = {}) {
    const normalized =
      typeof options === 'string'
        ? { label: options }
        : options && typeof options === 'object'
          ? options
          : {};
    const letter = this.resolveDriveLetter(normalized.driveLetter);
    const fill = normalized.fill ?? 0;
    const label = normalized.label ?? 'WineJS';
    const payload = await this.ensureBridge().request('block:createfs', {
      label,
      fill,
      driveLetter: letter,
    });
    this.emitActivity('createFilesystem', {
      label: payload?.label ?? label,
      fill,
      driveLetter: payload?.driveLetter ?? letter,
    });
    return payload;
  }

  updateDriveMetadata(drives, preferredDrive) {
    this.driveMetadata.clear();
    if (Array.isArray(drives) && drives.length) {
      drives.forEach((drive) => {
        const letter = typeof drive?.letter === 'string' ? drive.letter.toUpperCase() : null;
        if (!letter) return;
        this.driveMetadata.set(letter, {
          letter,
          blockSize: drive.blockSize ?? this.blockSize,
          blockCount: drive.blockCount ?? this.blockCount,
        });
      });
      this.driveLetters = Array.from(this.driveMetadata.keys());
    } else {
      const fallback = (preferredDrive ?? this.primaryDrive ?? 'C').toUpperCase();
      this.driveMetadata.set(fallback, {
        letter: fallback,
        blockSize: this.blockSize,
        blockCount: this.blockCount,
      });
      this.driveLetters = [fallback];
    }
    const nextPrimary = preferredDrive?.toUpperCase();
    if (nextPrimary && this.driveMetadata.has(nextPrimary)) {
      this.primaryDrive = nextPrimary;
    } else if (this.driveLetters.length) {
      this.primaryDrive = this.driveLetters[0];
    }
  }

  resolveDriveLetter(letter) {
    const normalized = typeof letter === 'string' && letter.trim() ? letter.trim().toUpperCase() : null;
    if (normalized && this.driveMetadata.has(normalized)) {
      return normalized;
    }
    if (this.driveMetadata.has(this.primaryDrive)) {
      return this.primaryDrive;
    }
    const [first] = this.driveMetadata.keys();
    return first ?? 'C';
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
