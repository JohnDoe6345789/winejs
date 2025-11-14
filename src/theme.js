import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#f72585' },
    secondary: { main: '#4cc9f0' },
    background: {
      default: '#04050d',
      paper: 'rgba(8,10,24,0.9)',
    },
  },
  typography: {
    fontFamily: `'Space Grotesk', 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif`,
    h6: { letterSpacing: '0.02em' },
  },
  shape: { borderRadius: 14 },
});

export default theme;
