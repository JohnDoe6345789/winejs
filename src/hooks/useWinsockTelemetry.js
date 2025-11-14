import * as React from 'react';
import { formatBytes, formatConnectionLabel } from '../utils/formatters.js';

export function useWinsockTelemetry({ wine, onBackendLog, onNetworkEvent }) {
  React.useEffect(() => {
    if (!wine) return undefined;
    const winsock = wine.getWinsockBridge?.();
    if (!winsock?.subscribe) return undefined;
    const unsubOpen = winsock.subscribe('open', (payload) =>
      onBackendLog?.(`Winsock socket ${formatConnectionLabel(payload)} opened.`),
    );
    const unsubData = winsock.subscribe('data', ({ connectionId, byteLength }) =>
      onBackendLog?.(`Winsock socket ${connectionId} received ${formatBytes(byteLength ?? 0)} of buffered data.`),
    );
    const unsubClosed = winsock.subscribe('closed', (payload) =>
      onBackendLog?.(`Winsock socket ${formatConnectionLabel(payload)} closed.`),
    );
    const unsubError = winsock.subscribe('error', (payload = {}) =>
      onBackendLog?.(
        `Winsock socket ${formatConnectionLabel(payload)} error: ${payload?.error ?? payload?.message ?? 'unknown issue'}`,
      ),
    );
    return () => {
      unsubOpen?.();
      unsubData?.();
      unsubClosed?.();
      unsubError?.();
    };
  }, [wine, onBackendLog]);

  React.useEffect(() => {
    if (!wine) return undefined;
    const winsock = wine.getWinsockBridge?.();
    if (!winsock?.subscribe) return undefined;
    const unsubOpening = winsock.subscribe('opening', ({ meta }) =>
      onNetworkEvent?.({
        type: 'opening',
        connectionId: meta?.connectionId,
        meta,
        direction: 'out',
        message: meta?.host ? `Dialing ${meta.host}:${meta.port}` : 'Opening socket',
      }),
    );
    const unsubOpen = winsock.subscribe('open', (payload = {}) =>
      onNetworkEvent?.({
        type: 'open',
        connectionId: payload.connectionId ?? payload.meta?.connectionId,
        meta: payload.meta,
        direction: 'out',
        message: `Socket ${formatConnectionLabel(payload)} ready`,
      }),
    );
    const unsubRecv = winsock.subscribe('data', ({ connectionId, byteLength, meta }) =>
      onNetworkEvent?.({
        type: 'recv',
        connectionId,
        byteLength,
        meta,
        direction: 'in',
        message: `Received ${formatBytes(byteLength ?? 0)}`,
      }),
    );
    const unsubSent = winsock.subscribe('sent', ({ connectionId, byteLength, meta }) =>
      onNetworkEvent?.({
        type: 'sent',
        connectionId,
        byteLength,
        meta,
        direction: 'out',
        message: `Sent ${formatBytes(byteLength ?? 0)}`,
      }),
    );
    const unsubClosed = winsock.subscribe('closed', (payload = {}) =>
      onNetworkEvent?.({
        type: 'closed',
        connectionId: payload.connectionId ?? payload.meta?.connectionId,
        meta: payload.meta,
        direction: 'out',
        message: `Socket ${formatConnectionLabel(payload)} closed`,
      }),
    );
    const unsubError = winsock.subscribe('error', (payload = {}) =>
      onNetworkEvent?.({
        type: 'error',
        connectionId: payload.connectionId ?? payload.meta?.connectionId,
        meta: payload.meta,
        direction: null,
        message: `Socket error: ${payload?.error ?? payload?.message ?? 'unknown issue'}`,
      }),
    );
    return () => {
      unsubOpening?.();
      unsubOpen?.();
      unsubRecv?.();
      unsubSent?.();
      unsubClosed?.();
      unsubError?.();
    };
  }, [wine, onNetworkEvent]);
}
