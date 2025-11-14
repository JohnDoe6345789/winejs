import * as React from 'react';

const MAX_NETWORK_EVENTS = 60;
const MAX_DISK_EVENTS = 32;

export function useTelemetryState() {
  const [networkEvents, setNetworkEvents] = React.useState([]);
  const [diskEvents, setDiskEvents] = React.useState([]);

  const appendNetworkEvent = React.useCallback((event) => {
    if (!event) return;
    setNetworkEvents((prev) => {
      const entry = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        timestamp: Date.now(),
        ...event,
      };
      const next = [entry, ...prev];
      return next.slice(0, MAX_NETWORK_EVENTS);
    });
  }, []);

  const appendDiskEvent = React.useCallback((activity) => {
    if (!activity) return;
    setDiskEvents((prev) => {
      const entry = {
        id: `${activity.timestamp ?? Date.now()}-${Math.random().toString(16).slice(2)}`,
        timestamp: activity.timestamp ?? Date.now(),
        ...activity,
      };
      const next = [entry, ...prev];
      return next.slice(0, MAX_DISK_EVENTS);
    });
  }, []);

  const networkMetrics = React.useMemo(() => {
    let bytesSent = 0;
    let bytesReceived = 0;
    const activeConnections = new Set();
    networkEvents.forEach((entry) => {
      if (entry.type === 'sent') bytesSent += entry.byteLength ?? 0;
      if (entry.type === 'recv') bytesReceived += entry.byteLength ?? 0;
      const id = entry.connectionId ?? entry.meta?.connectionId;
      if (!id) return;
      if (entry.type === 'closed' || entry.type === 'error') {
        activeConnections.delete(id);
      } else if (['open', 'opening', 'sent', 'recv'].includes(entry.type)) {
        activeConnections.add(id);
      }
    });
    return { bytesSent, bytesReceived, activeConnections: activeConnections.size };
  }, [networkEvents]);

  const diskMetrics = React.useMemo(
    () =>
      diskEvents.reduce(
        (acc, event) => {
          if (event.type === 'read') {
            acc.reads += 1;
            acc.readBytes += event.bytes ?? 0;
          } else if (event.type === 'write') {
            acc.writes += 1;
            acc.writeBytes += event.bytes ?? 0;
          } else if (event.type === 'format') {
            acc.formats += 1;
          } else if (event.type === 'createFilesystem') {
            const label = event.label ?? acc.lastFilesystem ?? 'unknown filesystem';
            acc.lastFilesystem = event.driveLetter ? `${label} (${event.driveLetter})` : label;
          }
          return acc;
        },
        { reads: 0, readBytes: 0, writes: 0, writeBytes: 0, formats: 0, lastFilesystem: null },
      ),
    [diskEvents],
  );

  return {
    networkEvents,
    diskEvents,
    networkMetrics,
    diskMetrics,
    appendNetworkEvent,
    appendDiskEvent,
  };
}
