import * as React from 'react';
import { ThemeProvider, CssBaseline, AppBar, Toolbar, Typography, Container, Box, Stack, Grid } from '@mui/material';
import LogoIcon from './components/LogoIcon.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import StatusCard from './components/StatusCard.jsx';
import FileLoaderCard from './components/FileLoaderCard.jsx';
import BackendBridgeCard from './components/BackendBridgeCard.jsx';
import TaskManagerCard from './components/TaskManagerCard.jsx';
import NetworkTelemetryCard from './components/NetworkTelemetryCard.jsx';
import DiskActivityCard from './components/DiskActivityCard.jsx';
import RuntimeOutputs from './components/RuntimeOutputs.jsx';
import theme from './theme.js';
import { usePluginManager } from './hooks/usePluginManager.js';
import { useWineRuntime } from './hooks/useWineRuntime.js';
import { useWinsockTelemetry } from './hooks/useWinsockTelemetry.js';
import { useDiskTelemetry } from './hooks/useDiskTelemetry.js';
import { useBackendBridge } from './hooks/useBackendBridge.js';
import { useTelemetryState } from './hooks/useTelemetryState.js';
import { useTaskManager } from './hooks/useTaskManager.js';

function App() {
  const [statusText, setStatusText] = React.useState('Load a `.exe` to inspect imports or render a mock window.');
  const consoleRef = React.useRef(null);
  const stringRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const statusRef = React.useRef(null);
  const wineRef = React.useRef(null);

  const { pluginState, pluginInstances, handlePluginToggle, handlePluginSettingChange } = usePluginManager(wineRef);

  const wine = useWineRuntime({
    pluginInstances,
    consoleRef,
    stringRef,
    canvasRef,
    statusRef,
    setStatusText,
    wineRef,
  });

  const {
    backendUrl,
    blockSize,
    blockCount,
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
    handleFilesystemLabelChange,
  } = useBackendBridge(wine);

  const {
    networkEvents,
    diskEvents,
    networkMetrics,
    diskMetrics,
    appendNetworkEvent,
    appendDiskEvent,
  } = useTelemetryState();

  const { selectedFile, isSimulating, tasks, handleFileSelect, handleCloseTask } = useTaskManager(wine, setStatusText);

  useWinsockTelemetry({ wine, onBackendLog: appendBackendLog, onNetworkEvent: appendNetworkEvent });
  useDiskTelemetry({ wine, onDiskEvent: appendDiskEvent });

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', background: 'radial-gradient(circle at 20% 20%, rgba(10,12,30,1), #02040a 70%)', pb: 6 }}>
        <AppBar
          position="static"
          elevation={0}
          sx={{ background: 'rgba(5,6,15,0.85)', borderBottom: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)' }}
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
            <StatusCard statusText={statusText} statusRef={statusRef} selectedFile={selectedFile} />
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <FileLoaderCard disabled={!wine || isSimulating} isSimulating={isSimulating} onSelect={handleFileSelect} />
              </Grid>
              <Grid item xs={12} md={6}>
                <BackendBridgeCard
                  backendUrl={backendUrl}
                  onBackendUrlChange={handleBackendUrlChange}
                  blockSize={blockSize}
                  onBlockSizeChange={handleBlockSizeChange}
                  blockCount={blockCount}
                  onBlockCountChange={handleBlockCountChange}
                  filesystemLabel={filesystemLabel}
                  onFilesystemLabelChange={handleFilesystemLabelChange}
                  onConnect={connectBackend}
                  onDisconnect={disconnectBackend}
                  onFormat={formatDevice}
                  onCreateFilesystem={createFilesystem}
                  backendStatus={backendStatus}
                  backendLog={backendLog}
                />
              </Grid>
            </Grid>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <TaskManagerCard tasks={tasks} onCloseTask={handleCloseTask} />
              </Grid>
              <Grid item xs={12} md={6}>
                <NetworkTelemetryCard networkEvents={networkEvents} networkMetrics={networkMetrics} />
              </Grid>
              <Grid item xs={12}>
                <DiskActivityCard diskMetrics={diskMetrics} diskEvents={diskEvents} />
              </Grid>
            </Grid>
            <RuntimeOutputs consoleRef={consoleRef} stringRef={stringRef} canvasRef={canvasRef} />
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
