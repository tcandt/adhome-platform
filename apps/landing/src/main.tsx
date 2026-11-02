import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppMotionProvider } from './motionPreference';
import './index.css';
import App from './App';
import { initRealUserMonitoring } from './services/rumService';

initRealUserMonitoring();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppMotionProvider>
      <App />
    </AppMotionProvider>
  </StrictMode>
);



