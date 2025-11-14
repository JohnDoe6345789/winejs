let requestCounter = 0;

function ensureWebSocket() {
  if (typeof WebSocket === 'undefined') {
    throw new Error('WebSocket API unavailable in this environment.');
  }
  return WebSocket;
}

export class BackendBridge {
  constructor({ url, log } = {}) {
    this.url = url ?? '';
    this.log = log ?? (() => {});
    this.socket = null;
    this.pending = new Map();
    this.subscribers = new Map();
    this.connected = false;
  }

  async connect(url = this.url) {
    const TargetWebSocket = ensureWebSocket();
    if (!url) throw new Error('Backend URL is required to connect.');
    if (this.socket) {
      this.socket.close();
    }
    this.url = url;
    return new Promise((resolve, reject) => {
      const ws = new TargetWebSocket(url);
      const handleOpen = () => {
        ws.removeEventListener('error', handleError);
        this.socket = ws;
        this.connected = true;
        this.log?.(`[WineJS] Connected backend bridge ${url}`);
        ws.addEventListener('message', handleMessage);
        ws.addEventListener('close', handleClose);
        resolve();
      };
      const handleMessage = (event) => this.handleMessage(event);
      const handleClose = () => {
        ws.removeEventListener('message', handleMessage);
        ws.removeEventListener('close', handleClose);
        this.connected = false;
        if (this.socket === ws) {
          this.socket = null;
        }
        this.flushPending(new Error('Backend connection closed.'));
      };
      const handleError = (event) => {
        const message = event?.message ?? 'Failed to connect backend.';
        ws.removeEventListener('open', handleOpen);
        ws.removeEventListener('error', handleError);
        reject(new Error(message));
      };
      ws.addEventListener('open', handleOpen, { once: true });
      ws.addEventListener('error', handleError, { once: true });
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
    }
    this.connected = false;
    this.socket = null;
    this.flushPending(new Error('Backend disconnected.'));
  }

  isConnected() {
    return this.connected && this.socket?.readyState === this.socket?.OPEN;
  }

  flushPending(error) {
    const entries = Array.from(this.pending.values());
    this.pending.clear();
    entries.forEach((pending) => {
      clearTimeout(pending.timeoutId);
      pending.reject(error);
    });
  }

  request(action, payload, { timeout = 5000 } = {}) {
    if (!this.isConnected()) {
      return Promise.reject(new Error('Backend bridge not connected.'));
    }
    return new Promise((resolve, reject) => {
      const requestId = `${Date.now()}-${++requestCounter}`;
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Backend request ${action} timed out.`));
      }, timeout);
      this.pending.set(requestId, { resolve, reject, timeoutId: timer });
      const body = JSON.stringify({
        type: 'request',
        action,
        requestId,
        payload,
      });
      try {
        this.socket.send(body);
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(err);
      }
    });
  }

  handleMessage(event) {
    let message = null;
    try {
      message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    } catch (err) {
      this.log?.(`[WineJS] Failed to parse backend message: ${err?.message ?? err}`);
      return;
    }
    if (!message) return;
    if (message.type === 'response') {
      const pending = this.pending.get(message.requestId);
      if (!pending) return;
      this.pending.delete(message.requestId);
      clearTimeout(pending.timeoutId);
      if (message.ok) {
        pending.resolve(message.payload);
      } else {
        pending.reject(new Error(message.error ?? 'Backend request failed.'));
      }
      return;
    }
    if (message.type === 'event') {
      this.emit(message.event, message.payload);
    }
  }

  subscribe(event, handler) {
    if (!event || typeof handler !== 'function') return () => {};
    if (!this.subscribers.has(event)) this.subscribers.set(event, new Set());
    const set = this.subscribers.get(event);
    set.add(handler);
    return () => {
      set.delete(handler);
      if (!set.size) this.subscribers.delete(event);
    };
  }

  emit(event, payload) {
    const set = this.subscribers.get(event);
    if (!set) return;
    set.forEach((handler) => {
      try {
        handler(payload);
      } catch (err) {
        this.log?.(`[WineJS] Backend event handler error (${event}): ${err?.message ?? err}`);
      }
    });
  }
}
