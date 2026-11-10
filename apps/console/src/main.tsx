import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppMotionProvider } from './motionPreference';
import App from './App';
import './index.css';
import { ThemeProvider } from '@/app/providers/ThemeContext';
import { AuthProvider } from '@/app/providers/AuthContext';
import { NavigationProvider } from '@/app/providers/NavigationContext';
import { PortfolioProvider } from '@/app/providers/PortfolioContext';
import { SaveToastProvider } from '@/shared/ui/SaveToast';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppMotionProvider>
      <ThemeProvider>
        <AuthProvider>
          <NavigationProvider>
            <SaveToastProvider>
              <PortfolioProvider>
                <App />
              </PortfolioProvider>
            </SaveToastProvider>
          </NavigationProvider>
        </AuthProvider>
      </ThemeProvider>
    </AppMotionProvider>
  </React.StrictMode>
);

