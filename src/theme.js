import { createTheme } from '@mui/material/styles';

const baseTypography = {
  fontFamily: `'Space Grotesk', 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif`,
  h6: { letterSpacing: '0.02em' },
};

const baseShape = { borderRadius: 14 };

const themeConfigs = {
  dark: {
    label: 'Dark Studio',
    description: 'Neon panels on a midnight gradient.',
    palette: {
      mode: 'dark',
      primary: { main: '#f72585' },
      secondary: { main: '#4cc9f0' },
      background: {
        default: '#02040a',
        paper: 'rgba(8,10,24,0.9)',
      },
      divider: 'rgba(255,255,255,0.12)',
    },
    custom: {
      appBackground: 'radial-gradient(circle at 20% 20%, rgba(10,12,30,1), #02040a 70%)',
      cardBackground: 'rgba(8,10,24,0.9)',
      cardBorder: 'rgba(255,255,255,0.12)',
      infoBackground: 'rgba(79,195,247,0.12)',
      listBackground: 'rgba(255,255,255,0.02)',
      listItemBackground: 'rgba(255,255,255,0.04)',
      listItemBorder: 'rgba(255,255,255,0.06)',
      terminalBackground: 'linear-gradient(180deg, rgba(11, 15, 30, 0.9), rgba(5, 5, 20, 0.95))',
      canvasBackground: 'radial-gradient(circle at 10% 20%, rgba(18, 24, 50, 0.9), rgba(5, 7, 20, 0.95))',
      canvasSurface: '#111119',
      canvasBorder: '#4cc9f0',
      canvasGlow: 'rgba(247, 37, 133, 0.6)',
    },
  },
  light: {
    label: 'Light Lab',
    description: 'Paper panels and soft blue shadows.',
    palette: {
      mode: 'light',
      primary: { main: '#0057ff' },
      secondary: { main: '#ff5c00' },
      background: {
        default: '#f4f6ff',
        paper: '#ffffff',
      },
      text: {
        primary: '#11142d',
        secondary: '#4a4f6b',
      },
      divider: 'rgba(15,23,42,0.15)',
    },
    custom: {
      appBackground: 'linear-gradient(180deg, #fefefe 0%, #e3e8ff 100%)',
      cardBackground: '#ffffff',
      cardBorder: 'rgba(15,23,42,0.12)',
      infoBackground: 'rgba(0,87,255,0.08)',
      listBackground: 'rgba(255,255,255,0.9)',
      listItemBackground: 'rgba(0,87,255,0.06)',
      listItemBorder: 'rgba(0,87,255,0.12)',
      terminalBackground: 'linear-gradient(180deg, rgba(255,255,255,0.95), rgba(226,235,255,0.85))',
      canvasBackground: 'radial-gradient(circle at 10% 20%, rgba(255,255,255,0.9), rgba(220,229,255,0.85))',
      canvasSurface: '#fefefe',
      canvasBorder: '#0057ff',
      canvasGlow: 'rgba(0,87,255,0.25)',
    },
  },
  hotPink: {
    label: 'Hot Pink',
    description: 'Loud magenta joke theme with synthwave glow.',
    palette: {
      mode: 'dark',
      primary: { main: '#ff00a8' },
      secondary: { main: '#00fff2' },
      background: {
        default: '#280018',
        paper: 'rgba(40,0,24,0.95)',
      },
      text: {
        primary: '#fff0fb',
        secondary: '#ffc3f2',
      },
      divider: 'rgba(255,0,168,0.35)',
    },
    custom: {
      appBackground: 'radial-gradient(circle at 30% 10%, rgba(255,0,168,0.3), #1a0010 75%)',
      cardBackground: 'rgba(40,0,24,0.95)',
      cardBorder: 'rgba(255,0,168,0.35)',
      infoBackground: 'rgba(0,255,242,0.16)',
      listBackground: 'rgba(255,0,168,0.08)',
      listItemBackground: 'rgba(255,0,168,0.12)',
      listItemBorder: 'rgba(255,0,168,0.25)',
      terminalBackground: 'linear-gradient(180deg, rgba(68,0,46,0.9), rgba(29,0,20,0.95))',
      canvasBackground: 'radial-gradient(circle at 15% 25%, rgba(255,0,168,0.3), rgba(0,0,0,0.85))',
      canvasSurface: '#330022',
      canvasBorder: '#ff00a8',
      canvasGlow: 'rgba(255,0,168,0.7)',
    },
  },
};

export const themeRegistry = Object.freeze(
  Object.entries(themeConfigs).reduce((acc, [key, config]) => {
    const { label, description, ...themeDefinition } = config;
    const { typography, shape, ...rest } = themeDefinition;
    acc[key] = {
      label,
      description,
      theme: createTheme({
        typography: { ...baseTypography, ...typography },
        shape: { ...baseShape, ...shape },
        ...rest,
      }),
    };
    return acc;
  }, {}),
);

export const defaultThemeName = 'dark';

export function getTheme(name = defaultThemeName) {
  return themeRegistry[name]?.theme ?? themeRegistry[defaultThemeName].theme;
}

export default getTheme();
