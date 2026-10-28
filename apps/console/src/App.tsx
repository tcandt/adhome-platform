import React from 'react';
import { useAuth } from '@/app/providers/AuthContext';
import { usePresentationMode } from '@/shared/hooks/usePresentationMode';
import { DesktopShell } from '@/presentation/desktop/layouts/DesktopShell';
import { MobileShell } from '@/presentation/mobile/layouts/MobileShell';
import { LoginPage } from '@/presentation/auth/LoginPage';

export default function App() {
  const { isAuthenticated } = useAuth();
  const { mode } = usePresentationMode();

  // If user is not authenticated, show universal Login page
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // Independent presentation implementations for desktop vs mobile
  return mode === 'desktop' ? <DesktopShell /> : <MobileShell />;
}
