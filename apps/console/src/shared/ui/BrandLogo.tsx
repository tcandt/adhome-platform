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
    const iconSize = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-12 h-12' : 'w-10 h-10';
    return (
      <div className={`relative flex items-center justify-center ${iconSize} ${className}`}>
        <img
          src="/brand/adhome-icon.svg"
          alt="AdHome Icon"
          className="w-full h-full object-contain filter drop-shadow-sm select-none transition-transform duration-150 hover:scale-105"
        />
      </div>
    );
  }

  if (variant === 'stacked') {
    return (
      <div className={`flex flex-col items-center justify-center ${className}`}>
        <img
          src="/brand/adhome-logo-stacked.svg"
          alt="AdHome"
          className="w-44 h-auto object-contain select-none filter drop-shadow-sm"
        />
      </div>
    );
  }

  // Default horizontal
  const fullLogoHeight = size === 'sm' ? 'h-8' : size === 'lg' ? 'h-12' : 'h-10';

  return (
    <div className={`relative flex items-center overflow-hidden transition-all duration-200 ${className}`}>
      <img
        src={isDark ? '/brand/adhome-logo-full-dark.svg' : '/brand/adhome-logo-full.svg'}
        alt="AdHome — Smart Property Management"
        className={`${fullLogoHeight} w-auto max-w-[210px] object-contain select-none`}
      />
    </div>
  );
};
