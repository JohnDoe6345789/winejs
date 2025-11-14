import { Grid, Card, CardHeader, CardContent, Box } from '@mui/material';

function RuntimeOutputs({ consoleRef, stringRef, canvasRef }) {
  return (
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
  );
}

export default RuntimeOutputs;
