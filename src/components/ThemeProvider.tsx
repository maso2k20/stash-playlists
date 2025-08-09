// app/ThemeProvider.tsx
'use client';

import { CssVarsProvider, extendTheme } from '@mui/joy/styles';
import CssBaseline from '@mui/joy/CssBaseline';

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = extendTheme({
    colorSchemes: {
      light: { palette: { background: { body: '#f8fafc' } } },
      dark:  { palette: { background: { body: '#0b1220' } } },
    },
  });

  return (
    <CssVarsProvider theme={theme} defaultMode="system">
      <CssBaseline />
      {children}
    </CssVarsProvider>
  );
}
