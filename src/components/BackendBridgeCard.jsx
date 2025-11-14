import {
  Card,
  CardHeader,
  CardContent,
  Stack,
  TextField,
  Grid,
  Button,
  Alert,
  Typography,
  Box,
} from '@mui/material';
import LanIcon from '@mui/icons-material/Lan';
import HubIcon from '@mui/icons-material/Hub';
import CleaningServicesIcon from '@mui/icons-material/CleaningServices';
import SettingsInputComponentIcon from '@mui/icons-material/SettingsInputComponent';

function BackendBridgeCard({
  backendUrl,
  onBackendUrlChange,
  blockSize,
  onBlockSizeChange,
  blockCount,
  onBlockCountChange,
  filesystemLabel,
  onFilesystemLabelChange,
  onConnect,
  onDisconnect,
  onFormat,
  onCreateFilesystem,
  backendStatus,
  backendLog,
}) {
  return (
    <Card variant="outlined" sx={{ borderColor: 'rgba(255,255,255,0.08)' }}>
      <CardHeader
        avatar={<LanIcon color="secondary" />}
        title="Backend Bridge & Block Device"
        subheader="Tunnel Winsock calls and file IO through the WebSocket backend."
      />
      <CardContent>
        <Stack spacing={2}>
          <TextField label="Backend WebSocket URL" value={backendUrl} onChange={onBackendUrlChange} size="small" fullWidth />
          <Grid container spacing={1.5}>
            <Grid item xs={6}>
              <TextField
                label="Block size (bytes)"
                type="number"
                size="small"
                value={blockSize}
                onChange={onBlockSizeChange}
                fullWidth
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="Block count"
                type="number"
                size="small"
                value={blockCount}
                onChange={onBlockCountChange}
                fullWidth
              />
            </Grid>
          </Grid>
          <TextField
            label="Filesystem label"
            value={filesystemLabel}
            onChange={onFilesystemLabelChange}
            size="small"
            fullWidth
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <Button variant="contained" color="secondary" onClick={onConnect} startIcon={<HubIcon />}>
              Connect
            </Button>
            <Button variant="outlined" color="secondary" onClick={onDisconnect}>
              Disconnect
            </Button>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <Button variant="outlined" color="inherit" startIcon={<CleaningServicesIcon />} onClick={onFormat}>
              Format device
            </Button>
            <Button variant="outlined" color="inherit" startIcon={<SettingsInputComponentIcon />} onClick={onCreateFilesystem}>
              Create filesystem
            </Button>
          </Stack>
          <Alert severity="info" sx={{ bgcolor: 'rgba(79,195,247,0.12)' }}>
            {backendStatus}
          </Alert>
          <Box
            className="backendLog"
            sx={{ maxHeight: 140, overflowY: 'auto', p: 1.5, borderRadius: 2, border: '1px solid rgba(255,255,255,0.1)' }}
          >
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
  );
}

export default BackendBridgeCard;
