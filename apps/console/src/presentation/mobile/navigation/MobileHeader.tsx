import React, { useEffect, useRef, useState } from 'react';
import { Bell, LogOut, Menu, Moon, Search, Sun, X } from 'lucide-react';
import { useNavigation } from '@/app/providers/NavigationContext';
import { usePortfolio } from '@/app/providers/PortfolioContext';
import { useAuth } from '@/app/providers/AuthContext';
import { useTheme } from '@/app/providers/ThemeContext';
import { BuildingScopeSelector } from '@/shared/ui/BuildingScopeSelector';

export const MobileHeader: React.FC<{ onOpenDrawer: () => void }> = ({ onOpenDrawer }) => {
  const { currentNavConfig, activeModule, activeSubBreadcrumb, setIsSearchOpen, isNotificationsOpen, setIsNotificationsOpen } = useNavigation();
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
  return <>
    <header data-testid="console-mobile-header" className="sticky top-0 z-30 flex min-h-16 items-center gap-2 border-b border-slate-200/80 bg-white/95 px-3 backdrop-blur-md dark:border-slate-800 dark:bg-[#111827]/95" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <button type="button" data-testid="console-mobile-menu-trigger" aria-label="Mở menu điều hướng" aria-haspopup="dialog" onClick={onOpenDrawer} className={iconButton}><Menu className="h-5 w-5" /></button>
      <button type="button" data-testid="console-mobile-search-trigger" onClick={() => setIsSearchOpen(true)} aria-label="Tìm kiếm" className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl bg-slate-100 px-3 text-left text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400"><Search className="h-4 w-4 shrink-0" /><span className="truncate">Tìm kiếm…</span></button>
      <button type="button" data-testid="console-mobile-notifications-trigger" onClick={() => { setProfileOpen(false); setIsNotificationsOpen(true); }} aria-label={`Thông báo${unreadNotificationsCount ? `, ${unreadNotificationsCount} chưa đọc` : ''}`} aria-haspopup="dialog" aria-expanded={isNotificationsOpen} className={`${iconButton} relative`}><Bell className="h-5 w-5" />{unreadNotificationsCount > 0 && <span className="absolute right-1 top-1 rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">{unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}</span>}</button>
      <button type="button" data-testid="console-mobile-avatar" onClick={() => { setIsNotificationsOpen(false); setProfileOpen(true); }} aria-label="Mở hồ sơ tài khoản" aria-haspopup="dialog" aria-expanded={profileOpen} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-4 border-white bg-blue-100 text-sm font-bold text-blue-800 dark:border-slate-900 dark:bg-blue-950 dark:text-blue-200">{user?.name?.trim().split(/\s+/).slice(-2).map(n => n[0]).join('').toUpperCase() || 'AD'}</button>
    </header>
    {activeModule !== 'overview' && <div className="space-y-3 px-4 pt-4"><h1 className="text-lg font-bold">{activeSubBreadcrumb || currentNavConfig.label}</h1>{currentNavConfig.supportsBuildingScope && <BuildingScopeSelector className="mobile-overview-scope w-full" />}</div>}
    {open && <div className="fixed inset-0 z-50 flex items-end bg-slate-950/50 p-2 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="mobile-header-panel-title" className="max-h-[80dvh] w-full overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-800 dark:bg-slate-900" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}>
        <div className="mb-3 flex items-center justify-between"><h2 id="mobile-header-panel-title" className="text-base font-bold">{profileOpen ? 'Hồ sơ tài khoản' : 'Thông báo'}</h2><button type="button" onClick={close} aria-label="Đóng bảng" className={iconButton}><X className="h-5 w-5" /></button></div>
        {profileOpen ? <div className="space-y-3">
          <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800"><p className="font-semibold">{user?.name}</p><p className="mt-1 break-all text-sm text-slate-500 dark:text-slate-400">{user?.email}</p><p className="mt-2 text-xs text-blue-700 dark:text-blue-300">{user?.backendRole === 'ADMIN' ? 'Admin · Toàn hệ thống' : 'Tài khoản quản lý'}</p></div>
          <button onClick={toggleTheme} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">{theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}{theme === 'light' ? 'Chuyển sang nền tối' : 'Chuyển sang nền sáng'}</button>
          <button onClick={() => { close(); void logout(); }} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950"><LogOut className="h-4 w-4" />Đăng xuất</button>
        </div> : <>
          {unreadNotificationsCount > 0 && <button onClick={() => void markNotificationsRead(notifications.filter(n => !n.isRead).map(n => n.key))} className="mb-2 min-h-11 text-xs font-semibold text-blue-700 dark:text-blue-300">Đánh dấu tất cả đã đọc</button>}
          {notifications.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">Không có thông báo mới.</p> : notifications.map(n => <div key={n.key} className="border-t border-slate-100 py-3 dark:border-slate-800"><p className="text-sm font-semibold">{n.title}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{n.description}</p></div>)}
        </>}
      </div>
    </div>}
  </>;
};
