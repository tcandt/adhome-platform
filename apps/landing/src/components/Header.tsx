import React, { useState } from 'react';
import {
  Phone,
  MapPin,
  Menu,
  X,
  CalendarCheck,
  ExternalLink,
  Building2,
} from 'lucide-react';

interface HeaderProps {
  availableCount: number;
  comingSoonCount: number;
  onOpenInquiry: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  availableCount,
  comingSoonCount,
  onOpenInquiry,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { label: 'Trang chủ', href: '#trang-chu' },
    {
      label: 'Phòng đang trống',
      href: '#phong-dang-trong',
      badge: availableCount,
      badgeTone: 'available' as const,
    },
    {
      label: 'Phòng sắp có',
      href: '#phong-sap-co',
      badge: comingSoonCount,
      badgeTone: 'coming' as const,
    },
    { label: 'Tiện ích & Nội thất', href: '#tien-ich' },
    { label: 'Hình ảnh thực tế', href: '#bo-suu-tap' },
    { label: 'Nền tảng AdHome', href: '#nen-tang-adhome' },
    { label: 'Vị trí & FAQ', href: '#vi-tri-khu-vuc' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-canvas-pure/95 backdrop-blur-sm border-b border-line">
      {/* Top micro location bar */}
      <div className="bg-brand-navy text-white text-xs py-2 px-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-brand-200 shrink-0" />
            <span className="font-medium">
              Khu đô thị Ân Phú, Phường Tân An, Đắk Lắk
            </span>
            <span className="hidden sm:inline text-white/40">|</span>
            <span className="hidden sm:inline text-white/80">
              Hệ thống 4 tòa căn hộ dịch vụ Studio · 1PN · 2PN full nội thất
            </span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="tel:0905889123"
              className="inline-flex items-center gap-1.5 text-white/90 hover:text-white font-medium"
            >
              <Phone className="w-3.5 h-3.5 text-brand-200" />
              <span>Hotline / Zalo: 0905 889 123</span>
            </a>
            <span className="hidden md:inline text-white/30">|</span>
            <a
              href="https://console-adhome.ductinh.one"
              target="_blank"
              rel="noreferrer"
              className="hidden md:inline-flex items-center gap-1 text-white/75 hover:text-white transition-colors"
            >
              <span>AdHome Console</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      {/* Main navigation bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-4">
        {/* Brand Logo */}
        <a
          href="#trang-chu"
          className="flex items-center gap-3 group focus:outline-none"
          aria-label="AdHome — Trang chủ Căn hộ dịch vụ Khu đô thị Ân Phú"
        >
          <img
            src="/brand/adhome-icon.svg"
            alt="Logo AdHome"
            className="w-10 h-10 sm:w-11 sm:h-11 object-contain"
          />
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-xl sm:text-2xl font-bold tracking-tight text-ink">
                AdHome
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-canvas-warm text-ink-secondary border border-line">
                Ân Phú
              </span>
            </div>
            <span className="text-xs text-ink-muted">
              Căn hộ dịch vụ Tân An, Đắk Lắk
            </span>
          </div>
        </a>

        {/* Desktop Nav Links */}
        <nav
          aria-label="Điều hướng chính"
          className="hidden xl:flex items-center gap-1"
        >
          {navLinks.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="px-3 py-2 rounded-md text-sm font-medium text-ink-secondary hover:text-ink hover:bg-canvas-warm transition-colors inline-flex items-center gap-1.5"
            >
              <span>{item.label}</span>
              {typeof item.badge === 'number' && (
                <span
                  className={`text-xs font-semibold px-1.5 py-0.5 rounded tabular-nums ${
                    item.badgeTone === 'available'
                      ? 'bg-status-availableBg text-status-availableText border border-status-availableBorder'
                      : 'bg-status-comingBg text-status-comingText border border-status-comingBorder'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </a>
          ))}
        </nav>

        {/* Desktop CTA Buttons */}
        <div className="hidden sm:flex items-center gap-2.5">
          <a
            href="#phong-dang-trong"
            className="px-4 py-2.5 rounded-lg text-sm font-medium text-ink bg-canvas-warm hover:bg-canvas-muted border border-line transition-colors"
          >
            Xem phòng trống ({availableCount})
          </a>
          <button
            type="button"
            onClick={onOpenInquiry}
            className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors inline-flex items-center gap-2 shadow-subtle"
          >
            <CalendarCheck className="w-4 h-4" />
            <span>Hẹn xem phòng</span>
          </button>
        </div>

        {/* Mobile menu button */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="xl:hidden p-2.5 rounded-lg border border-line text-ink hover:bg-canvas-warm transition-colors"
          aria-expanded={mobileMenuOpen}
          aria-label="Mở menu điều hướng"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="xl:hidden bg-canvas-pure border-t border-line px-4 pt-3 pb-6 shadow-cardHover">
          <div className="flex flex-col space-y-1">
            {navLinks.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className="px-3.5 py-3 rounded-lg text-base font-medium text-ink hover:bg-canvas-warm flex items-center justify-between"
              >
                <span>{item.label}</span>
                {typeof item.badge === 'number' && (
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded tabular-nums ${
                      item.badgeTone === 'available'
                        ? 'bg-status-availableBg text-status-availableText border border-status-availableBorder'
                        : 'bg-status-comingBg text-status-comingText border border-status-comingBorder'
                    }`}
                  >
                    {item.badge} phòng
                  </span>
                )}
              </a>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-line grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <a
              href="#phong-dang-trong"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full py-3 px-4 rounded-lg text-center text-sm font-semibold text-ink bg-canvas-warm border border-line"
            >
              Xem {availableCount} phòng đang trống
            </a>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenInquiry();
              }}
              className="w-full py-3 px-4 rounded-lg text-center text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700"
            >
              Đặt lịch hẹn xem phòng
            </button>
          </div>

          <div className="mt-4 pt-3 border-t border-line flex items-center justify-between text-xs text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" />
              KĐT Ân Phú, P. Tân An, Đắk Lắk
            </span>
            <a
              href="https://console-adhome.ductinh.one"
              target="_blank"
              rel="noreferrer"
              className="text-brand-600 font-medium inline-flex items-center gap-1"
            >
              <span>Hệ thống Console</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}
    </header>
  );
};
