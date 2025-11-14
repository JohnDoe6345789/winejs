import * as React from 'react';
import { Card, CardContent, Stack, Box, Typography, Chip, Alert } from '@mui/material';
import { alpha } from '@mui/material/styles';
import TerminalIcon from '@mui/icons-material/Terminal';
import { formatFileSize } from '../utils/formatters.js';

function StatusCard({ statusText, statusRef, selectedFile }) {
  return (
    <Card
      variant="outlined"
      sx={(theme) => ({
        borderColor: theme.custom?.cardBorder ?? theme.palette.divider,
        backgroundColor: theme.custom?.cardBackground ?? theme.palette.background.paper,
      })}
    >
      <CardContent>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2}>
          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Runtime Status
            </Typography>
            <Alert
              icon={<TerminalIcon fontSize="small" />}
              severity="info"
              sx={(theme) => ({
                bgcolor: theme.custom?.infoBackground ?? alpha(theme.palette.primary.main, 0.15),
              })}
            >
              <Typography ref={statusRef} component="span">
                {statusText}
              </Typography>
            </Alert>
          </Box>
          {selectedFile ? (
            <Chip color="secondary" variant="outlined" label={`${selectedFile.name} • ${formatFileSize(selectedFile.size)}`} />
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

export default StatusCard;
