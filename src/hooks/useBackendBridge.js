import * as React from 'react';

const parsePositive = (value, fallback) => {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : fallback;
};

export function useBackendBridge(wine) {
  const [backendUrl, setBackendUrl] = React.useState('ws://localhost:8089');
  const [blockSize, setBlockSize] = React.useState(4096);
  const [blockCount, setBlockCount] = React.useState(2048);
  const [driveCount, setDriveCount] = React.useState(1);
  const [driveLetters, setDriveLetters] = React.useState(['C']);
  const [selectedDrive, setSelectedDrive] = React.useState('C');
  const [filesystemLabel, setFilesystemLabel] = React.useState('WineJS');
  const [backendStatus, setBackendStatus] = React.useState('Backend disconnected.');
  const [backendLog, setBackendLog] = React.useState([]);

  const appendBackendLog = React.useCallback((message) => {
    if (!message) return;
    setBackendLog((prev) => {
      const entry = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        message,
        timestamp: new Date().toLocaleTimeString(),
      };
      const next = [...prev, entry];
      return next.slice(-200);
    });
  }, []);

  const connectBackend = React.useCallback(async () => {
    if (!wine) return;
    const target = backendUrl.trim();
    if (!target) {
      setBackendStatus('Backend URL is required.');
      return;
    }
    setBackendStatus(`Connecting to ${target}…`);
    try {
      await wine.connectBackend(target);
      const geometry = await wine.getBlockDeviceClient().configure({
        blockSize: parsePositive(blockSize, 4096),
        blockCount: parsePositive(blockCount, 2048),
        driveCount: parsePositive(driveCount, 1),
      });
      const drives = geometry?.drives?.map((drive) => drive?.letter).filter(Boolean) ?? ['C'];
      setDriveLetters(drives);
      setDriveCount(geometry?.driveCount ?? drives.length ?? 1);
      const primary = geometry?.primaryDrive ?? drives[0] ?? 'C';
      setSelectedDrive(primary);
      setBackendStatus(
        `Connected: ${geometry.blockSize.toLocaleString()} bytes × ${geometry.blockCount.toLocaleString()} blocks · ${
          drives.length
        } drive(s) (${drives.join(', ')})`,
      );
      appendBackendLog(`Backend connected at ${target}`);
    } catch (err) {
      const message = err?.message ?? err;
      setBackendStatus(`Backend connection failed: ${message}`);
      appendBackendLog(`Backend error: ${message}`);
    }
  }, [wine, backendUrl, blockSize, blockCount, driveCount, appendBackendLog]);

  const disconnectBackend = React.useCallback(() => {
    wine?.disconnectBackend?.();
    setBackendStatus('Backend disconnected.');
    setDriveLetters(['C']);
    setDriveCount(1);
    setSelectedDrive('C');
    appendBackendLog('Backend disconnected.');
  }, [wine, appendBackendLog]);

  const formatDevice = React.useCallback(async () => {
    if (!wine) return;
    try {
      await wine.getBlockDeviceClient().format({ driveLetter: selectedDrive });
      appendBackendLog(`Drive ${selectedDrive} formatted to zeros.`);
      setBackendStatus(`Drive ${selectedDrive} formatted.`);
    } catch (err) {
      const message = err?.message ?? err;
      setBackendStatus(`Format failed: ${message}`);
      appendBackendLog(`Format error: ${message}`);
    }
  }, [wine, selectedDrive, appendBackendLog]);

  const createFilesystem = React.useCallback(async () => {
    if (!wine) return;
    try {
      const meta = await wine
        .getBlockDeviceClient()
        .createFilesystem({ label: filesystemLabel || 'WineJS', driveLetter: selectedDrive });
      appendBackendLog(
        `Filesystem ${meta.label} created on ${meta.driveLetter ?? selectedDrive} at ${meta.createdAt ?? 'unknown time'}.`,
      );
      setBackendStatus(`Filesystem ${meta.label} created on drive ${meta.driveLetter ?? selectedDrive}.`);
    } catch (err) {
      const message = err?.message ?? err;
      setBackendStatus(`Filesystem creation failed: ${message}`);
      appendBackendLog(`Filesystem error: ${message}`);
    }
  }, [wine, filesystemLabel, selectedDrive, appendBackendLog]);

  const handleBackendUrlChange = React.useCallback((event) => setBackendUrl(event.target.value), []);
  const handleBlockSizeChange = React.useCallback((event) => setBlockSize(event.target.value), []);
  const handleBlockCountChange = React.useCallback((event) => setBlockCount(event.target.value), []);
  const handleDriveCountChange = React.useCallback((event) => setDriveCount(event.target.value), []);
  const handleFilesystemLabelChange = React.useCallback((event) => setFilesystemLabel(event.target.value), []);
  const handleSelectedDriveChange = React.useCallback((event) => setSelectedDrive(event.target.value), []);

  return {
    backendUrl,
    blockSize,
    blockCount,
    driveCount,
    driveLetters,
    selectedDrive,
    filesystemLabel,
    backendStatus,
    backendLog,
    connectBackend,
    disconnectBackend,
    formatDevice,
    createFilesystem,
    appendBackendLog,
    handleBackendUrlChange,
    handleBlockSizeChange,
    handleBlockCountChange,
    handleDriveCountChange,
    handleFilesystemLabelChange,
    handleSelectedDriveChange,
  };
}
