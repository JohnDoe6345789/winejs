import { Card, CardHeader, CardContent, Stack, Box, Typography, Chip } from '@mui/material';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import { formatBytes, formatTimestamp, formatConnectionLabel } from '../utils/formatters.js';

function NetworkTelemetryCard({ networkEvents, networkMetrics }) {
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
    <Card
      variant="outlined"
      sx={(theme) => ({
        borderColor: theme.custom?.cardBorder ?? theme.palette.divider,
        backgroundColor: theme.custom?.cardBackground ?? theme.palette.background.paper,
      })}
    >
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
            networkEvents.map((entry) => (
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
            ))
          ) : (
            <Typography variant="body2" color="text.secondary">
              Socket activity will be mirrored here once the runtime dials a backend target.
            </Typography>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

export default NetworkTelemetryCard;
