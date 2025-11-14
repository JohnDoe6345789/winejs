#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import http from 'http';
import net from 'net';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_PORT = Number(process.env.WINEJS_BACKEND_PORT ?? 8089);
const DEFAULT_BLOCK_PATH =
  process.env.WINEJS_BLOCK_PATH ?? path.resolve(__dirname, '../build/winejs-block-device.bin');
const DRIVE_SEQUENCE = [
  ...'CDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  'A',
  'B',
];

function clampNumber(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const clamped = Math.min(Math.max(num, min), max);
  return Math.trunc(clamped);
}

class BlockDeviceStore {
  constructor({ filePath = DEFAULT_BLOCK_PATH, blockSize = 4096, blockCount = 2048, driveLetter = 'C' } = {}) {
    this.filePath = filePath;
    this.metaPath = `${filePath}.meta.json`;
    this.blockSize = blockSize;
    this.blockCount = blockCount;
    this.driveLetter = driveLetter;
    this.ensureDirectory();
    this.ensureSize();
  }

  ensureDirectory() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
  }

  configure({ blockSize, blockCount }) {
    const nextSize = clampNumber(blockSize, this.blockSize, { min: 512, max: 1 << 20 });
    const nextCount = clampNumber(blockCount, this.blockCount, { min: 8, max: 1 << 20 });
    if (nextSize === this.blockSize && nextCount === this.blockCount) {
      return { blockSize: this.blockSize, blockCount: this.blockCount };
    }
    this.blockSize = nextSize;
    this.blockCount = nextCount;
    this.ensureSize();
    return { blockSize: this.blockSize, blockCount: this.blockCount };
  }

  ensureSize() {
    const expected = BigInt(this.blockSize) * BigInt(this.blockCount);
    let current = 0n;
    try {
      const stats = fs.statSync(this.filePath);
      current = BigInt(stats.size);
    } catch (err) {
      current = 0n;
    }
    if (current === expected) {
      return;
    }
    const fd = fs.openSync(this.filePath, 'w');
    const chunk = Buffer.alloc(1024, 0);
    let remaining = expected;
    while (remaining > 0n) {
      const toWrite = remaining > BigInt(chunk.length) ? chunk.length : Number(remaining);
      fs.writeSync(fd, chunk.subarray(0, toWrite));
      remaining -= BigInt(toWrite);
    }
    fs.closeSync(fd);
  }

  validateIndex(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.blockCount) {
      throw new Error(`Block index ${index} outside of 0-${this.blockCount - 1}`);
    }
  }

  readBlock(index) {
    this.validateIndex(index);
    const fd = fs.openSync(this.filePath, 'r');
    const buffer = Buffer.alloc(this.blockSize);
    fs.readSync(fd, buffer, 0, this.blockSize, index * this.blockSize);
    fs.closeSync(fd);
    return buffer;
  }

  writeBlock(index, data) {
    this.validateIndex(index);
    const fd = fs.openSync(this.filePath, 'r+');
    let buffer = data;
    if (buffer.length !== this.blockSize) {
      const padded = Buffer.alloc(this.blockSize, 0);
      buffer.copy(padded, 0, 0, Math.min(buffer.length, this.blockSize));
      buffer = padded;
    }
    fs.writeSync(fd, buffer, 0, this.blockSize, index * this.blockSize);
    fs.closeSync(fd);
  }

  format(fill = 0) {
    const fd = fs.openSync(this.filePath, 'w');
    const pattern = Buffer.alloc(this.blockSize, fill & 0xff);
    for (let i = 0; i < this.blockCount; i++) {
      fs.writeSync(fd, pattern);
    }
    fs.closeSync(fd);
  }

  createFilesystem({ label = 'WineJS', fill = 0 } = {}) {
    this.format(fill);
    const meta = {
      label,
      blockSize: this.blockSize,
      blockCount: this.blockCount,
      createdAt: new Date().toISOString(),
      driveLetter: this.driveLetter,
    };
    fs.writeFileSync(this.metaPath, JSON.stringify(meta, null, 2));
    return meta;
  }
}

class BlockDeviceFleet {
  constructor({ filePath = DEFAULT_BLOCK_PATH, blockSize = 4096, blockCount = 2048, driveCount = 1 } = {}) {
    this.basePath = filePath;
    this.blockSize = clampNumber(blockSize, 4096, { min: 512, max: 1 << 20 });
    this.blockCount = clampNumber(blockCount, 2048, { min: 8, max: 1 << 20 });
    this.driveCount = clampNumber(driveCount ?? 1, 1, { min: 1, max: DRIVE_SEQUENCE.length });
    this.drives = new Map();
    this.ensureDrives();
  }

  getDriveLetters() {
    return DRIVE_SEQUENCE.slice(0, this.driveCount);
  }

  getPrimaryDriveLetter() {
    if (this.drives.has('C')) return 'C';
    const letters = this.getDriveLetters();
    if (!letters.length) {
      throw new Error('No block devices configured.');
    }
    return letters[0];
  }

  buildDrivePath(letter) {
    if (!letter || letter === 'C') {
      return this.basePath;
    }
    const ext = path.extname(this.basePath);
    const dir = path.dirname(this.basePath);
    const baseName = ext ? path.basename(this.basePath, ext) : path.basename(this.basePath);
    const suffix = ext || '.bin';
    return path.join(dir, `${baseName}-${letter}${suffix}`);
  }

  ensureDrives() {
    const activeLetters = this.getDriveLetters();
    activeLetters.forEach((letter) => {
      if (!this.drives.has(letter)) {
        const store = new BlockDeviceStore({
          filePath: this.buildDrivePath(letter),
          blockSize: this.blockSize,
          blockCount: this.blockCount,
          driveLetter: letter,
        });
        this.drives.set(letter, store);
      } else {
        const store = this.drives.get(letter);
        store.configure({ blockSize: this.blockSize, blockCount: this.blockCount });
      }
    });
    Array.from(this.drives.keys()).forEach((letter) => {
      if (!activeLetters.includes(letter)) {
        this.drives.delete(letter);
      }
    });
  }

  configure({ blockSize, blockCount, driveCount } = {}) {
    this.blockSize = clampNumber(blockSize ?? this.blockSize, this.blockSize, { min: 512, max: 1 << 20 });
    this.blockCount = clampNumber(blockCount ?? this.blockCount, this.blockCount, { min: 8, max: 1 << 20 });
    this.driveCount = clampNumber(driveCount ?? this.driveCount, this.driveCount, {
      min: 1,
      max: DRIVE_SEQUENCE.length,
    });
    this.ensureDrives();
    return this.getMetadata();
  }

  getMetadata() {
    const drives = this.getDriveLetters().map((letter) => {
      const store = this.drives.get(letter);
      return {
        letter,
        blockSize: store.blockSize,
        blockCount: store.blockCount,
        filePath: store.filePath,
      };
    });
    return {
      blockSize: this.blockSize,
      blockCount: this.blockCount,
      driveCount: this.driveCount,
      drives,
      primaryDrive: this.getPrimaryDriveLetter(),
    };
  }

  resolveDrive(letter) {
    const normalized = typeof letter === 'string' && letter.trim() ? letter.trim().toUpperCase() : null;
    const target = normalized && this.drives.has(normalized) ? normalized : this.getPrimaryDriveLetter();
    const store = this.drives.get(target);
    if (!store) {
      throw new Error(`Block device ${target} unavailable.`);
    }
    return { store, letter: target };
  }

  readBlock({ driveLetter, blockIndex } = {}) {
    const { store, letter } = this.resolveDrive(driveLetter);
    const index = clampNumber(blockIndex, 0, { min: 0, max: store.blockCount - 1 });
    const buffer = store.readBlock(index);
    return { buffer, blockIndex: index, driveLetter: letter };
  }

  writeBlock({ driveLetter, blockIndex, data } = {}) {
    const { store, letter } = this.resolveDrive(driveLetter);
    const index = clampNumber(blockIndex, 0, { min: 0, max: store.blockCount - 1 });
    store.writeBlock(index, data ?? Buffer.alloc(0));
    return { blockIndex: index, driveLetter: letter };
  }

  formatDrive({ driveLetter, fill = 0 } = {}) {
    const { store, letter } = this.resolveDrive(driveLetter);
    store.format(fill);
    return { driveLetter: letter, fill };
  }

  createFilesystem({ driveLetter, label, fill = 0 } = {}) {
    const { store, letter } = this.resolveDrive(driveLetter);
    const meta = store.createFilesystem({ label, fill });
    return { ...meta, driveLetter: letter };
  }
}

class WinsockBroker {
  constructor({ notifyEvent }) {
    this.notifyEvent = notifyEvent;
    this.connections = new Map();
  }

  openConnection({ connectionId, host, port }) {
    if (!host || !port) {
      throw new Error('Missing host or port for winsock:open');
    }
    const id = String(connectionId);
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host, port: Number(port) });
      let settled = false;

      socket.once('connect', () => {
        settled = true;
        this.connections.set(id, socket);
        this.notifyEvent('winsock:open', { connectionId: id });
        resolve();
      });

      socket.on('data', (chunk) => {
        this.notifyEvent('winsock:data', { connectionId: id, data: chunk.toString('base64') });
      });
      socket.on('close', () => {
        this.notifyEvent('winsock:closed', { connectionId: id });
        this.connections.delete(id);
      });
      socket.on('error', (err) => {
        this.notifyEvent('winsock:error', { connectionId: id, message: err.message });
        this.connections.delete(id);
        if (!settled) {
          settled = true;
          reject(err);
        }
      });
    });
  }

  sendData({ connectionId, data }) {
    const socket = this.connections.get(String(connectionId));
    if (!socket) {
      throw new Error(`Unknown winsock connection ${connectionId}`);
    }
    const buffer = Buffer.from(data, 'base64');
    socket.write(buffer);
  }

  closeConnection(connectionId) {
    const socket = this.connections.get(String(connectionId));
    if (socket) {
      socket.destroy();
      this.connections.delete(String(connectionId));
    }
  }

  dispose() {
    for (const socket of this.connections.values()) {
      socket.destroy();
    }
    this.connections.clear();
  }
}

const blockFleet = new BlockDeviceFleet({});

function sendResponse(ws, { action, requestId, ok, payload, error }) {
  const message = {
    type: 'response',
    action,
    requestId,
    ok,
  };
  if (payload !== undefined) message.payload = payload;
  if (error) message.error = error?.message ?? String(error);
  ws.send(JSON.stringify(message));
}

function sendEvent(ws, event, payload) {
  ws.send(JSON.stringify({ type: 'event', event, payload }));
}

async function handleAction(ws, broker, { action, payload, requestId }) {
  try {
    switch (action) {
      case 'block:init': {
        const geometry = blockFleet.configure(payload ?? {});
        sendResponse(ws, { action, requestId, ok: true, payload: geometry });
        break;
      }
      case 'block:read': {
        const result = blockFleet.readBlock(payload ?? {});
        sendResponse(ws, {
          action,
          requestId,
          ok: true,
          payload: {
            blockIndex: result.blockIndex,
            driveLetter: result.driveLetter,
            data: result.buffer.toString('base64'),
          },
        });
        break;
      }
      case 'block:write': {
        if (!payload) throw new Error('Missing payload for block:write');
        const data = Buffer.from(payload.data ?? '', 'base64');
        const result = blockFleet.writeBlock({ ...payload, data });
        sendResponse(ws, {
          action,
          requestId,
          ok: true,
          payload: { blockIndex: result.blockIndex, driveLetter: result.driveLetter },
        });
        break;
      }
      case 'block:format': {
        const fill = clampNumber(payload?.fill ?? 0, 0, { min: 0, max: 255 });
        const result = blockFleet.formatDrive({ driveLetter: payload?.driveLetter ?? payload?.drive, fill });
        sendResponse(ws, { action, requestId, ok: true, payload: result });
        break;
      }
      case 'block:createfs': {
        const label = String(payload?.label ?? 'WineJS');
        const fill = clampNumber(payload?.fill ?? 0, 0, { min: 0, max: 255 });
        const meta = blockFleet.createFilesystem({
          driveLetter: payload?.driveLetter ?? payload?.drive,
          label,
          fill,
        });
        sendResponse(ws, { action, requestId, ok: true, payload: meta });
        break;
      }
      case 'winsock:open': {
        await broker.openConnection(payload ?? {});
        sendResponse(ws, { action, requestId, ok: true });
        break;
      }
      case 'winsock:send': {
        broker.sendData(payload ?? {});
        sendResponse(ws, { action, requestId, ok: true });
        break;
      }
      case 'winsock:close': {
        broker.closeConnection(payload?.connectionId);
        sendResponse(ws, { action, requestId, ok: true });
        break;
      }
      default:
        throw new Error(`Unknown action ${action}`);
    }
  } catch (err) {
    sendResponse(ws, { action, requestId, ok: false, error: err });
  }
}

function startServer(port = DEFAULT_PORT) {
  const httpServer = http.createServer();
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws) => {
    const broker = new WinsockBroker({
      notifyEvent: (event, payload) => sendEvent(ws, event, payload),
    });
    ws.on('message', (raw) => {
      let data;
      try {
        data = JSON.parse(raw.toString());
      } catch (err) {
        sendResponse(ws, { action: 'parse', requestId: null, ok: false, error: err });
        return;
      }
      if (data?.type !== 'request') {
        return;
      }
      handleAction(ws, broker, data);
    });
    ws.on('close', () => {
      broker.dispose();
    });
  });

  httpServer.listen(port, () => {
    console.log(`[WineJS] Backend listening on ws://localhost:${port}`);
    console.log(
      `[WineJS] Block devices ${blockFleet.blockSize} bytes × ${blockFleet.blockCount} blocks across ${blockFleet.driveCount} drive(s): ${blockFleet
        .getDriveLetters()
        .join(', ')}`,
    );
  });
}

if (import.meta.url === `file://${__filename}`) {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  startServer(port);
}

export { startServer, BlockDeviceStore, BlockDeviceFleet, WinsockBroker };
