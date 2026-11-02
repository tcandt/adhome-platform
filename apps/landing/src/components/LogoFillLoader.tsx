import React from 'react';
import { RefreshCw } from 'lucide-react';

interface LogoFillLoaderProps {
  progress?: number;
  error?: string | null;
  onRetry?: () => void;
  isExiting?: boolean;
}

export const LogoFillLoader: React.FC<LogoFillLoaderProps> = ({
  progress = 0,
  error = null,
  onRetry,
  isExiting = false,
}) => {
  const clampedProgress = Math.max(0, Math.min(100, progress));

  return (
    <div
      data-testid="adhome-logo-fill-loader"
      className={`fixed inset-0 z-50 flex min-h-screen w-full flex-col items-center justify-center bg-[#FAF9F6] px-4 select-none transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        isExiting ? 'opacity-0 scale-102 pointer-events-none' : 'opacity-100 scale-100'
      }`}
      role="status"
      aria-live="polite"
      aria-label="AdHome loading"
    >
      <div className="relative flex flex-col items-center justify-center">
        {/* Soft Radial Ambient Aura (inspired by Animate UI mobile loader) */}
        <div
          className="absolute -inset-16 rounded-full blur-2xl transition-all duration-700 ease-out pointer-events-none"
          style={{
            background:
              clampedProgress > 0
                ? 'radial-gradient(circle, rgba(8, 121, 250, 0.12) 0%, rgba(22, 210, 203, 0.08) 40%, transparent 70%)'
                : 'radial-gradient(circle, rgba(148, 163, 184, 0.1) 0%, transparent 65%)',
            opacity: clampedProgress > 0 ? Math.min(1, 0.4 + clampedProgress / 140) : 0.35,
          }}
          aria-hidden="true"
        />

        {/* Logo Container with Smooth Spring Scale Motion */}
        <div
          className="relative w-28 h-28 sm:w-32 sm:h-32 transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{
            transform:
              clampedProgress >= 100
                ? 'scale(1.02)'
                : `scale(${0.96 + (clampedProgress / 100) * 0.04})`,
          }}
        >
          {/* Layer 1: Elegant Stroke Outline / Silhouette Base (0% state) */}
          <div className="absolute inset-0">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="4 7 90 82"
              className="w-full h-full object-contain"
              aria-hidden="true"
              fill="none"
            >
              <defs>
                <linearGradient id="landing-outline-base" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#CBD5E1" />
                  <stop offset="100%" stopColor="#94A3B8" />
                </linearGradient>
              </defs>
              <path
                d="M60 14.5C60 9.2 64.7 7.5 68.5 10.3L77.5 17C80.3 19 81 21.3 81 25V71.7C81 76.7 77.5 80.3 72.5 80.3H60V14.5Z"
                stroke="url(#landing-outline-base)"
                strokeWidth="1.8"
                strokeLinejoin="round"
                className="opacity-45"
              />
              <path
                d="M77.5 26L88.5 33.4C91.4 35.4 92 37.5 92 41V70.2C92 76.2 87.5 80.3 81.5 80.3H77.5V26Z"
                stroke="url(#landing-outline-base)"
                strokeWidth="1.8"
                strokeLinejoin="round"
                className="opacity-45"
              />
              <path
                d="M6 45.2C6 41.2 7.7 38.4 11.4 35.4L41 11.3C44.5 8.45 47.4 8.45 50.7 11.1L64.6 22.35C71.8 28.2 74 32.8 74 40.4V70.5H61V44.7C61 41.7 60.4 40.4 58 38.5L47.7 29.9C46 28.5 44.9 28.6 43.3 29.9L23.8 46.1C21.8 47.8 21 49.4 21 52V80.3H14.4C9 80.3 6 77.4 6 72V45.2Z"
                stroke="url(#landing-outline-base)"
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
                stroke="url(#landing-outline-base)"
                strokeWidth="1.5"
                className="opacity-45"
              />
              <rect
                x="45.1"
                y="46"
                width="8.3"
                height="8.3"
                rx="2"
                stroke="url(#landing-outline-base)"
                strokeWidth="1.5"
                className="opacity-45"
              />
              <rect
                x="34.5"
                y="56.5"
                width="8.3"
                height="8.3"
                rx="2"
                stroke="url(#landing-outline-base)"
                strokeWidth="1.5"
                className="opacity-45"
              />
              <rect
                x="45.1"
                y="56.5"
                width="8.3"
                height="8.3"
                rx="2"
                stroke="url(#landing-outline-base)"
                strokeWidth="1.5"
                className="opacity-45"
              />
              <path
                d="M21.4 68.8C29.4 63.2 39.1 62 49.5 64.7C59.6 67.3 70 74.9 79.5 77C83.5 77.9 87.5 77.8 92.7 74.7C87.9 84.5 76.5 88.5 65.8 85.9C50.9 82.3 37.7 70.9 21.4 68.8Z"
                stroke="url(#landing-outline-base)"
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
              clipPath: `inset(${100 - clampedProgress}% 0% 0% 0%)`,
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="4 7 90 82"
              className="w-full h-full object-contain filter drop-shadow-md"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="landing-loader-roof" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#28B7FF" />
                  <stop offset="44%" stopColor="#0879FA" />
                  <stop offset="100%" stopColor="#0750D8" />
                </linearGradient>
                <linearGradient id="landing-loader-tower" x1="0" y1="0" x2="0.9" y2="1">
                  <stop offset="0%" stopColor="#16D2CB" />
                  <stop offset="100%" stopColor="#009B9F" />
                </linearGradient>
                <linearGradient id="landing-loader-front" x1="0" y1="0" x2="0.7" y2="1">
                  <stop offset="0%" stopColor="#0CCBC4" />
                  <stop offset="100%" stopColor="#088C94" />
                </linearGradient>
                <linearGradient id="landing-loader-flow" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#0453D9" />
                  <stop offset="42%" stopColor="#058BF3" />
                  <stop offset="100%" stopColor="#00C4D8" />
                </linearGradient>
              </defs>
              <path
                d="M60 14.5C60 9.2 64.7 7.5 68.5 10.3L77.5 17C80.3 19 81 21.3 81 25V71.7C81 76.7 77.5 80.3 72.5 80.3H60V14.5Z"
                fill="url(#landing-loader-tower)"
              />
              <path
                d="M77.5 26L88.5 33.4C91.4 35.4 92 37.5 92 41V70.2C92 76.2 87.5 80.3 81.5 80.3H77.5V26Z"
                fill="url(#landing-loader-front)"
              />
              <path
                d="M6 45.2C6 41.2 7.7 38.4 11.4 35.4L41 11.3C44.5 8.45 47.4 8.45 50.7 11.1L64.6 22.35C71.8 28.2 74 32.8 74 40.4V70.5H61V44.7C61 41.7 60.4 40.4 58 38.5L47.7 29.9C46 28.5 44.9 28.6 43.3 29.9L23.8 46.1C21.8 47.8 21 49.4 21 52V80.3H14.4C9 80.3 6 77.4 6 72V45.2Z"
                fill="url(#landing-loader-roof)"
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
                fill="url(#landing-loader-flow)"
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
  );
};
