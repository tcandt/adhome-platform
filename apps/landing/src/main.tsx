import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { AppMotionProvider } from './motionPreference';
import './index.css';
import App from './App';
import { initRealUserMonitoring } from './services/rumService';

// Telemetry is optional and must never prevent the public page from mounting.
try { initRealUserMonitoring(); } catch { /* Unsupported browser telemetry. */ }

function BootMounted() {
  useEffect(() => { window.dispatchEvent(new Event('adhome:mounted')); }, []);
  return null;
}

createRoot(document.getElementById('root')!, {
  onUncaughtError: () => { window.dispatchEvent(new Event('adhome:render-error')); },
}).render(
  <StrictMode>
    <AppMotionProvider>
      <App />
      <BootMounted />
    </AppMotionProvider>
  </StrictMode>
);



