export function createConsoleAPIPlugin({ linePrefix = '[WineJS]' } = {}) {
  const prefix = linePrefix?.trim() ? linePrefix.trim() : '[WineJS]';
  return {
    id: 'console-api',
    onInit({ wine }) {
      wine.registerAPI('WriteConsole', (text) => {
        if (!text) return;
        text.split(/\r?\n/).forEach((line) => {
          if (!line.trim()) return;
          wine.log(`${prefix} ${line.trim()}`);
        });
      });
    },
  };
}
