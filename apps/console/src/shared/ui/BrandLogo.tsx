import React from 'react';
import { useTheme } from '@/app/providers/ThemeContext';

interface BrandLogoProps {
  collapsed?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'horizontal' | 'stacked' | 'icon-only';
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  collapsed = false,
  className = '',
  size = 'md',
  variant = 'horizontal',
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  if (variant === 'icon-only' || collapsed) {
    const iconSize =
      size === 'sm' ? 'w-7 h-7' : size === 'lg' ? 'w-11 h-11' : 'w-9 h-9';
    return (
      <div
        className={`relative flex shrink-0 items-center justify-center ${iconSize} ${className}`}
        data-testid="brand-logo-icon"
      >
        <img
          src="/brand/adhome-icon.svg"
          alt="AdHome"
          data-testid="brand-logo-icon-img"
          className="h-full w-full shrink-0 object-contain select-none"
          draggable={false}
        />
      </div>
    );
  }

  if (variant === 'stacked') {
    return (
      <div
        className={`flex shrink-0 flex-col items-center justify-center ${className}`}
        data-testid="brand-logo-stacked"
      >
        <img
          src="/brand/adhome-logo-stacked.svg"
          alt="AdHome"
          className="h-auto w-40 shrink-0 object-contain select-none"
          draggable={false}
        />
      </div>
    );
  }

  const fullLogoHeight =
    size === 'sm' ? 'h-7' : size === 'lg' ? 'h-11' : 'h-9';

  return (
    <div
      className={`relative flex shrink-0 items-center ${className}`}
      data-testid="brand-logo-horizontal"
    >
      <img
        src={
          isDark
            ? '/brand/adhome-logo-full-dark.svg'
            : '/brand/adhome-logo-full.svg'
        }
        alt="AdHome — Smart Property Management"
        className={`${fullLogoHeight} w-auto max-w-[180px] shrink-0 object-contain select-none`}
        draggable={false}
      />
    </div>
  );
};
