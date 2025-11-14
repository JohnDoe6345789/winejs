const unitLabels = ['B', 'KB', 'MB', 'GB', 'TB'];

export const formatFileSize = (bytes = 0) => `${(bytes / 1024).toFixed(1)} KB`;

export const formatBytes = (bytes = 0) => {
  if (!bytes) return '0 B';
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < unitLabels.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const decimals = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(decimals)} ${unitLabels[unitIndex]}`;
};

export const formatTimestamp = (input) => {
  if (!input) return new Date().toLocaleTimeString();
  const date = typeof input === 'number' ? new Date(input) : new Date(input);
  return date.toLocaleTimeString();
};

export const formatConnectionLabel = (payload = {}) => {
  const connectionId = payload?.connectionId ?? payload?.meta?.connectionId ?? 'socket';
  const host = payload?.meta?.host ?? payload?.host;
  const port = payload?.meta?.port ?? payload?.port;
  return host ? `${connectionId} (${host}:${port ?? '?'})` : connectionId;
};

export const describeDiskActivity = (activity = {}) => {
  const bytes = activity.bytes ?? 0;
  const blockIndex = activity.blockIndex ?? '—';
  const drivePrefix = activity.driveLetter ? `Drive ${activity.driveLetter}: ` : '';
  if (activity.type === 'read') {
    return `${drivePrefix}Read block ${blockIndex} (${formatBytes(bytes)})`;
  }
  if (activity.type === 'write') {
    return `${drivePrefix}Wrote block ${blockIndex} (${formatBytes(bytes)})`;
  }
  if (activity.type === 'format') {
    const fillText = activity.fill ? `(fill ${activity.fill})` : '';
    return `${drivePrefix}Formatted block device ${fillText}`.trim();
  }
  if (activity.type === 'createFilesystem') {
    return `${drivePrefix}Created filesystem ${activity.label ?? 'unknown label'}`;
  }
  if (activity.type === 'configure') {
    const size = Number(activity.blockSize ?? 0).toLocaleString();
    const count = Number(activity.blockCount ?? 0).toLocaleString();
    const drives = activity.driveLetters?.length ? ` • Drives: ${activity.driveLetters.join(', ')}` : '';
    return `Configured ${size} B × ${count} blocks${drives}`;
  }
  return 'Disk activity recorded';
};
