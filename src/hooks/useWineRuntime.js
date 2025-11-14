import * as React from 'react';
import { WineJS } from '../runtime/wine-js.js';

export function useWineRuntime({
  pluginInstances,
  consoleRef,
  stringRef,
  canvasRef,
  statusRef,
  setStatusText,
  wineRef,
}) {
  const [wine, setWine] = React.useState(null);

  React.useEffect(() => {
    if (!consoleRef.current || !stringRef.current || !canvasRef.current || !statusRef.current) {
      return undefined;
    }
    const instance = new WineJS({
      consoleEl: consoleRef.current,
      stringEl: stringRef.current,
      canvasEl: canvasRef.current,
      statusEl: statusRef.current,
      plugins: pluginInstances.runtime,
      importPlugins: pluginInstances.import,
      simulatorPlugins: pluginInstances.simulator,
    });
    const defaultSetStatus = instance.setStatus.bind(instance);
    instance.setStatus = (text) => {
      setStatusText(text);
      defaultSetStatus(text);
    };
    wineRef.current = instance;
    setWine(instance);
    setStatusText('Load a `.exe` to inspect imports or render a mock window.');
    return () => {
      instance.disconnectBackend?.();
      if (wineRef.current === instance) {
        wineRef.current = null;
      }
    };
  }, [pluginInstances, consoleRef, stringRef, canvasRef, statusRef, setStatusText, wineRef]);

  return wine;
}
