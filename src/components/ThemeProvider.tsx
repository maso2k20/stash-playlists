// app/ThemeProvider.tsx
'use client';

import { CssVarsProvider, extendTheme } from '@mui/joy/styles';
import CssBaseline from '@mui/joy/CssBaseline';

const theme = extendTheme({
  colorSchemes: {
    light: {
      palette: {
        // Page background (applied by CssBaseline)
        background: {
          body: '#f8faf',           // soft light gray (matches your earlier choice)
          surface: '#ffffff',        // cards/sheets default
          popup: '#ffffff',
        },
        // Nav / neutral surfaces
        neutral: {
          solidBg: '#eef2f7',
          solidColor: '#0b1220',
          softBg: '#f3f6fb',
          softColor: '#0b1220',
          outlinedBorder: 'rgba(15,23,42,0.12)',
        },
        // Custom primary palette (replacing 'brand' with 'primary')
        primary: {
          solidBg: '#1e66ff',
          solidHoverBg: '#1553d6',
          solidActiveBg: '#1148be',
          solidColor: '#fff',
          softBg: 'rgba(30,102,255,0.08)',
          softColor: '#1e66ff',
          softHoverBg: 'rgba(30,102,255,0.14)',
          outlinedBorder: 'rgba(30,102,255,0.35)',
          outlinedColor: '#1e66ff',
        },
      },
    },
    dark: {
      palette: {
        // Page background (applied by CssBaseline)
        background: {
          body: '#0f172a',           // slate-900 style (not pitch black)
          surface: '#111827',        // slightly lighter for cards/sheets
          popup: '#0b1220',
        },
        // Nav / neutral surfaces (used by <Sheet color="neutral" variant="solid">)
        neutral: {
          solidBg: '#111827',        // nav background (charcoal, not black)
          solidColor: '#e5e7eb',
          softBg: 'rgba(255,255,255,0.04)',
          softColor: '#e5e7eb',
          outlinedBorder: 'rgba(255,255,255,0.12)',
        },
        // Your custom brand palette tuned for dark
        primary: {
          solidBg: '#4c79da',
          solidHoverBg: '#3e66b6',
          solidActiveBg: '#35599f',
          solidColor: '#fff',
          softBg: 'rgba(76,121,218,0.18)',
          softColor: '#cfe0ff',
          softHoverBg: 'rgba(76,121,218,0.26)',
          outlinedBorder: 'rgba(124,159,233,0.45)',
          outlinedColor: '#9bb9ff',
        },
      },
    },
  },
});

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <CssVarsProvider theme={theme} defaultMode="system">
      <CssBaseline />
      {children}
    </CssVarsProvider>
  );
}
