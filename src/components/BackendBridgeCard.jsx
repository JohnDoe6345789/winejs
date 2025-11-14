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
  MenuItem,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
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
  driveCount,
  onDriveCountChange,
  driveLetters,
  selectedDrive,
  onSelectedDriveChange,
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
    <Card
      variant="outlined"
      sx={(theme) => ({
        borderColor: theme.custom?.cardBorder ?? theme.palette.divider,
        backgroundColor: theme.custom?.cardBackground ?? theme.palette.background.paper,
      })}
    >
      <CardHeader
        avatar={<LanIcon color="secondary" />}
        title="Backend Bridge & Block Device"
        subheader="Tunnel Winsock calls and file IO through the WebSocket backend."
      />
      <CardContent>
        <Stack spacing={2}>
          <TextField label="Backend WebSocket URL" value={backendUrl} onChange={onBackendUrlChange} size="small" fullWidth />
          <Grid container spacing={1.5}>
            <Grid item xs={12} sm={4}>
              <TextField
                label="Block size (bytes)"
                type="number"
                size="small"
                value={blockSize}
                onChange={onBlockSizeChange}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                label="Block count"
                type="number"
                size="small"
                value={blockCount}
                onChange={onBlockCountChange}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                label="Drive count"
                type="number"
                size="small"
                value={driveCount}
                onChange={onDriveCountChange}
                fullWidth
                inputProps={{ min: 1, max: 26 }}
              />
            </Grid>
          </Grid>
          <TextField
            select
            label="Target drive"
            size="small"
            value={selectedDrive}
            onChange={onSelectedDriveChange}
            fullWidth
          >
            {(driveLetters?.length ? driveLetters : ['C']).map((drive) => (
              <MenuItem key={drive} value={drive}>
                {drive}
              </MenuItem>
            ))}
          </TextField>
          <Typography variant="caption" color="text.secondary">
            Drive letters: {(driveLetters?.length ? driveLetters : ['C']).join(', ')}
          </Typography>
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
              Format drive
            </Button>
            <Button variant="outlined" color="inherit" startIcon={<SettingsInputComponentIcon />} onClick={onCreateFilesystem}>
              Create filesystem
            </Button>
          </Stack>
          <Alert
            severity="info"
            sx={(theme) => ({
              bgcolor: theme.custom?.infoBackground ?? alpha(theme.palette.primary.main, 0.15),
            })}
          >
            {backendStatus}
          </Alert>
          <Box
            className="backendLog"
            sx={(theme) => ({
              maxHeight: 140,
              overflowY: 'auto',
              p: 1.5,
              borderRadius: 2,
              border: `1px solid ${theme.custom?.cardBorder ?? theme.palette.divider}`,
              backgroundColor: theme.custom?.cardBackground ?? theme.palette.background.paper,
            })}
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
