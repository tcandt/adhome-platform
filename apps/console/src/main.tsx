import React from 'react';
import ReactDOM from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import App from './App';
import './index.css';
import { ThemeProvider } from '@/app/providers/ThemeContext';
import { AuthProvider } from '@/app/providers/AuthContext';
import { NavigationProvider } from '@/app/providers/NavigationContext';
import { PortfolioProvider } from '@/app/providers/PortfolioContext';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <AuthProvider>
          <NavigationProvider>
            <PortfolioProvider>
              <App />
            </PortfolioProvider>
          </NavigationProvider>
        </AuthProvider>
      </ThemeProvider>
    </MotionConfig>
  </React.StrictMode>
);

