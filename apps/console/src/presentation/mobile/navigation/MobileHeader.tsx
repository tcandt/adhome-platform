import React, { useEffect, useRef, useState } from 'react';
import { Bell, LogOut, Menu, Moon, Search, Sun, X } from 'lucide-react';
import { useNavigation } from '@/app/providers/NavigationContext';
import { usePortfolio } from '@/app/providers/PortfolioContext';
import { useAuth } from '@/app/providers/AuthContext';
import { useTheme } from '@/app/providers/ThemeContext';
import { BuildingScopeSelector } from '@/shared/ui/BuildingScopeSelector';

export const MobileHeader: React.FC<{ onOpenDrawer: () => void }> = ({ onOpenDrawer }) => {
  const { currentNavConfig, activeSubBreadcrumb, setIsSearchOpen, isNotificationsOpen, setIsNotificationsOpen } = useNavigation();
  const { notifications, unreadNotificationsCount, markNotificationsRead } = usePortfolio();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [profileOpen, setProfileOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const open = profileOpen || isNotificationsOpen;
  const close = () => { setProfileOpen(false); setIsNotificationsOpen(false); };
  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement as HTMLElement;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector<HTMLElement>('button')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setProfileOpen(false); setIsNotificationsOpen(false); }
      if (event.key === 'Tab') {
        const nodes = panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input');
        if (!nodes?.length) return;
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', keydown); returnFocus.current?.focus(); };
  }, [open, setIsNotificationsOpen]);
  const iconButton = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-600 active:bg-slate-100 dark:text-slate-300 dark:active:bg-slate-800';
  const mobileTabLabel = activeSubBreadcrumb || currentNavConfig.shortMobileLabel;
  return <>
    <header data-testid="console-mobile-header" className="fixed inset-x-0 top-0 z-30 flex h-[calc(4rem+env(safe-area-inset-top,0px))] items-center gap-1 border-b border-slate-200/80 bg-white/95 px-2 backdrop-blur-md dark:border-slate-800 dark:bg-[#111827]/95" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <button type="button" data-testid="console-mobile-menu-trigger" aria-label="Mở menu điều hướng" aria-haspopup="dialog" onClick={onOpenDrawer} className={iconButton}><Menu className="h-5 w-5" /></button>
      <h1 data-testid="console-mobile-header-title" className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900 dark:text-slate-100">{mobileTabLabel}</h1>
      {currentNavConfig.supportsBuildingScope && <BuildingScopeSelector compact />}
      <button type="button" data-testid="console-mobile-search-trigger" onClick={() => setIsSearchOpen(true)} aria-label="Tìm kiếm" className={iconButton}><Search className="h-5 w-5" /></button>
      <button type="button" data-testid="console-mobile-notifications-trigger" onClick={() => { setProfileOpen(false); setIsNotificationsOpen(true); }} aria-label={`Thông báo${unreadNotificationsCount ? `, ${unreadNotificationsCount} chưa đọc` : ''}`} aria-haspopup="dialog" aria-expanded={isNotificationsOpen} className={`${iconButton} relative`}><Bell className="h-5 w-5" />{unreadNotificationsCount > 0 && <span className="absolute right-1 top-1 rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">{unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}</span>}</button>
      <button type="button" data-testid="console-mobile-avatar" onClick={() => { setIsNotificationsOpen(false); setProfileOpen(true); }} aria-label="Mở hồ sơ tài khoản" aria-haspopup="dialog" aria-expanded={profileOpen} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-4 border-white bg-blue-100 text-sm font-bold text-blue-800 dark:border-slate-900 dark:bg-blue-950 dark:text-blue-200">{user?.name?.trim().split(/\s+/).slice(-2).map(n => n[0]).join('').toUpperCase() || 'AD'}</button>
    </header>
    {open && <div className="fixed inset-0 z-50 flex items-end bg-slate-950/50 p-2 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="mobile-header-panel-title" className="max-h-[80dvh] w-full overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-800 dark:bg-slate-900" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}>
        <div className="mb-3 flex items-center justify-between"><h2 id="mobile-header-panel-title" className="text-base font-bold">{profileOpen ? 'Hồ sơ tài khoản' : 'Thông báo'}</h2><button type="button" onClick={close} aria-label="Đóng bảng" className={iconButton}><X className="h-5 w-5" /></button></div>
        {profileOpen ? (
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/60">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-200">
                  {user?.name?.trim().split(/\s+/).slice(-2).map(n => n[0]).join('').toUpperCase() || 'AD'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 dark:text-white truncate">{user?.name}</p>
                  <p className="mt-0.5 break-all text-xs text-slate-500 dark:text-slate-400">{user?.email}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200/60 pt-3 dark:border-slate-700/60">
                <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                  {user?.backendRole === 'ADMIN' ? 'Admin · Toàn hệ thống' : 'Quản lý vận hành'}
                </span>
                {user?.organizationName && (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {user.organizationName}
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <button
                type="button"
                onClick={toggleTheme}
                className="flex min-h-[44px] w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 transition-colors"
              >
                <span className="flex items-center gap-3">
                  {theme === 'light' ? <Moon className="h-4 w-4 text-slate-500" /> : <Sun className="h-4 w-4 text-amber-400" />}
                  <span>{theme === 'light' ? 'Chuyển sang nền tối' : 'Chuyển sang nền sáng'}</span>
                </span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800">
                  {theme === 'light' ? 'Sáng' : 'Tối'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  close();
                  void logout();
                }}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-rose-500/10 px-3.5 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-500/20 dark:text-rose-300 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                <span>Đăng xuất</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {unreadNotificationsCount > 0 && (
              <button
                type="button"
                onClick={() => void markNotificationsRead(notifications.filter(n => !n.isRead).map(n => n.key))}
                className="mb-2 min-h-11 text-xs font-semibold text-blue-700 dark:text-blue-300"
              >
                Đánh dấu tất cả đã đọc
              </button>
            )}
            {notifications.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">Không có thông báo mới.</p>
            ) : (
              notifications.map(n => (
                <div key={n.key} className="border-t border-slate-100 py-3 dark:border-slate-800">
                  <p className="text-sm font-semibold">{n.title}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{n.description}</p>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>}
  </>;
};
