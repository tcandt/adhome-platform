import React, { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthContext';
import { usePresentationMode } from '@/shared/hooks/usePresentationMode';
import { DesktopShell } from '@/presentation/desktop/layouts/DesktopShell';
import { MobileShell } from '@/presentation/mobile/layouts/MobileShell';
import { LoginPage } from '@/presentation/auth/LoginPage';

export default function App() {
  const { isAuthenticated, isLoading, refreshSession } = useAuth();
  const { mode } = usePresentationMode();

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

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center gap-3 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300">
        <Loader2 className="w-6 h-6 animate-spin text-brand-primary" />
        <p className="text-xs font-medium">Đang xác thực phiên làm việc AdHome Console...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return mode === 'desktop' ? <DesktopShell /> : <MobileShell />;
}
