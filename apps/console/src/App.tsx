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

  const [bootProgress, setBootProgress] = useState(30);
  const [bootStage, setBootStage] = useState('Đang xác thực phiên làm việc Quản trị viên...');
  const [isBootReady, setIsBootReady] = useState(false);

  // Synchronize boot stages with live measurable backend network events (UI-12)
  useEffect(() => {
    if (isLoading) {
      setBootProgress(35);
      setBootStage('Đang xác thực phiên làm việc Quản trị viên...');
      return;
    }

    if (!isAuthenticated) {
      // Unauthenticated: instant transition to login
      setBootProgress(100);
      setBootStage('Chuyển hướng màn hình Đăng nhập...');
      setIsBootReady(true);
      return;
    }

    // Authenticated: track portfolio bootstrap synchronization
    if (syncStatus === 'loading' && !lastSyncedAt) {
      setBootProgress(75);
      setBootStage('Đang đồng bộ cơ sở dữ liệu & danh mục tòa nhà...');
    } else if (lastSyncedAt || syncStatus === 'idle') {
      setBootProgress(100);
      setBootStage('Hoàn tất! Sẵn sàng vận hành AdHome Console.');
      const timer = setTimeout(() => {
        setIsBootReady(true);
      }, 160);
      return () => clearTimeout(timer);
    } else if (syncStatus === 'error') {
      setBootStage('Không thể đồng bộ dữ liệu hệ thống.');
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

  // Display authentic AdHome Logo Fill Loader 0→100 while booting (UI-12 & UI-13)
  if (!isBootReady) {
    return (
      <LogoFillLoader
        progress={bootProgress}
        statusText={bootStage}
        error={syncStatus === 'error' ? syncError || 'Lỗi kết nối cơ sở dữ liệu' : null}
        onRetry={() => {
          void refreshSession();
          void refreshPortfolio();
        }}
        brandTitle="AdHome"
        subtitle="Hệ thống Vận hành & Quản lý Căn hộ Dịch vụ"
      />
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return mode === 'desktop' ? <DesktopShell /> : <MobileShell />;
}
