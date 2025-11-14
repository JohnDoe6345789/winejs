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
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import LanIcon from '@mui/icons-material/Lan';
import TerminalIcon from '@mui/icons-material/Terminal';
import CleaningServicesIcon from '@mui/icons-material/CleaningServices';
import HubIcon from '@mui/icons-material/Hub';
import SettingsInputComponentIcon from '@mui/icons-material/SettingsInputComponent';
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
    const unsubOpen = winsock.subscribe('open', ({ connectionId }) =>
      appendBackendLog(`Winsock socket ${connectionId} opened.`),
    );
    const unsubData = winsock.subscribe('data', ({ connectionId }) =>
      appendBackendLog(`Winsock socket ${connectionId} received buffered data.`),
    );
    const unsubClosed = winsock.subscribe('closed', ({ connectionId }) =>
      appendBackendLog(`Winsock socket ${connectionId} closed.`),
    );
    const unsubError = winsock.subscribe('error', ({ connectionId, message }) =>
      appendBackendLog(`Winsock socket ${connectionId} error: ${message ?? 'unknown issue'}`),
    );
    return () => {
      unsubOpen?.();
      unsubData?.();
      unsubClosed?.();
      unsubError?.();
    };
  }, [wine, appendBackendLog]);

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !wine) return;
    setSelectedFile({ name: file.name, size: file.size });
    setIsSimulating(true);
    try {
      await wine.loadBinary(file);
      wine.run(file);
    } catch (err) {
      setStatusText(`Failed to load ${file.name}. ${err?.message ?? err}`);
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
