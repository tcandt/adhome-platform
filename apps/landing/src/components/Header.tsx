import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

interface HeaderProps {
  currentPath: '/' | '/phong-trong';
  onNavigate: (path: '/' | '/phong-trong', hash?: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ currentPath, onNavigate }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { label: 'Trang chủ', path: '/' as const, hash: '#trang-chu' },
    { label: 'Phòng cho thuê', path: '/' as const, hash: '#phong-dang-trong' },
    { label: 'Phòng sắp có', path: '/' as const, hash: '#phong-sap-co' },
    { label: 'Về AdHome', path: '/' as const, hash: '#ve-adhome' },
    { label: 'Liên hệ', path: '/' as const, hash: '#lien-he' },
  ];

  const handleNavClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    path: '/' | '/phong-trong',
    hash?: string
  ) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    onNavigate(path, hash);
  };

  return (
    <header className="sticky top-0 z-40 bg-canvas-pure/95 backdrop-blur-sm border-b border-line">
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
              currentPath === '/phong-trong' && item.hash === '#phong-dang-trong';
            return (
              <a
                key={item.label}
                href={item.hash || item.path}
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
            href="#phong-dang-trong"
            onClick={(e) => handleNavClick(e, '/', '#phong-dang-trong')}
            className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors"
          >
            Xem phòng trống
          </a>
        </div>

        {/* Mobile Header Right: Quick Room Link + Drawer Toggle */}
        <div className="flex md:hidden items-center gap-2">
          <a
            href="#phong-dang-trong"
            onClick={(e) => handleNavClick(e, '/', '#phong-dang-trong')}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-brand-600"
          >
            Xem phòng
          </a>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="p-2 rounded-lg border border-line text-ink hover:bg-canvas-warm transition-colors"
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

      {/* Dedicated Mobile Navigation Sheet */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="md:hidden bg-canvas-pure border-b border-line overflow-hidden"
          >
            <nav
              aria-label="Điều hướng di động"
              className="px-4 pt-2 pb-5 space-y-1"
            >
              {navItems.map((item) => (
                <a
                  key={item.label}
                  href={item.hash || item.path}
                  onClick={(e) => handleNavClick(e, item.path, item.hash)}
                  className="block px-3 py-3 rounded-lg text-base font-medium text-ink hover:bg-canvas-warm"
                >
                  {item.label}
                </a>
              ))}
              <div className="pt-3 border-t border-line">
                <a
                  href="/phong-trong"
                  onClick={(e) => handleNavClick(e, '/phong-trong')}
                  className="block w-full py-3 px-4 rounded-lg text-center text-sm font-semibold text-white bg-brand-600"
                >
                  Xem toàn bộ danh sách phòng
                </a>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};
