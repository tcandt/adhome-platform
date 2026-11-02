import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

export interface LogoFillLoaderProps {
  progress?: number;
  error?: string | null;
  onRetry?: () => void;
  onComplete?: () => void;
  targetSelector?: string;
  isExiting?: boolean;
}

export const LogoFillLoader: React.FC<LogoFillLoaderProps> = ({
  progress = 0,
  error = null,
  onRetry,
  onComplete,
  targetSelector = '[data-testid~="header-brand-logo-img"], [data-testid="header-brand-logo-img"], [data-testid="brand-logo-icon-img"], [data-testid="brand-logo-horizontal"]',
  isExiting = false,
}) => {
  const clampedProgress = Math.max(0, Math.min(100, progress));
  const logoContainerRef = useRef<HTMLDivElement | null>(null);
  const [isDocking, setIsDocking] = useState<boolean>(false);
  const [dockStyle, setDockStyle] = useState<React.CSSProperties | null>(null);
  const dockingTriggeredRef = useRef<boolean>(false);

  // Trigger docking flight when progress hits 100% or isExiting is requested
  useEffect(() => {
    if ((clampedProgress >= 100 || isExiting) && !dockingTriggeredRef.current && !error) {
      dockingTriggeredRef.current = true;

      // Brief settling pause (140ms) so user perceives the 100% full vibrant logo
      const timer = setTimeout(() => {
        try {
          const sourceEl = logoContainerRef.current;
          if (!sourceEl) {
            setIsDocking(true);
            onComplete?.();
            return;
          }

          const sourceRect = sourceEl.getBoundingClientRect();

          // 1. Measure real target position in DOM
          const targetEl = document.querySelector(targetSelector);
          let targetRect: { left: number; top: number; width: number; height: number };

          if (targetEl) {
            const r = targetEl.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
              targetRect = { left: r.left, top: r.top, width: r.width, height: r.height };
            } else {
              targetRect = computeFallbackTarget();
            }
          } else {
            targetRect = computeFallbackTarget();
          }

          // 2. Compute 3D translation & scale delta to top-left corner
          const sourceCenterX = sourceRect.left + sourceRect.width / 2;
          const sourceCenterY = sourceRect.top + sourceRect.height / 2;
          const targetCenterX = targetRect.left + targetRect.width / 2;
          const targetCenterY = targetRect.top + targetRect.height / 2;

          const deltaX = targetCenterX - sourceCenterX;
          const deltaY = targetCenterY - sourceCenterY;
          const scale = targetRect.width / sourceRect.width;

          setDockStyle({
            transform: `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${scale})`,
            transition: 'transform 780ms cubic-bezier(0.16, 1, 0.3, 1)',
          });
          setIsDocking(true);

          // 3. Complete and unmount after docking animation finishes
          const completeTimer = setTimeout(() => {
            onComplete?.();
          }, 820);

          return () => clearTimeout(completeTimer);
        } catch (err) {
          console.error('[Console LogoFillLoader Error]:', err);
          onComplete?.();
        }
      }, 140);

      return () => clearTimeout(timer);
    }
  }, [clampedProgress, isExiting, error, onComplete, targetSelector]);

  // Safety watchdog: ensure loader never remains on screen longer than 1.5s once progress reaches 100
  useEffect(() => {
    if (clampedProgress >= 100) {
      const watchdog = setTimeout(() => {
        onComplete?.();
      }, 1500);
      return () => clearTimeout(watchdog);
    }
  }, [clampedProgress, onComplete]);

  function computeFallbackTarget() {
    const isMobile = window.innerWidth < 640;
    if (isMobile) {
      return { left: 16, top: 14, width: 36, height: 36 };
    }
    return { left: 24, top: 16, width: 36, height: 36 };
  }

  return (
    <>
      <style>{`
        @keyframes adhomeGentleFloat {
          0%, 100% {
            transform: translateY(0px) scale(0.97);
          }
          50% {
            transform: translateY(-4px) scale(1.015);
          }
        }
        .adhome-float-motion {
          animation: adhomeGentleFloat 3s ease-in-out infinite;
        }
      `}</style>

      {/* Layer 1: Backdrop Overlay — Fades to transparent to reveal page underneath */}
      <div
        className="fixed inset-0 z-40 bg-[#FAF9F6] dark:bg-[#0B0F19] pointer-events-none"
        style={{
          opacity: isDocking ? 0 : 1,
          transition: 'opacity 650ms cubic-bezier(0.16, 1, 0.3, 1) 150ms',
        }}
        aria-hidden="true"
      />

      {/* Layer 2: Flying Logo Stage — Logo stays 100% visible while gliding to corner */}
      <div
        data-testid="adhome-logo-fill-loader"
        className={`fixed inset-0 z-50 flex min-h-screen w-full flex-col items-center justify-center px-4 select-none ${
          isDocking ? 'pointer-events-none' : 'pointer-events-auto'
        }`}
        role="status"
        aria-live="polite"
        aria-label="AdHome loading"
      >
        <div className="relative flex flex-col items-center justify-center">
          {/* Radial Ambient Aura: shrinks and dissolves as logo takes flight */}
          <div
            className="absolute -inset-16 rounded-full blur-2xl pointer-events-none"
            style={{
              background:
                clampedProgress > 0
                  ? 'radial-gradient(circle, rgba(8, 121, 250, 0.16) 0%, rgba(22, 210, 203, 0.1) 40%, transparent 70%)'
                  : 'radial-gradient(circle, rgba(148, 163, 184, 0.1) 0%, transparent 65%)',
              opacity: isDocking ? 0 : clampedProgress > 0 ? Math.min(1, 0.5 + clampedProgress / 120) : 0.35,
              transform: isDocking ? 'scale(0.3)' : 'scale(1)',
              transition: 'opacity 350ms ease-out, transform 450ms ease-out',
            }}
            aria-hidden="true"
          />

          {/* Logo Container: Floating breathing during load -> Smooth Spring Glide into Header */}
          <div
            ref={logoContainerRef}
            className={`relative w-28 h-28 sm:w-32 sm:h-32 will-change-transform ${
              isDocking ? '' : 'adhome-float-motion'
            }`}
            style={
              isDocking && dockStyle
                ? dockStyle
                : {
                    transform:
                      clampedProgress >= 100
                        ? 'scale(1.02)'
                        : `scale(${0.96 + (clampedProgress / 100) * 0.04})`,
                    transition: 'transform 500ms cubic-bezier(0.16, 1, 0.3, 1)',
                  }
            }
          >
            {/* Layer 1: Stroke Outline / Silhouette Base */}
            <div className="absolute inset-0">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="4 7 90 82"
                className="w-full h-full object-contain"
                aria-hidden="true"
                fill="none"
              >
                <defs>
                  <linearGradient id="console-outline-base" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#CBD5E1" />
                    <stop offset="100%" stopColor="#94A3B8" />
                  </linearGradient>
                </defs>
                <path
                  d="M60 14.5C60 9.2 64.7 7.5 68.5 10.3L77.5 17C80.3 19 81 21.3 81 25V71.7C81 76.7 77.5 80.3 72.5 80.3H60V14.5Z"
                  stroke="url(#console-outline-base)"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                  className="opacity-45"
                />
                <path
                  d="M77.5 26L88.5 33.4C91.4 35.4 92 37.5 92 41V70.2C92 76.2 87.5 80.3 81.5 80.3H77.5V26Z"
                  stroke="url(#console-outline-base)"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                  className="opacity-45"
                />
                <path
                  d="M6 45.2C6 41.2 7.7 38.4 11.4 35.4L41 11.3C44.5 8.45 47.4 8.45 50.7 11.1L64.6 22.35C71.8 28.2 74 32.8 74 40.4V70.5H61V44.7C61 41.7 60.4 40.4 58 38.5L47.7 29.9C46 28.5 44.9 28.6 43.3 29.9L23.8 46.1C21.8 47.8 21 49.4 21 52V80.3H14.4C9 80.3 6 77.4 6 72V45.2Z"
                  stroke="url(#console-outline-base)"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                  className="opacity-45"
                />
                <rect
                  x="34.5"
                  y="46"
                  width="8.3"
                  height="8.3"
                  rx="2"
                  stroke="url(#console-outline-base)"
                  strokeWidth="1.5"
                  className="opacity-45"
                />
                <rect
                  x="45.1"
                  y="46"
                  width="8.3"
                  height="8.3"
                  rx="2"
                  stroke="url(#console-outline-base)"
                  strokeWidth="1.5"
                  className="opacity-45"
                />
                <rect
                  x="34.5"
                  y="56.5"
                  width="8.3"
                  height="8.3"
                  rx="2"
                  stroke="url(#console-outline-base)"
                  strokeWidth="1.5"
                  className="opacity-45"
                />
                <rect
                  x="45.1"
                  y="56.5"
                  width="8.3"
                  height="8.3"
                  rx="2"
                  stroke="url(#console-outline-base)"
                  strokeWidth="1.5"
                  className="opacity-45"
                />
                <path
                  d="M21.4 68.8C29.4 63.2 39.1 62 49.5 64.7C59.6 67.3 70 74.9 79.5 77C83.5 77.9 87.5 77.8 92.7 74.7C87.9 84.5 76.5 88.5 65.8 85.9C50.9 82.3 37.7 70.9 21.4 68.8Z"
                  stroke="url(#console-outline-base)"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                  className="opacity-45"
                />
              </svg>
            </div>

            {/* Layer 2: Vibrant Authentic Color Logo Fill with Bottom-to-Top Clip Path */}
            <div
              className="absolute inset-0 transition-all duration-600 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{
                clipPath: `inset(${100 - clampedProgress}% 0% 0%)`,
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="4 7 90 82"
                className="w-full h-full object-contain filter drop-shadow-md"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient id="console-loader-roof" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#0864E5" />
                    <stop offset="100%" stopColor="#0879FA" />
                  </linearGradient>
                  <linearGradient id="console-loader-tower" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0EA5E9" />
                    <stop offset="50%" stopColor="#06B6D4" />
                    <stop offset="100%" stopColor="#059669" />
                  </linearGradient>
                  <linearGradient id="console-loader-flow" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#0879FA" />
                    <stop offset="100%" stopColor="#16D2CB" />
                  </linearGradient>
                </defs>
                <path
                  d="M60 14.5C60 9.2 64.7 7.5 68.5 10.3L77.5 17C80.3 19 81 21.3 81 25V71.7C81 76.7 77.5 80.3 72.5 80.3H60V14.5Z"
                  fill="url(#console-loader-tower)"
                />
                <path
                  d="M77.5 26L88.5 33.4C91.4 35.4 92 37.5 92 41V70.2C92 76.2 87.5 80.3 81.5 80.3H77.5V26Z"
                  fill="url(#console-loader-tower)"
                />
                <path
                  d="M6 45.2C6 41.2 7.7 38.4 11.4 35.4L41 11.3C44.5 8.45 47.4 8.45 50.7 11.1L64.6 22.35C71.8 28.2 74 32.8 74 40.4V70.5H61V44.7C61 41.7 60.4 40.4 58 38.5L47.7 29.9C46 28.5 44.9 28.6 43.3 29.9L23.8 46.1C21.8 47.8 21 49.4 21 52V80.3H14.4C9 80.3 6 77.4 6 72V45.2Z"
                  fill="url(#console-loader-roof)"
                />
                <rect x="34.5" y="46" width="8.3" height="8.3" rx="2" fill="#0864E5" />
                <rect x="45.1" y="46" width="8.3" height="8.3" rx="2" fill="#0864E5" />
                <rect x="34.5" y="56.5" width="8.3" height="8.3" rx="2" fill="#0864E5" />
                <rect x="45.1" y="56.5" width="8.3" height="8.3" rx="2" fill="#0864E5" />
                <rect x="83.3" y="40.8" width="3.9" height="7.3" rx="1.95" fill="#F5FFFE" />
                <rect x="83.3" y="52.2" width="3.9" height="7.3" rx="1.95" fill="#F5FFFE" />
                <rect x="83.3" y="63.6" width="3.9" height="7.3" rx="1.95" fill="#F5FFFE" />
                <path
                  d="M21.4 68.8C29.4 63.2 39.1 62 49.5 64.7C59.6 67.3 70 74.9 79.5 77C83.5 77.9 87.5 77.8 92.7 74.7C87.9 84.5 76.5 88.5 65.8 85.9C50.9 82.3 37.7 70.9 21.4 68.8Z"
                  fill="url(#console-loader-flow)"
                />
              </svg>
            </div>
          </div>

          {/* Minimalist Error Handling (Only rendered if live connection failure occurs) */}
          {error && (
            <div className="flex flex-col items-center gap-2 mt-6 animate-fade-in">
              <span className="text-xs font-medium text-rose-500">{error}</span>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-slate-900 text-white text-xs font-semibold shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Thử lại
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
