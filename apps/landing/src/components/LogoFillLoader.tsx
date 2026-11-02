import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import { BrandWordmark, WORDMARK_INTRO_MS } from './BrandWordmark';
import { BrandIntroIcon } from './BrandIntroIcon';
import { useAppReducedMotion } from '../motionPreference';

export interface LogoFillLoaderProps {
  progress?: number;
  error?: string | null;
  onRetry?: () => void;
  onComplete?: () => void;
  onReveal?: () => void;
  targetSelector?: string;
  isExiting?: boolean;
}

export const LogoFillLoader: React.FC<LogoFillLoaderProps> = ({
  progress = 0,
  error = null,
  onRetry,
  onComplete,
  onReveal,
  targetSelector = '[data-brand-part="icon"], [data-testid~="header-brand-logo-img"], [data-testid="header-brand-logo-img"], [data-testid="brand-logo-icon-img"], [data-testid="brand-logo-horizontal"]',
  isExiting = false,
}) => {
  const clampedProgress = Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0;
  const logoContainerRef = useRef<HTMLDivElement | null>(null);
  const wordmarkRef = useRef<HTMLDivElement | null>(null);
  const mountedAt = useRef(performance.now());
  const finishedParts = useRef(new Set<string>());
  const completionRef = useRef(onComplete);
  const completedRef = useRef(false);
  const revealRef = useRef(onReveal);
  const restoreTargetRef = useRef<() => void>(() => {});
  const [isDocking, setIsDocking] = useState(false);
  const [flight, setFlight] = useState<{ x: number; y: number; scale: number; word?: { x: number; y: number; scale: number } } | null>(null);
  const isReducedMotion = useAppReducedMotion();
  const ready = (clampedProgress >= 100 || isExiting) && !error;

  useEffect(() => { completionRef.current = onComplete; revealRef.current = onReveal; }, [onComplete, onReveal]);

  useEffect(() => {
    if (!ready) {
      setIsDocking(false);
      setFlight(null);
      return;
    }

    let hiddenTarget: HTMLElement | undefined;
    let originalVisibility = '';
    // Allow the final fill to settle before starting the shared-element flight.
    const settleTimer = setTimeout(() => {
      const source = logoContainerRef.current?.getBoundingClientRect();
      let target: HTMLElement | undefined;
      try {
        target = Array.from(document.querySelectorAll<HTMLElement>(targetSelector)).find(el => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight &&
            rect.right > 0 && rect.left < innerWidth && style.visibility !== 'hidden' &&
            style.display !== 'none' && Number(style.opacity) > 0 &&
            Math.abs(rect.width / rect.height - 1) < 0.15;
        });
      } catch { /* Invalid or absent targets use a short fade. */ }
      const group = target?.closest<HTMLElement>('[data-brand-dock]');
      const wordTarget = group?.querySelector<HTMLElement>('[data-brand-part="wordmark"]');
      const sourceWord = wordmarkRef.current?.getBoundingClientRect();
      const targetWord = wordTarget?.getBoundingClientRect();
      // Hide the complete destination brand before revealing the page beneath.
      hiddenTarget = group || target;
      if (hiddenTarget) {
        originalVisibility = hiddenTarget.style.visibility;
        hiddenTarget.style.visibility = 'hidden';
      }
      if (!isReducedMotion && source && target) {
        const rect = target.getBoundingClientRect();
        setFlight({
          x: rect.left + rect.width / 2 - source.left - source.width / 2,
          y: rect.top + rect.height / 2 - source.top - source.height / 2,
          scale: rect.width / source.width,
          word: sourceWord && targetWord && targetWord.width > 0 ? {
            x: targetWord.left + targetWord.width / 2 - sourceWord.left - sourceWord.width / 2,
            y: targetWord.top + targetWord.height / 2 - sourceWord.top - sourceWord.height / 2,
            scale: targetWord.width / sourceWord.width,
          } : undefined,
        });
      } else {
        setFlight(null);
      }
      finishedParts.current.clear();
      restoreTargetRef.current = () => {
        if (hiddenTarget) hiddenTarget.style.visibility = originalVisibility;
      };
      revealRef.current?.();
      setIsDocking(true);
    }, isReducedMotion ? 0 : Math.max(180, WORDMARK_INTRO_MS - (performance.now() - mountedAt.current)));
    return () => {
      clearTimeout(settleTimer);

      if (hiddenTarget) hiddenTarget.style.visibility = originalVisibility;
    };
  }, [ready, targetSelector, isReducedMotion]);

  const complete = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    if (logoContainerRef.current) logoContainerRef.current.style.visibility = 'hidden';
    if (wordmarkRef.current) wordmarkRef.current.style.visibility = 'hidden';
    restoreTargetRef.current();
    revealRef.current?.();
    completionRef.current?.();
  };

  // Animation events can be cancelled/suspended by WebKit or low-power mode.
  // Completion must not depend on receiving events from both travelling parts.
  useEffect(() => {
    if (!ready || !isDocking) return;
    const timer = window.setTimeout(complete, isReducedMotion ? 250 : 1400);
    return () => window.clearTimeout(timer);
  }, [ready, isDocking, isReducedMotion]);

  const finish = (part: string) => {
    if (!ready || !isDocking || completedRef.current) return;
    finishedParts.current.add(part);
    if (finishedParts.current.size >= 2) complete();
  };

  return (
    <>
      {/* Layer 1: Backdrop Overlay — Fades to transparent to reveal page underneath */}
      <motion.div
        initial={false}
        animate={{ opacity: isDocking ? 0 : 1 }}
        transition={{ duration: isReducedMotion ? 0.12 : 0.65, ease: [0.22, 1, 0.36, 1] }}
        className="fixed inset-0 z-[100] bg-[#FAF9F6] dark:bg-[#0B0F19] pointer-events-none"
        aria-hidden="true"
      />

      {/* Layer 2: Flying Logo Stage — Logo stays 100% visible while gliding to corner */}
      <div
        data-testid="adhome-logo-fill-loader"
        data-motion-mode={isReducedMotion ? "reduced" : "full"}
        data-motion-phase={isDocking ? (flight ? "flight" : "fade") : "loading"}
        className={`fixed inset-0 z-[101] flex min-h-[100dvh] w-full flex-col items-center justify-center px-4 select-none ${
          isDocking ? 'pointer-events-none' : 'pointer-events-auto'
        }`}
        style={
          isReducedMotion && isDocking
            ? { opacity: 0, transition: 'opacity 120ms ease-out' }
            : undefined
        }
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
              transform: isDocking && !isReducedMotion ? 'scale(0.3)' : 'scale(1)',
              transition: isReducedMotion ? 'opacity 100ms ease-out' : 'opacity 300ms ease-out, transform 400ms ease-out',
            }}
            aria-hidden="true"
          />

          {/* Keep the flight wrapper stable; breathing belongs to its child. */}
          <motion.div ref={logoContainerRef}
            initial={false}
            animate={isDocking ? (flight ? {
              x: flight.x, y: flight.y, scale: flight.scale, opacity: 1,
            } : { x: 0, y: isReducedMotion ? 0 : -10, scale: isReducedMotion ? 1 : 0.94, opacity: 0 }) : { x: 0, y: 0, scale: 1, opacity: 1 }}
            transition={{
              duration: isReducedMotion ? 0.12 : 0.85,
              ease: [0.45, 0, 0.2, 1],
              x: { duration: isReducedMotion ? 0.12 : 0.85, ease: [0.65, 0, 0.2, 1] },
              y: { duration: isReducedMotion ? 0.12 : 0.85, ease: [0.4, 0, 0.2, 1] },
            }}
            onAnimationComplete={() => finish("icon")}
            role="progressbar" aria-label="Tiến độ tải AdHome"
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={clampedProgress}
            className="relative w-28 h-28 sm:w-32 sm:h-32 will-change-transform"
          >
            <BrandIntroIcon />
          </motion.div>

          <motion.div ref={wordmarkRef}
            data-testid="loading-wordmark-flight"
            initial={false}
            animate={isDocking ? (flight?.word ? {
              x: flight.word.x, y: flight.word.y, scale: flight.word.scale, opacity: 1,
            } : { x: 0, y: 0, scale: 1, opacity: 0 }) : { x: 0, y: 0, scale: 1, opacity: 1 }}
            transition={{
              duration: isReducedMotion ? 0.12 : 0.85,
              ease: [0.45, 0, 0.2, 1],
              x: { duration: isReducedMotion ? 0.12 : 0.85, ease: [0.65, 0, 0.2, 1] },
              y: { duration: isReducedMotion ? 0.12 : 0.85, ease: [0.4, 0, 0.2, 1] },
            }}
            onAnimationComplete={() => finish("wordmark")}
            className="pointer-events-none absolute top-28 sm:top-32 mt-5 h-auto w-52 sm:w-60"
          >
            <BrandWordmark animated className="block h-auto w-full overflow-visible" />
          </motion.div>

          {/* Minimalist Error Handling (Only rendered if live connection failure occurs) */}
          {error && (
            <div className="flex flex-col items-center gap-2 mt-24 max-w-xs text-center animate-fade-in">
              <span role="alert" className="text-xs font-medium text-rose-500">{error}</span>
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
