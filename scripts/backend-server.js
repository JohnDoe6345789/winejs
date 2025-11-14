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

function clampNumber(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const clamped = Math.min(Math.max(num, min), max);
  return Math.trunc(clamped);
}

class BlockDeviceStore {
  constructor({ filePath = DEFAULT_BLOCK_PATH, blockSize = 4096, blockCount = 2048 } = {}) {
    this.filePath = filePath;
    this.metaPath = `${filePath}.meta.json`;
    this.blockSize = blockSize;
    this.blockCount = blockCount;
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
    };
    fs.writeFileSync(this.metaPath, JSON.stringify(meta, null, 2));
    return meta;
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

const blockStore = new BlockDeviceStore({});

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
        const { blockSize, blockCount } = blockStore.configure(payload ?? {});
        sendResponse(ws, { action, requestId, ok: true, payload: { blockSize, blockCount } });
        break;
      }
      case 'block:read': {
        const index = clampNumber(payload?.blockIndex, 0, { min: 0, max: blockStore.blockCount - 1 });
        const buffer = blockStore.readBlock(index);
        sendResponse(ws, {
          action,
          requestId,
          ok: true,
          payload: { blockIndex: index, data: buffer.toString('base64') },
        });
        break;
      }
      case 'block:write': {
        if (!payload) throw new Error('Missing payload for block:write');
        const index = clampNumber(payload.blockIndex, 0, { min: 0, max: blockStore.blockCount - 1 });
        const data = Buffer.from(payload.data ?? '', 'base64');
        blockStore.writeBlock(index, data);
        sendResponse(ws, {
          action,
          requestId,
          ok: true,
          payload: { blockIndex: index },
        });
        break;
      }
      case 'block:format': {
        const fill = clampNumber(payload?.fill ?? 0, 0, { min: 0, max: 255 });
        blockStore.format(fill);
        sendResponse(ws, { action, requestId, ok: true });
        break;
      }
      case 'block:createfs': {
        const label = String(payload?.label ?? 'WineJS');
        const fill = clampNumber(payload?.fill ?? 0, 0, { min: 0, max: 255 });
        const meta = blockStore.createFilesystem({ label, fill });
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
    console.log(`[WineJS] Block device ${blockStore.blockSize} bytes × ${blockStore.blockCount} blocks`);
  });
}

if (import.meta.url === `file://${__filename}`) {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  startServer(port);
}

export { startServer, BlockDeviceStore, WinsockBroker };
