import * as React from 'react';

export function useDiskTelemetry({ wine, onDiskEvent }) {
  React.useEffect(() => {
    if (!wine) return undefined;
    const blockDevice = wine.getBlockDeviceClient?.();
    if (!blockDevice?.subscribe) return undefined;
    const unsubscribe = blockDevice.subscribe('activity', onDiskEvent);
    return () => {
      unsubscribe?.();
    };
  }, [wine, onDiskEvent]);
}
