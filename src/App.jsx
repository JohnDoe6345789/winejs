import * as React from 'react';
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  AppBar,
  Toolbar,
  Typography,
  Container,
  Box,
  Stack,
  Card,
  CardHeader,
  CardContent,
  Button,
  Grid,
  TextField,
  Chip,
  Alert,
  LinearProgress,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import LanIcon from '@mui/icons-material/Lan';
import TerminalIcon from '@mui/icons-material/Terminal';
import CleaningServicesIcon from '@mui/icons-material/CleaningServices';
import HubIcon from '@mui/icons-material/Hub';
import SettingsInputComponentIcon from '@mui/icons-material/SettingsInputComponent';
import MemoryIcon from '@mui/icons-material/Memory';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import StorageIcon from '@mui/icons-material/Storage';
import LogoIcon from './components/LogoIcon.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import { WineJS } from './runtime/wine-js.js';
import { createInitialPluginState, buildPluginInstances } from './config/pluginPresets.js';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#f72585' },
    secondary: { main: '#4cc9f0' },
    background: {
      default: '#04050d',
      paper: 'rgba(8,10,24,0.9)',
    },
  },
  typography: {
    fontFamily: `'Space Grotesk', 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif`,
    h6: { letterSpacing: '0.02em' },
  },
  shape: { borderRadius: 14 },
});

const formatFileSize = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const MAX_TASKS = 6;
const MAX_NETWORK_EVENTS = 60;
const MAX_DISK_EVENTS = 32;

const formatBytes = (bytes = 0) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const decimals = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(decimals)} ${units[unitIndex]}`;
};

const formatTimestamp = (input) => {
  if (!input) return new Date().toLocaleTimeString();
  const date = typeof input === 'number' ? new Date(input) : new Date(input);
  return date.toLocaleTimeString();
};

const formatConnectionLabel = (payload = {}) => {
  const connectionId = payload?.connectionId ?? payload?.meta?.connectionId ?? 'socket';
  const host = payload?.meta?.host ?? payload?.host;
  const port = payload?.meta?.port ?? payload?.port;
  return host ? `${connectionId} (${host}:${port ?? '?'})` : connectionId;
};

const describeDiskActivity = (activity = {}) => {
  const bytes = activity.bytes ?? 0;
  const blockIndex = activity.blockIndex ?? '—';
  if (activity.type === 'read') {
    return `Read block ${blockIndex} (${formatBytes(bytes)})`;
  }
  if (activity.type === 'write') {
    return `Wrote block ${blockIndex} (${formatBytes(bytes)})`;
  }
  if (activity.type === 'format') {
    return `Formatted block device ${activity.fill ? `(fill ${activity.fill})` : ''}`.trim();
  }
  if (activity.type === 'createFilesystem') {
    return `Created filesystem ${activity.label ?? 'unknown label'}`;
  }
  if (activity.type === 'configure') {
    const size = Number(activity.blockSize ?? 0).toLocaleString();
    const count = Number(activity.blockCount ?? 0).toLocaleString();
    return `Configured ${size} B × ${count} blocks`;
  }
  return 'Disk activity recorded';
};

function App() {
  const [pluginState, setPluginState] = React.useState(() => createInitialPluginState());
  const [statusText, setStatusText] = React.useState('Load a `.exe` to inspect imports or render a mock window.');
  const [selectedFile, setSelectedFile] = React.useState(null);
  const [isSimulating, setIsSimulating] = React.useState(false);
  const [backendUrl, setBackendUrl] = React.useState('ws://localhost:8089');
  const [blockSize, setBlockSize] = React.useState(4096);
  const [blockCount, setBlockCount] = React.useState(2048);
  const [filesystemLabel, setFilesystemLabel] = React.useState('WineJS');
  const [backendStatus, setBackendStatus] = React.useState('Backend disconnected.');
  const [backendLog, setBackendLog] = React.useState([]);
  const consoleRef = React.useRef(null);
  const stringRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const statusRef = React.useRef(null);
  const wineRef = React.useRef(null);
  const [wine, setWine] = React.useState(null);
  const [tasks, setTasks] = React.useState([]);
  const [networkEvents, setNetworkEvents] = React.useState([]);
  const [diskEvents, setDiskEvents] = React.useState([]);

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
      if (entry.type === 'sent') {
        bytesSent += entry.byteLength ?? 0;
      }
      if (entry.type === 'recv') {
        bytesReceived += entry.byteLength ?? 0;
      }
      const id = entry.connectionId ?? entry.meta?.connectionId;
      if (!id) return;
      if (entry.type === 'closed' || entry.type === 'error') {
        activeConnections.delete(id);
      } else if (entry.type === 'open' || entry.type === 'opening' || entry.type === 'sent' || entry.type === 'recv') {
        activeConnections.add(id);
      }
    });
    return {
      bytesSent,
      bytesReceived,
      activeConnections: activeConnections.size,
    };
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
            acc.lastFilesystem = event.label ?? acc.lastFilesystem;
          }
          return acc;
        },
        { reads: 0, readBytes: 0, writes: 0, writeBytes: 0, formats: 0, lastFilesystem: null },
      ),
    [diskEvents],
  );

  const pluginInstances = React.useMemo(
    () =>
      buildPluginInstances(pluginState, {
        getWine: () => wineRef.current,
        log: (message) => wineRef.current?.log?.(message),
      }),
    [pluginState],
  );

  React.useEffect(() => {
    if (!consoleRef.current || !stringRef.current || !canvasRef.current || !statusRef.current) {
      return;
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
  }, [pluginInstances]);

  React.useEffect(() => {
    if (!wine) return undefined;
    const winsock = wine.getWinsockBridge?.();
    if (!winsock?.subscribe) return undefined;
    const unsubOpen = winsock.subscribe('open', (payload) =>
      appendBackendLog(`Winsock socket ${formatConnectionLabel(payload)} opened.`),
    );
    const unsubData = winsock.subscribe('data', ({ connectionId, byteLength }) =>
      appendBackendLog(`Winsock socket ${connectionId} received ${formatBytes(byteLength ?? 0)} of buffered data.`),
    );
    const unsubClosed = winsock.subscribe('closed', (payload) =>
      appendBackendLog(`Winsock socket ${formatConnectionLabel(payload)} closed.`),
    );
    const unsubError = winsock.subscribe('error', (payload = {}) =>
      appendBackendLog(
        `Winsock socket ${formatConnectionLabel(payload)} error: ${payload?.error ?? payload?.message ?? 'unknown issue'}`,
      ),
    );
    return () => {
      unsubOpen?.();
      unsubData?.();
      unsubClosed?.();
      unsubError?.();
    };
  }, [wine, appendBackendLog]);

  React.useEffect(() => {
    if (!wine) return undefined;
    const blockDevice = wine.getBlockDeviceClient?.();
    if (!blockDevice?.subscribe) return undefined;
    const unsubscribe = blockDevice.subscribe('activity', appendDiskEvent);
    return () => {
      unsubscribe?.();
    };
  }, [wine, appendDiskEvent]);

  React.useEffect(() => {
    if (!wine) return undefined;
    const winsock = wine.getWinsockBridge?.();
    if (!winsock?.subscribe) return undefined;
    const unsubOpening = winsock.subscribe('opening', ({ meta }) =>
      appendNetworkEvent({
        type: 'opening',
        connectionId: meta?.connectionId,
        meta,
        direction: 'out',
        message: meta?.host ? `Dialing ${meta.host}:${meta.port}` : 'Opening socket',
      }),
    );
    const unsubOpen = winsock.subscribe('open', (payload = {}) =>
      appendNetworkEvent({
        type: 'open',
        connectionId: payload.connectionId ?? payload.meta?.connectionId,
        meta: payload.meta,
        direction: 'out',
        message: `Socket ${formatConnectionLabel(payload)} ready`,
      }),
    );
    const unsubRecv = winsock.subscribe('data', ({ connectionId, byteLength, meta }) =>
      appendNetworkEvent({
        type: 'recv',
        connectionId,
        byteLength,
        meta,
        direction: 'in',
        message: `Received ${formatBytes(byteLength ?? 0)}`,
      }),
    );
    const unsubSent = winsock.subscribe('sent', ({ connectionId, byteLength, meta }) =>
      appendNetworkEvent({
        type: 'sent',
        connectionId,
        byteLength,
        meta,
        direction: 'out',
        message: `Sent ${formatBytes(byteLength ?? 0)}`,
      }),
    );
    const unsubClosed = winsock.subscribe('closed', (payload = {}) =>
      appendNetworkEvent({
        type: 'closed',
        connectionId: payload.connectionId ?? payload.meta?.connectionId,
        meta: payload.meta,
        direction: 'out',
        message: `Socket ${formatConnectionLabel(payload)} closed`,
      }),
    );
    const unsubError = winsock.subscribe('error', (payload = {}) =>
      appendNetworkEvent({
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
  }, [wine, appendNetworkEvent]);

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !wine) return;
    setSelectedFile({ name: file.name, size: file.size });
    const taskId = `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const startedAt = Date.now();
    const baseTask = {
      id: taskId,
      name: file.name,
      size: file.size,
      status: 'Analyzing',
      startedAt,
      progress: 35 + Math.random() * 20,
      cpu: Math.round(30 + Math.random() * 40),
      memory: Math.max(24, Math.round(file.size / (1024 * 1024)) || 24),
      intent: 'Import scan',
    };
    setTasks((prev) => {
      const filtered = prev.filter((task) => task.id !== taskId);
      return [baseTask, ...filtered].slice(0, MAX_TASKS);
    });
    setIsSimulating(true);
    try {
      await wine.loadBinary(file);
      const simulation = wine.run(file);
      setTasks((prev) =>
        prev.map((task) =>
          task.id === taskId
            ? {
                ...task,
                status: simulation?.error ? 'Failed' : 'Ready',
                intent: simulation?.guiIntent ? 'GUI intent' : 'Console intent',
                progress: simulation?.error ? task.progress : 100,
                cpu: simulation?.error ? 0 : Math.min(100, task.cpu + Math.round(Math.random() * 10)),
                memory: Math.max(task.memory, Math.round((file.size || 0) / (1024 * 1024)) || task.memory),
                lastUpdated: Date.now(),
              }
            : task,
        ),
      );
    } catch (err) {
      setStatusText(`Failed to load ${file.name}. ${err?.message ?? err}`);
      setTasks((prev) =>
        prev.map((task) => (task.id === taskId ? { ...task, status: 'Failed', progress: 100, lastUpdated: Date.now() } : task)),
      );
    } finally {
      setIsSimulating(false);
    }
    event.target.value = '';
  };

  const parsePositive = (value, fallback) => {
    const next = Number(value);
    return Number.isFinite(next) && next > 0 ? next : fallback;
  };

  const handleConnectBackend = async () => {
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
      });
      setBackendStatus(
        `Connected: ${geometry.blockSize.toLocaleString()} bytes × ${geometry.blockCount.toLocaleString()} blocks`,
      );
      appendBackendLog(`Backend connected at ${target}`);
    } catch (err) {
      const message = err?.message ?? err;
      setBackendStatus(`Backend connection failed: ${message}`);
      appendBackendLog(`Backend error: ${message}`);
    }
  };

  const handleDisconnectBackend = () => {
    wine?.disconnectBackend?.();
    setBackendStatus('Backend disconnected.');
    appendBackendLog('Backend disconnected.');
  };

  const handleFormatDevice = async () => {
    if (!wine) return;
    try {
      await wine.getBlockDeviceClient().format();
      appendBackendLog('Block device formatted to zeros.');
      setBackendStatus('Block device formatted.');
    } catch (err) {
      const message = err?.message ?? err;
      setBackendStatus(`Format failed: ${message}`);
      appendBackendLog(`Format error: ${message}`);
    }
  };

  const handleCreateFilesystem = async () => {
    if (!wine) return;
    try {
      const meta = await wine.getBlockDeviceClient().createFilesystem({ label: filesystemLabel || 'WineJS' });
      appendBackendLog(`Filesystem ${meta.label} created at ${meta.createdAt ?? 'unknown time'}.`);
      setBackendStatus(`Filesystem ${meta.label} created.`);
    } catch (err) {
      const message = err?.message ?? err;
      setBackendStatus(`Filesystem creation failed: ${message}`);
      appendBackendLog(`Filesystem error: ${message}`);
    }
  };

  const handlePluginToggle = (sectionType, pluginId, enabled) => {
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
  };

  const handlePluginSettingChange = (sectionType, pluginId, fieldKey, value) => {
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
  };

  const handleCloseTask = React.useCallback(
    (taskId) => {
      setTasks((prev) => {
        const closing = prev.find((task) => task.id === taskId);
        if (closing && wine?.log) {
          wine.log(`[WineJS] Task "${closing.name}" closed from Task Manager.`);
        }
        return prev.filter((task) => task.id !== taskId);
      });
    },
    [wine],
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          minHeight: '100vh',
          background: 'radial-gradient(circle at 20% 20%, rgba(10,12,30,1), #02040a 70%)',
          pb: 6,
        }}
      >
        <AppBar
          position="static"
          elevation={0}
          sx={{
            background: 'rgba(5,6,15,0.85)',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <Toolbar sx={{ gap: 2 }}>
            <LogoIcon size={40} />
            <Box>
              <Typography variant="h6">WineJS Runtime Studio</Typography>
              <Typography variant="body2" color="text.secondary">
                Blend console strings, GUI traces, and backend tooling in one React workspace.
              </Typography>
            </Box>
          </Toolbar>
        </AppBar>
        <Container maxWidth="lg" sx={{ py: 4 }}>
          <Stack spacing={3}>
            <Card variant="outlined" sx={{ borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(8,10,24,0.9)' }}>
              <CardContent>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2}>
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Runtime Status
                    </Typography>
                    <Alert icon={<TerminalIcon fontSize="small" />} severity="info" sx={{ bgcolor: 'rgba(79,195,247,0.12)' }}>
                      <Typography ref={statusRef} component="span">
                        {statusText}
                      </Typography>
                    </Alert>
                  </Box>
                  {selectedFile ? (
                    <Chip
                      color="secondary"
                      variant="outlined"
                      label={`${selectedFile.name} • ${formatFileSize(selectedFile.size)}`}
                    />
                  ) : null}
                </Stack>
              </CardContent>
            </Card>

            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Card variant="outlined" sx={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                  <CardHeader
                    avatar={<CloudUploadIcon color="primary" />}
                    title="Load Windows Executables"
                    subheader="Parse & simulate PE binaries directly in the browser."
                  />
                  <CardContent>
                    <Stack spacing={2}>
                      <Button
                        component="label"
                        variant="contained"
                        color="primary"
                        startIcon={<CloudUploadIcon />}
                        disabled={!wine || isSimulating}
                      >
                        {isSimulating ? 'Processing…' : 'Select .exe binary'}
                        <input type="file" accept=".exe" hidden onChange={handleFileSelect} />
                      </Button>
                      <Typography variant="body2" color="text.secondary">
                        The WineJS runtime decodes imports, surfaces console activity, and mirrors GUI intent into
                        the DirectX sandbox.
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={6}>
                <Card variant="outlined" sx={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                  <CardHeader
                    avatar={<LanIcon color="secondary" />}
                    title="Backend Bridge & Block Device"
                    subheader="Tunnel Winsock calls and file IO through the WebSocket backend."
                  />
                  <CardContent>
                    <Stack spacing={2}>
                      <TextField
                        label="Backend WebSocket URL"
                        value={backendUrl}
                        onChange={(event) => setBackendUrl(event.target.value)}
                        size="small"
                        fullWidth
                      />
                      <Grid container spacing={1.5}>
                        <Grid item xs={6}>
                          <TextField
                            label="Block size (bytes)"
                            type="number"
                            size="small"
                            value={blockSize}
                            onChange={(event) => setBlockSize(event.target.value)}
                            fullWidth
                          />
                        </Grid>
                        <Grid item xs={6}>
                          <TextField
                            label="Block count"
                            type="number"
                            size="small"
                            value={blockCount}
                            onChange={(event) => setBlockCount(event.target.value)}
                            fullWidth
                          />
                        </Grid>
                      </Grid>
                      <TextField
                        label="Filesystem label"
                        value={filesystemLabel}
                        onChange={(event) => setFilesystemLabel(event.target.value)}
                        size="small"
                        fullWidth
                      />
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                        <Button variant="contained" color="secondary" onClick={handleConnectBackend} startIcon={<HubIcon />}>
                          Connect
                        </Button>
                        <Button variant="outlined" color="secondary" onClick={handleDisconnectBackend}>
                          Disconnect
                        </Button>
                      </Stack>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                        <Button
                          variant="outlined"
                          color="inherit"
                          startIcon={<CleaningServicesIcon />}
                          onClick={handleFormatDevice}
                        >
                          Format device
                        </Button>
                        <Button
                          variant="outlined"
                          color="inherit"
                          startIcon={<SettingsInputComponentIcon />}
                          onClick={handleCreateFilesystem}
                        >
                          Create filesystem
                        </Button>
                      </Stack>
                      <Alert severity="info" sx={{ bgcolor: 'rgba(79,195,247,0.12)' }}>
                        {backendStatus}
                      </Alert>
                      <Box className="backendLog" sx={{ maxHeight: 140, overflowY: 'auto', p: 1.5, borderRadius: 2, border: '1px solid rgba(255,255,255,0.1)' }}>
                        {backendLog.length ? (
                          backendLog.map((entry) => (
                            <Typography variant="caption" display="block" key={entry.id} sx={{ opacity: 0.85 }}>
                              [{entry.timestamp}] {entry.message}
                            </Typography>
                          ))
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            Backend events will appear here once you connect.
                          </Typography>
                        )}
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
            </Grid>
          </Grid>

          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Card variant="outlined" sx={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                <CardHeader
                  avatar={<MemoryIcon color="primary" />}
                  title="Task Manager"
                  subheader="Inspect simulated processes and terminate noisy workloads."
                />
                <CardContent>
                  {tasks.length ? (
                    <Stack spacing={2}>
                      {tasks.map((task) => {
                        const chipColor = task.status === 'Failed' ? 'error' : task.status === 'Analyzing' ? 'warning' : 'success';
                        return (
                          <Box key={task.id} sx={{ p: 1.5, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2 }}>
                            <Stack
                              direction={{ xs: 'column', sm: 'row' }}
                              justifyContent="space-between"
                              alignItems={{ xs: 'flex-start', sm: 'center' }}
                              spacing={1.5}
                            >
                              <Box>
                                <Typography variant="subtitle1">{task.name}</Typography>
                                <Typography variant="body2" color="text.secondary">
                                  {task.intent} • {formatFileSize(task.size)} • Started {formatTimestamp(task.startedAt)}
                                </Typography>
                              </Box>
                              <Stack direction="row" spacing={1} alignItems="center">
                                <Chip size="small" color={chipColor} label={task.status} />
                                <Button size="small" color="error" onClick={() => handleCloseTask(task.id)}>
                                  End task
                                </Button>
                              </Stack>
                            </Stack>
                            <Stack direction="row" spacing={2} mt={1}>
                              <Typography variant="caption" color="text.secondary">
                                CPU {task.cpu}%
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                Memory {task.memory} MB
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                Updated {formatTimestamp(task.lastUpdated ?? task.startedAt)}
                              </Typography>
                            </Stack>
                            <LinearProgress
                              variant="determinate"
                              value={Math.min(100, Math.round(task.progress))}
                              sx={{ mt: 1, height: 6, borderRadius: 999 }}
                            />
                          </Box>
                        );
                      })}
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Load an executable to seed the task list and manage its workload from here.
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card variant="outlined" sx={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                <CardHeader
                  avatar={<NetworkCheckIcon color="secondary" />}
                  title="Network Telemetry"
                  subheader="Watch Winsock sockets stream through the backend tunnel."
                />
                <CardContent>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mb={2}>
                    <Box>
                      <Typography variant="overline" color="text.secondary">
                        Active
                      </Typography>
                      <Typography variant="h6">{networkMetrics.activeConnections}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="overline" color="text.secondary">
                        Sent
                      </Typography>
                      <Typography variant="h6">{formatBytes(networkMetrics.bytesSent)}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="overline" color="text.secondary">
                        Received
                      </Typography>
                      <Typography variant="h6">{formatBytes(networkMetrics.bytesReceived)}</Typography>
                    </Box>
                  </Stack>
                  <Box className="telemetryList">
                    {networkEvents.length ? (
                      networkEvents.map((entry) => {
                        const labelMap = {
                          opening: 'OPENING',
                          open: 'READY',
                          recv: 'RX',
                          sent: 'TX',
                          closed: 'CLOSED',
                          error: 'ERROR',
                        };
                        const colorMap = {
                          opening: 'warning',
                          open: 'success',
                          recv: 'secondary',
                          sent: 'primary',
                          closed: 'default',
                          error: 'error',
                        };
                        return (
                          <Box key={entry.id} className="telemetryList__item">
                            <Stack spacing={0.5}>
                              <Stack direction="row" spacing={1} alignItems="center">
                                <Chip
                                  size="small"
                                  color={colorMap[entry.type] ?? 'default'}
                                  label={labelMap[entry.type] ?? entry.type?.toUpperCase()}
                                />
                                <Typography variant="caption" color="text.secondary">
                                  {formatConnectionLabel(entry)}
                                </Typography>
                              </Stack>
                              <Typography variant="body2">{entry.message}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {formatTimestamp(entry.timestamp)}
                              </Typography>
                            </Stack>
                          </Box>
                        );
                      })
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        Socket activity will be mirrored here once the runtime dials a backend target.
                      </Typography>
                    )}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12}>
              <Card variant="outlined" sx={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                <CardHeader
                  avatar={<StorageIcon color="warning" />}
                  title="Disk Activity"
                  subheader="Track block reads, writes, and filesystem events from the block device client."
                />
                <CardContent>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} mb={2}>
                    <Box>
                      <Typography variant="overline" color="text.secondary">
                        Reads
                      </Typography>
                      <Typography variant="subtitle1">
                        {diskMetrics.reads} • {formatBytes(diskMetrics.readBytes)}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="overline" color="text.secondary">
                        Writes
                      </Typography>
                      <Typography variant="subtitle1">
                        {diskMetrics.writes} • {formatBytes(diskMetrics.writeBytes)}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="overline" color="text.secondary">
                        Formats
                      </Typography>
                      <Typography variant="subtitle1">{diskMetrics.formats}</Typography>
                    </Box>
                    {diskMetrics.lastFilesystem ? (
                      <Box>
                        <Typography variant="overline" color="text.secondary">
                          Filesystem Label
                        </Typography>
                        <Typography variant="subtitle1">{diskMetrics.lastFilesystem}</Typography>
                      </Box>
                    ) : null}
                  </Stack>
                  <Box className="telemetryList">
                    {diskEvents.length ? (
                      diskEvents.map((activity) => (
                        <Box key={activity.id} className="telemetryList__item">
                          <Typography variant="body2">{describeDiskActivity(activity)}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatTimestamp(activity.timestamp)}
                          </Typography>
                        </Box>
                      ))
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        Disk operations (configure, format, block IO) will stream in after the backend bridge is active.
                      </Typography>
                    )}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Card variant="outlined" sx={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                  <CardHeader title="Console Output" subheader="Hooks into WriteConsole imports." />
                  <CardContent>
                    <Box ref={consoleRef} className="terminal" />
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={6}>
                <Card variant="outlined" sx={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                  <CardHeader title="Extracted Strings" subheader="Top printable segments in the binary." />
                  <CardContent>
                    <Box ref={stringRef} className="stringList" />
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12}>
                <Card variant="outlined" sx={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                  <CardHeader title="GUI Canvas Sandbox" subheader="DirectX / Win32 windows stream into this compositor." />
                  <CardContent>
                    <Box ref={canvasRef} className="canvasContainer" />
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            <SettingsPanel
              pluginState={pluginState}
              onTogglePlugin={handlePluginToggle}
              onSettingChange={handlePluginSettingChange}
            />
          </Stack>
        </Container>
      </Box>
    </ThemeProvider>
  );
}

export default App;
