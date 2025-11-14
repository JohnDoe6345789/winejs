import { Card, CardHeader, CardContent, Stack, Button, Typography } from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';

function FileLoaderCard({ disabled, isSimulating, onSelect }) {
  return (
    <Card variant="outlined" sx={{ borderColor: 'rgba(255,255,255,0.08)' }}>
      <CardHeader
        avatar={<CloudUploadIcon color="primary" />}
        title="Load Windows Executables"
        subheader="Parse & simulate PE binaries directly in the browser."
      />
      <CardContent>
        <Stack spacing={2}>
          <Button component="label" variant="contained" color="primary" startIcon={<CloudUploadIcon />} disabled={disabled}>
            {isSimulating ? 'Processing…' : 'Select .exe binary'}
            <input type="file" accept=".exe" hidden onChange={onSelect} />
          </Button>
          <Typography variant="body2" color="text.secondary">
            The WineJS runtime decodes imports, surfaces console activity, and mirrors GUI intent into the DirectX sandbox.
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default FileLoaderCard;
