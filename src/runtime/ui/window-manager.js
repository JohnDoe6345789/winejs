export class WindowManager {
  constructor(canvasEl) {
    this.canvasEl = canvasEl;
    this.windows = new Map();
    this.messageQueue = [];
    this.nextHwnd = 1;
  }

  clear() {
    if (this.canvasEl) {
      this.canvasEl.innerHTML = '';
    }
    this.windows.clear();
    this.messageQueue = [];
    this.nextHwnd = 1;
  }

  createWindow(x, y, width, height, title) {
    if (!this.canvasEl) return 0;
    const hwnd = this.nextHwnd++;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.style.left = `${x}px`;
    canvas.style.top = `${y}px`;
    this.canvasEl.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    this.windows.set(hwnd, { canvas, ctx, width, height, title });
    return hwnd;
  }

  showWindow(hwnd) {
    this.pumpMessage(hwnd, 'WM_PAINT');
  }

  pumpMessage(hwnd, msg) {
    this.messageQueue.push({ hwnd, msg });
    this.processMessages();
  }

  processMessages() {
    while (this.messageQueue.length) {
      const { hwnd, msg } = this.messageQueue.shift();
      const win = this.windows.get(hwnd);
      if (!win || msg !== 'WM_PAINT') continue;
      const ctx = win.ctx;
      if (!ctx) continue;
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(0, 0, win.width, win.height);
      ctx.fillStyle = '#0f62fe';
      ctx.fillRect(0, 0, win.width, 32);
      ctx.fillStyle = '#fff';
      ctx.font = '16px "Segoe UI", sans-serif';
      ctx.fillText(win.title, 12, 22);
      ctx.strokeStyle = '#0d1b2a';
      ctx.strokeRect(0, 0, win.width, win.height);
      ctx.fillStyle = '#222';
      ctx.fillText('WM_PAINT dispatched by WineJS shim', 12, 56);
    }
  }
}
