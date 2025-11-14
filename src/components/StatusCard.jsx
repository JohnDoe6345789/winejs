import * as React from 'react';
import { Card, CardContent, Stack, Box, Typography, Chip, Alert } from '@mui/material';
import TerminalIcon from '@mui/icons-material/Terminal';
import { formatFileSize } from '../utils/formatters.js';

function StatusCard({ statusText, statusRef, selectedFile }) {
  return (
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
            <Chip color="secondary" variant="outlined" label={`${selectedFile.name} • ${formatFileSize(selectedFile.size)}`} />
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

export default StatusCard;
