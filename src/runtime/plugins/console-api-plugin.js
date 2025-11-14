export function createConsoleAPIPlugin() {
  return {
    id: 'console-api',
    onInit({ wine }) {
      wine.registerAPI('WriteConsole', (text) => {
        if (!text) return;
        text.split(/\r?\n/).forEach((line) => {
          if (line.trim()) wine.log(`[WineJS] ${line.trim()}`);
        });
      });
    },
  };
}
