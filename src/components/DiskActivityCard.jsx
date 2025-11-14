import { Card, CardHeader, CardContent, Stack, Box, Typography } from '@mui/material';
import StorageIcon from '@mui/icons-material/Storage';
import { formatBytes, formatTimestamp, describeDiskActivity } from '../utils/formatters.js';

function DiskActivityCard({ diskMetrics, diskEvents }) {
  return (
    <Card
      variant="outlined"
      sx={(theme) => ({
        borderColor: theme.custom?.cardBorder ?? theme.palette.divider,
        backgroundColor: theme.custom?.cardBackground ?? theme.palette.background.paper,
      })}
    >
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
  );
}

export default DiskActivityCard;
