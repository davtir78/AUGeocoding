import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './amplify-config'; // Must be before App to configure Amplify
import './index.css';
import App from './App.tsx';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import theme from './theme';
import { Buffer } from 'buffer';

// Polyfill for Buffer
(window as any).Buffer = Buffer;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>,
);
