import React, { useEffect, useState } from 'react';
import { useAuth } from '@/app/providers/AuthContext';
import { usePortfolio } from '@/app/providers/PortfolioContext';
import { usePresentationMode } from '@/shared/hooks/usePresentationMode';
import { DesktopShell } from '@/presentation/desktop/layouts/DesktopShell';
import { MobileShell } from '@/presentation/mobile/layouts/MobileShell';
import { LoginPage } from '@/presentation/auth/LoginPage';
import { LogoFillLoader } from '@/shared/ui/LogoFillLoader';

export default function App() {
  const { isAuthenticated, isLoading, refreshSession } = useAuth();
  const { syncStatus, syncError, lastSyncedAt, refreshPortfolio } = usePortfolio();
  const { mode } = usePresentationMode();

  const [bootProgress, setBootProgress] = useState(25);
  const [isBootComplete, setIsBootComplete] = useState(false);

  // Synchronize boot stages with live measurable backend network events (UI-12)
  useEffect(() => {
    if (isLoading) {
      setBootProgress(30);
      return;
    }

    if (!isAuthenticated) {
      // Unauthenticated: transition to login
      setBootProgress(100);
      return;
    }

    // Authenticated: track portfolio bootstrap synchronization
    if (syncStatus === 'loading' && !lastSyncedAt) {
      setBootProgress(70);
    } else if (lastSyncedAt || syncStatus === 'idle') {
      setBootProgress(100);
    }
  }, [isLoading, isAuthenticated, syncStatus, lastSyncedAt]);

  // Keep canonical `/login` vs `/` path synchronized with live server auth state
  useEffect(() => {
    if (isLoading || typeof window === 'undefined') return;
    if (!isAuthenticated) {
      if (window.location.pathname !== '/login') {
        window.history.replaceState({}, '', '/login');
      }
    } else if (window.location.pathname === '/login') {
      window.history.replaceState({}, '', '/');
    }
  }, [isAuthenticated, isLoading]);

  // Re-validate session when tab regains focus so permission changes / revocations apply immediately
  useEffect(() => {
    if (!isAuthenticated || typeof window === 'undefined') return;
    const handleFocus = () => {
      void refreshSession();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [isAuthenticated, refreshSession]);

  return (
    <>
      {!isAuthenticated ? (
        <LoginPage />
      ) : mode === 'desktop' ? (
        <DesktopShell />
      ) : (
        <MobileShell />
      )}

      {/* Hero Shared-Element Docking Logo Fill Loader Overlay */}
      {!isBootComplete && (
        <LogoFillLoader
          progress={bootProgress}
          error={syncStatus === 'error' ? syncError || 'Lỗi kết nối cơ sở dữ liệu' : null}
          onRetry={() => {
            void refreshSession();
            void refreshPortfolio();
          }}
          onComplete={() => setIsBootComplete(true)}
        />
      )}
    </>
  );
}
