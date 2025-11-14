import { createConsoleAPIPlugin } from '../runtime/plugins/console-api-plugin.js';
import { createDirectXWebGLPlugin } from '../runtime/plugins/directx-webgl-plugin.js';
import { createConsoleOutputImportPlugin } from '../runtime/import-plugins/console-output-plugin.js';
import { createWinsockWebSocketImportPlugin } from '../runtime/import-plugins/winsock-websocket-plugin.js';
import { createX86SimulatorPlugin } from '../runtime/simulator/plugins/x86-simulator-plugin.js';

export const pluginSections = [
  {
    type: 'runtime',
    title: 'Runtime Plugins',
    plugins: [
      {
        id: 'console-api',
        label: 'Console API Surface',
        description: 'Mirrors WriteConsole activity into the faux terminal output.',
        defaultEnabled: true,
        fields: [
          {
            key: 'linePrefix',
            label: 'Console prefix',
            type: 'text',
            default: '[WineJS]',
            helperText: 'Prepended to every WriteConsole line captured from the binary.',
          },
        ],
        factory: (settings) =>
          createConsoleAPIPlugin({
            linePrefix: settings.linePrefix || '[WineJS]',
          }),
      },
      {
        id: 'directx-webgl',
        label: 'DirectX WebGL Mirror',
        description: 'Streams DirectX GUI intent into a glowing WebGL canvas.',
        defaultEnabled: true,
        fields: [
          {
            key: 'antialias',
            label: 'WebGL antialiasing',
            type: 'boolean',
            default: true,
          },
          {
            key: 'preserveDrawingBuffer',
            label: 'Preserve drawing buffer',
            type: 'boolean',
            default: false,
          },
        ],
        factory: (settings) =>
          createDirectXWebGLPlugin({
            contextAttributes: {
              antialias: Boolean(settings.antialias),
              preserveDrawingBuffer: Boolean(settings.preserveDrawingBuffer),
            },
          }),
      },
    ],
  },
  {
    type: 'import',
    title: 'Import Plugins',
    plugins: [
      {
        id: 'console-output',
        label: 'Console Import Hooks',
        description: 'Intercepts WriteConsole + MessageBox imports to flag console intent.',
        defaultEnabled: true,
        fields: [
          {
            key: 'logMessageBoxes',
            label: 'Log MessageBox payloads',
            type: 'boolean',
            default: true,
          },
          {
            key: 'guiKeywords',
            label: 'GUI detection keywords',
            type: 'text',
            default: 'createwindow,dialogbox,registerclass',
            helperText: 'Comma separated tokens that mark GUI-oriented APIs.',
          },
        ],
        factory: (settings) =>
          createConsoleOutputImportPlugin({
            logMessageBoxes: Boolean(settings.logMessageBoxes),
            guiKeywords: String(settings.guiKeywords || '')
              .split(',')
              .map((token) => token.trim())
              .filter(Boolean),
          }),
      },
      {
        id: 'winsock-websocket',
        label: 'Winsock WebSocket Tunnel',
        description: 'Tunnels winsock sockets through the backend WebSocket bridge.',
        defaultEnabled: true,
        fields: [
          {
            key: 'logTraffic',
            label: 'Log socket activity',
            type: 'boolean',
            default: false,
          },
          {
            key: 'autoConnect',
            label: 'Auto-connect remote sockets',
            type: 'boolean',
            default: true,
          },
        ],
        factory: (settings, helpers) =>
          createWinsockWebSocketImportPlugin({
            getWinsockBridge: () => helpers.getWine?.()?.getWinsockBridge(),
            log: (message) => helpers.log?.(message),
            logTraffic: Boolean(settings.logTraffic),
            autoConnect: Boolean(settings.autoConnect),
          }),
      },
    ],
  },
  {
    type: 'simulator',
    title: 'Simulator Plugins',
    plugins: [
      {
        id: 'x86-simulator',
        label: 'x86 Simulator Bridge',
        description: 'Loads the x86 simulator exported on window.WineX86.',
        defaultEnabled: true,
        fields: [
          {
            key: 'globalKey',
            label: 'Global bridge key',
            type: 'text',
            default: 'WineX86',
            helperText: 'What global object exposes X86Simulator (defaults to window.WineX86).',
          },
        ],
        factory: (settings) =>
          createX86SimulatorPlugin({
            globalKey: settings.globalKey || 'WineX86',
          }),
      },
    ],
  },
];

export function createInitialPluginState() {
  return pluginSections.reduce((state, section) => {
    if (!state[section.type]) state[section.type] = {};
    section.plugins.forEach((plugin) => {
      const settings = {};
      plugin.fields?.forEach((field) => {
        settings[field.key] = field.default;
      });
      state[section.type][plugin.id] = {
        enabled: plugin.defaultEnabled !== false,
        settings,
      };
    });
    return state;
  }, {});
}

export function buildPluginInstances(state, helpers = {}) {
  return pluginSections.reduce(
    (acc, section) => {
      const typeState = state?.[section.type] ?? {};
      section.plugins.forEach((plugin) => {
        const pluginState = typeState[plugin.id];
        if (!pluginState?.enabled) return;
        const instance = plugin.factory?.(pluginState.settings ?? {}, helpers) ?? null;
        if (!instance) return;
        if (section.type === 'runtime') acc.runtime.push(instance);
        if (section.type === 'import') acc.import.push(instance);
        if (section.type === 'simulator') acc.simulator.push(instance);
      });
      return acc;
    },
    { runtime: [], import: [], simulator: [] },
  );
}
