import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppMotionProvider } from './motionPreference';
import './index.css';
import App from './App';
import { initRealUserMonitoring } from './services/rumService';

// Telemetry is optional and must never prevent the public page from mounting.
try { initRealUserMonitoring(); } catch { /* Unsupported browser telemetry. */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppMotionProvider>
      <App />
    </AppMotionProvider>
  </StrictMode>
);



