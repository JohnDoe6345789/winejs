import * as React from 'react';
import { createInitialPluginState, buildPluginInstances } from '../config/pluginPresets.js';

export function usePluginManager(wineRef) {
  const [pluginState, setPluginState] = React.useState(() => createInitialPluginState());

  const pluginInstances = React.useMemo(
    () =>
      buildPluginInstances(pluginState, {
        getWine: () => wineRef.current,
        log: (message) => wineRef.current?.log?.(message),
      }),
    [pluginState, wineRef],
  );

  const handlePluginToggle = React.useCallback((sectionType, pluginId, enabled) => {
    setPluginState((prev) => ({
      ...prev,
      [sectionType]: {
        ...prev[sectionType],
        [pluginId]: {
          ...prev[sectionType]?.[pluginId],
          enabled,
        },
      },
    }));
  }, []);

  const handlePluginSettingChange = React.useCallback((sectionType, pluginId, fieldKey, value) => {
    setPluginState((prev) => ({
      ...prev,
      [sectionType]: {
        ...prev[sectionType],
        [pluginId]: {
          ...prev[sectionType]?.[pluginId],
          settings: {
            ...prev[sectionType]?.[pluginId]?.settings,
            [fieldKey]: value,
          },
        },
      },
    }));
  }, []);

  return {
    pluginState,
    pluginInstances,
    handlePluginToggle,
    handlePluginSettingChange,
  };
}
