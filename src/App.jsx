import * as React from 'react';
import { ThemeProvider, CssBaseline, GlobalStyles, AppBar, Toolbar, Typography, Container, Box, Stack, Grid } from '@mui/material';
import { alpha } from '@mui/material/styles';
import LogoIcon from './components/LogoIcon.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import StatusCard from './components/StatusCard.jsx';
import FileLoaderCard from './components/FileLoaderCard.jsx';
import BackendBridgeCard from './components/BackendBridgeCard.jsx';
import TaskManagerCard from './components/TaskManagerCard.jsx';
import NetworkTelemetryCard from './components/NetworkTelemetryCard.jsx';
import DiskActivityCard from './components/DiskActivityCard.jsx';
import RuntimeOutputs from './components/RuntimeOutputs.jsx';
import ThemeMenu from './components/ThemeMenu.jsx';
import { themeRegistry, defaultThemeName, getTheme } from './theme.js';
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

  const [selectedTheme, setSelectedTheme] = React.useState(defaultThemeName);
  const theme = React.useMemo(() => getTheme(selectedTheme), [selectedTheme]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <GlobalStyles
        styles={(theme) => {
          const borderColor = theme.custom?.cardBorder ?? theme.palette.divider;
          const subtleBorder = theme.custom?.listItemBorder ?? alpha(borderColor, 0.5);
          const listBg = theme.custom?.listBackground ?? alpha(theme.palette.background.paper, theme.palette.mode === 'light' ? 0.9 : 0.2);
          const listItemBg =
            theme.custom?.listItemBackground ?? alpha(theme.palette.primary.main, theme.palette.mode === 'light' ? 0.08 : 0.12);
          return {
            ':root': {
              colorScheme: theme.palette.mode,
            },
            body: {
              backgroundColor: theme.palette.background.default,
              color: theme.palette.text.primary,
            },
            '#root': {
              minHeight: '100vh',
            },
            '.terminal': {
              width: '100%',
              minHeight: 240,
              maxHeight: 420,
              overflowY: 'auto',
              padding: 16,
              borderRadius: 12,
              border: `1px solid ${borderColor}`,
              background: theme.custom?.terminalBackground ?? alpha(theme.palette.background.paper, 0.85),
              fontFamily: `'JetBrains Mono', 'Space Grotesk', 'SFMono-Regular', Consolas, Menlo, monospace`,
              fontSize: '0.85rem',
              whiteSpace: 'pre-wrap',
            },
            '.stringList': {
              minHeight: 240,
              maxHeight: 420,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            },
            '.stringList__item': {
              padding: '10px 12px',
              borderRadius: 10,
              background: listItemBg,
              border: `1px solid ${subtleBorder}`,
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              fontSize: '0.9rem',
            },
            '.stringList__item strong': {
              color: theme.palette.primary.main,
              fontWeight: 600,
            },
            '.canvasContainer': {
              minHeight: 360,
              borderRadius: 16,
              border: `1px dashed ${theme.custom?.cardBorder ?? theme.palette.divider}`,
              background: theme.custom?.canvasBackground ?? alpha(theme.palette.background.paper, 0.6),
              position: 'relative',
              overflow: 'hidden',
            },
            '.canvasContainer canvas': {
              position: 'absolute',
              border: `2px solid ${theme.custom?.canvasBorder ?? theme.palette.primary.main}`,
              borderRadius: 8,
              background: theme.custom?.canvasSurface ?? theme.palette.background.paper,
              boxShadow: `0 12px 40px ${theme.custom?.canvasGlow ?? alpha(theme.palette.common.black, 0.4)}`,
            },
            ".canvasContainer canvas[data-directx-bridge='webgl']": {
              borderColor: theme.palette.secondary.main,
              boxShadow: `0 0 32px ${alpha(theme.palette.secondary.main, 0.5)}`,
            },
            '.telemetryList': {
              maxHeight: 260,
              overflowY: 'auto',
              padding: 8,
              borderRadius: 12,
              border: `1px solid ${borderColor}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              background: listBg,
            },
            '.telemetryList__item': {
              padding: '10px 12px',
              borderRadius: 12,
              border: `1px solid ${subtleBorder}`,
              background: listItemBg,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            },
            '.backendLog::-webkit-scrollbar-thumb, .terminal::-webkit-scrollbar-thumb, .stringList::-webkit-scrollbar-thumb, .canvasContainer::-webkit-scrollbar-thumb, .telemetryList::-webkit-scrollbar-thumb': {
              background: alpha(theme.palette.text.primary, 0.25),
              borderRadius: 999,
            },
          };
        }}
      />
      <Box sx={(theme) => ({ minHeight: '100vh', background: theme.custom?.appBackground ?? theme.palette.background.default, pb: 6 })}>
        <AppBar
          position="static"
          elevation={0}
          sx={(theme) => ({
            background: alpha(theme.custom?.cardBackground ?? theme.palette.background.paper, theme.palette.mode === 'light' ? 0.92 : 0.85),
            borderBottom: `1px solid ${theme.custom?.cardBorder ?? theme.palette.divider}`,
            backdropFilter: 'blur(12px)',
          })}
        >
          <Toolbar sx={{ gap: 2, flexWrap: 'wrap' }}>
            <LogoIcon size={40} />
            <Box sx={{ flexGrow: 1, minWidth: 200 }}>
              <Typography variant="h6">WineJS Runtime Studio</Typography>
              <Typography variant="body2" color="text.secondary">
                Blend console strings, GUI traces, and backend tooling in one React workspace.
              </Typography>
            </Box>
            <ThemeMenu value={selectedTheme} onChange={setSelectedTheme} options={themeRegistry} />
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
