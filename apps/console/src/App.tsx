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
    if (isBootComplete) return;

    if (!isLoading && !isAuthenticated) {
      // Unauthenticated: instantly complete boot to reveal LoginPage
      setBootProgress(100);
      return;
    }

    if (!isLoading && isAuthenticated && lastSyncedAt) {
      // Authenticated & bootstrap data synchronized: hit 100% and dock
      setBootProgress(100);
      return;
    }

    // Dynamic fluid progress interpolation while waiting for network responses (prevents freeze)
    const targetCap = !isLoading && isAuthenticated ? 90 : 45;
    const interval = setInterval(() => {
      setBootProgress((prev) => {
        if (prev >= targetCap) return prev;
        const step = Math.max(1, Math.round((targetCap - prev) * 0.25));
        return Math.min(targetCap, prev + step);
      });
    }, 60);

    return () => clearInterval(interval);
  }, [isLoading, isAuthenticated, lastSyncedAt, isBootComplete]);


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
