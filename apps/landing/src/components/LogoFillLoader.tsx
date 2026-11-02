import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface LogoFillLoaderProps {
  progress?: number;
  statusText?: string;
  error?: string | null;
  onRetry?: () => void;
  brandTitle?: string;
  subtitle?: string;
}

export const LogoFillLoader: React.FC<LogoFillLoaderProps> = ({
  progress = 0,
  statusText = 'Đang khởi tạo AdHome Platform...',
  error = null,
  onRetry,
  brandTitle = 'AdHome',
  subtitle = 'Căn hộ dịch vụ & Studio cao cấp tại KĐT Ân Phú',
}) => {
  const clampedProgress = Math.max(0, Math.min(100, progress));

  return (
    <div
      data-testid="adhome-logo-fill-loader"
      className="fixed inset-0 z-50 flex min-h-screen w-full flex-col items-center justify-center bg-[#FAF9F6] px-4 select-none transition-colors duration-200"
      role="status"
      aria-live="polite"
      aria-label={`${statusText} ${clampedProgress}%`}
    >
      <div className="flex flex-col items-center max-w-sm w-full text-center">
        {/* AdHome Two-Layer SVG Logo Fill */}
        <div className="relative w-24 h-24 sm:w-28 sm:h-28 mb-5">
          {/* Layer 1: Background Silhouette Track */}
          <div className="absolute inset-0 opacity-15 grayscale brightness-75">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="4 7 90 82"
              className="w-full h-full object-contain"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="landing-bg-roof" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#94A3B8" />
                  <stop offset="1" stopColor="#64748B" />
                </linearGradient>
              </defs>
              <path
                d="M60 14.5C60 9.2 64.7 7.5 68.5 10.3L77.5 17C80.3 19 81 21.3 81 25V71.7C81 76.7 77.5 80.3 72.5 80.3H60V14.5Z"
                fill="url(#landing-bg-roof)"
              />
              <path
                d="M77.5 26L88.5 33.4C91.4 35.4 92 37.5 92 41V70.2C92 76.2 87.5 80.3 81.5 80.3H77.5V26Z"
                fill="url(#landing-bg-roof)"
              />
              <path
                d="M6 45.2C6 41.2 7.7 38.4 11.4 35.4L41 11.3C44.5 8.45 47.4 8.45 50.7 11.1L64.6 22.35C71.8 28.2 74 32.8 74 40.4V70.5H61V44.7C61 41.7 60.4 40.4 58 38.5L47.7 29.9C46 28.5 44.9 28.6 43.3 29.9L23.8 46.1C21.8 47.8 21 49.4 21 52V80.3H14.4C9 80.3 6 77.4 6 72V45.2Z"
                fill="url(#landing-bg-roof)"
              />
              <rect x="34.5" y="46" width="8.3" height="8.3" rx="2" fill="#64748B" />
              <rect x="45.1" y="46" width="8.3" height="8.3" rx="2" fill="#64748B" />
              <rect x="34.5" y="56.5" width="8.3" height="8.3" rx="2" fill="#64748B" />
              <rect x="45.1" y="56.5" width="8.3" height="8.3" rx="2" fill="#64748B" />
              <path
                d="M21.4 68.8C29.4 63.2 39.1 62 49.5 64.7C59.6 67.3 70 74.9 79.5 77C83.5 77.9 87.5 77.8 92.7 74.7C87.9 84.5 76.5 88.5 65.8 85.9C50.9 82.3 37.7 70.9 21.4 68.8Z"
                fill="url(#landing-bg-roof)"
              />
            </svg>
          </div>

          {/* Layer 2: Colored Foreground with Bottom-to-Top Clip Path Fill */}
          <div
            className="absolute inset-0 transition-all duration-300 ease-out"
            style={{
              clipPath: `inset(${100 - clampedProgress}% 0% 0% 0%)`,
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="4 7 90 82"
              className="w-full h-full object-contain filter drop-shadow-sm"
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
                  <stop offset="100%" stopColor="#09CDB8" />
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

        {/* Brand Information */}
        <h2 className="text-base font-extrabold tracking-tight text-slate-900">
          {brandTitle}
        </h2>
        <p className="text-[11px] font-medium text-slate-500 mb-4">
          {subtitle}
        </p>

        {/* Progress Bar & Stage Status */}
        {error ? (
          <div className="flex flex-col items-center gap-2.5 p-3 rounded-xl border border-red-200 bg-red-50/80 text-red-700 w-full">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Thử lại
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center w-full max-w-[260px]">
            {/* Horizontal Track Bar */}
            <div className="w-full h-1.5 rounded-full bg-slate-200/80 overflow-hidden mb-2.5">
              <div
                className="h-full bg-gradient-to-r from-blue-600 via-teal-500 to-cyan-400 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${clampedProgress}%` }}
              />
            </div>

            {/* Stage Text & Percentage */}
            <div className="flex items-center justify-between w-full text-[11px] text-slate-600">
              <span className="truncate flex-1 text-left font-medium pr-2">
                {statusText}
              </span>
              <span className="font-bold tabular-nums text-blue-600 shrink-0">
                {Math.round(clampedProgress)}%
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
