import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { ThemeProvider } from '@/app/providers/ThemeContext';
import { AuthProvider } from '@/app/providers/AuthContext';
import { NavigationProvider } from '@/app/providers/NavigationContext';
import { PortfolioProvider } from '@/app/providers/PortfolioContext';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <NavigationProvider>
          <PortfolioProvider>
            <App />
          </PortfolioProvider>
        </NavigationProvider>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);
