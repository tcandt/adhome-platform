import React from 'react';
import { BrandWordmark } from './BrandWordmark';
import { BrandMark } from './BrandMark';

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

  if (variant === 'icon-only' || collapsed) {
    const iconSize =
      size === 'sm' ? 'w-7 h-7' : size === 'lg' ? 'w-11 h-11' : 'w-9 h-9';
    return (
      <div
        className={`relative flex shrink-0 items-center justify-center ${iconSize} ${className}`}
        data-brand-dock="console-icon"
        data-testid="brand-logo-icon"
      >
        <BrandMark testId="brand-logo-icon-img header-brand-logo-img" className="h-full w-full shrink-0 select-none" />
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

  const iconSize = size === 'sm' ? 'h-7 w-7' : size === 'lg' ? 'h-11 w-11' : 'h-9 w-9';
  return (
    <div className={`relative flex shrink-0 items-center gap-2.5 ${className}`}
      data-brand-dock="console-horizontal" data-testid="brand-logo-horizontal">
      <BrandMark decorative className={`${iconSize} shrink-0 select-none`} />
      <BrandWordmark className={size === 'sm' ? 'h-auto w-[94px]' : size === 'lg' ? 'h-auto w-[125px]' : 'h-auto w-[110px]'} />
    </div>
  );
};
