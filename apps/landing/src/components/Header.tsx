import React, { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

interface HeaderProps {
  currentPath: string;
  onNavigate: (path: string, hash?: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ currentPath, onNavigate }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileMenuOpen]);

  const navItems = [
    { label: 'Trang chủ', path: '/', hash: '#trang-chu' },
    { label: 'Phòng cho thuê', path: '/phong-trong', hash: undefined },
    { label: 'Phòng sắp có', path: '/', hash: '#phong-sap-co' },
    { label: 'Về AdHome', path: '/', hash: '#ve-adhome' },
    { label: 'Liên hệ', path: '/', hash: '#lien-he' },
  ];

  const handleNavClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    path: string,
    hash?: string
  ) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    onNavigate(path, hash);
  };

  return (
    <header className="sticky top-0 z-40 bg-canvas-pure/95 border-b border-line">
      <div className="max-w-[1220px] mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-6">
        {/* Brand Logo — generous spacing, never squeezed */}
        <a
          href="/"
          onClick={(e) => handleNavClick(e, '/', '#trang-chu')}
          className="flex items-center gap-3 shrink-0 focus:outline-none"
          aria-label="AdHome — Trang chủ"
        >
          <img
            src="/brand/adhome-icon.svg"
            alt="AdHome"
            width={40}
            height={40}
            className="w-9 h-9 sm:w-10 sm:h-10 object-contain"
          />
          <div className="flex flex-col">
            <span className="text-lg sm:text-xl font-bold tracking-tight text-ink leading-none">
              AdHome
            </span>
            <span className="text-[11px] text-ink-muted mt-1 leading-none">
              KĐT Ân Phú · Đắk Lắk
            </span>
          </div>
        </a>

        {/* Desktop Navigation — 5 concise items */}
        <nav
          aria-label="Điều hướng chính"
          className="hidden md:flex items-center gap-7 lg:gap-8"
        >
          {navItems.map((item) => {
            const isActive =
              (item.path === '/phong-trong' &&
                (currentPath.startsWith('/phong-trong') ||
                  currentPath.startsWith('/phong/'))) ||
              (item.path === '/' &&
                item.hash === '#trang-chu' &&
                currentPath === '/');
            return (
              <a
                key={item.label}
                href={item.hash ? `${item.path}${item.hash}` : item.path}
                onClick={(e) => handleNavClick(e, item.path, item.hash)}
                className={`text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'text-brand-600 font-semibold'
                    : 'text-ink-secondary hover:text-ink'
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* Single Prominent CTA on Desktop */}
        <div className="hidden md:flex items-center shrink-0">
          <a
            href="/phong-trong"
            onClick={(e) => handleNavClick(e, '/phong-trong')}
            className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors min-h-[42px] inline-flex items-center"
          >
            Xem phòng trống
          </a>
        </div>

        {/* Mobile Header Right: Single Clean Drawer Toggle (No duplicate CTA above Hero) */}
        <div className="flex md:hidden items-center">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="p-2 rounded-lg border border-line text-ink hover:bg-canvas-warm transition-colors min-h-[40px] min-w-[40px] inline-flex items-center justify-center"
            aria-expanded={mobileMenuOpen}
            aria-label="Menu điều hướng"
          >
            {mobileMenuOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* Dedicated Mobile Navigation Sheet & Backdrop Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              data-testid="mobile-nav-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setMobileMenuOpen(false)}
              aria-hidden="true"
              className="fixed inset-0 top-16 sm:top-20 z-40 bg-ink/60 md:hidden backdrop-blur-[1px]"
            />
            <motion.div
              data-testid="mobile-nav-drawer"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="fixed inset-x-0 top-16 sm:top-20 z-50 md:hidden bg-canvas-pure border-b border-line shadow-modal max-h-[calc(100dvh-4rem)] sm:max-h-[calc(100dvh-5rem)] overflow-y-auto"
            >
              <nav
                aria-label="Điều hướng di động"
                className="px-4 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))] space-y-1"
              >
                {navItems.map((item) => (
                  <a
                    key={item.label}
                    href={item.hash ? `${item.path}${item.hash}` : item.path}
                    onClick={(e) => handleNavClick(e, item.path, item.hash)}
                    className="block px-3 py-3 rounded-lg text-base font-medium text-ink hover:bg-canvas-warm transition-colors"
                  >
                    {item.label}
                  </a>
                ))}
                <div className="pt-3 border-t border-line">
                  <a
                    href="/phong-trong"
                    onClick={(e) => handleNavClick(e, '/phong-trong')}
                    className="block w-full py-3 px-4 rounded-lg text-center text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors"
                  >
                    Xem toàn bộ danh sách phòng
                  </a>
                </div>
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
};
