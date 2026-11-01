import React, { useState, useEffect } from 'react';
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useDismiss,
  useRole,
  useInteractions,
  FloatingPortal,
  FloatingFocusManager,
} from '@floating-ui/react';
import { MoreVertical } from 'lucide-react';

export interface ActionMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'danger' | 'warning' | 'primary';
  disabled?: boolean;
  divider?: boolean;
  hidden?: boolean;
  testId?: string;
}

export interface ActionMenuProps {
  items: ActionMenuItem[];
  align?: 'left' | 'right';
  className?: string;
  buttonLabel?: string;
  ariaLabel?: string;
  contextTitle?: string;
  contextSubtitle?: string;
  contextBadge?: string;
}

/**
 * Standard Action Menu Component (UI-06 / UI-07)
 * - Desktop: Portal-based floating popover (z-index 100), auto flip/shift, bounding box >= 40px
 * - Mobile: Contextual bottom action sheet, bounding box >= 44px, safe area padding, focus trap
 */
export const ActionMenu: React.FC<ActionMenuProps> = ({
  items,
  align = 'right',
  className = '',
  buttonLabel,
  ariaLabel = 'Tùy chọn thao tác',
  contextTitle,
  contextSubtitle,
  contextBadge,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  const triggerButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const sheetRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // UI-07-FIX-03 & UI-07-FIX-04: Mobile Bottom Sheet Focus Trap, Keyboard Escape, Safe Area & Background Scroll Lock
  useEffect(() => {
    if (!isOpen || !isMobile) return;

    // 1. Lock background body scrolling & touch action
    const originalOverflow = document.body.style.overflow;
    const originalTouchAction = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';

    // 2. Auto-focus first interactive element inside sheet
    const timer = setTimeout(() => {
      if (sheetRef.current) {
        const focusables = sheetRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length > 0) {
          focusables[0].focus();
        }
      }
    }, 50);

    // 3. Focus trap and Escape listener
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
        return;
      }

      if (e.key === 'Tab' && sheetRef.current) {
        const focusables = Array.from(
          sheetRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = originalOverflow;
      document.body.style.touchAction = originalTouchAction;
      window.removeEventListener('keydown', handleKeyDown);
      // Restore focus to trigger button
      triggerButtonRef.current?.focus();
    };
  }, [isOpen, isMobile]);

  const visibleItems = items.filter((item) => !item.hidden);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen && !isMobile,
    onOpenChange: setIsOpen,
    placement: align === 'right' ? 'bottom-end' : 'bottom-start',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(6),
      flip({
        fallbackPlacements: ['top-end', 'top-start', 'bottom-start', 'bottom-end'],
        padding: 8,
      }),
      shift({ padding: 12 }),
    ],
  });

  const setTriggerRef = React.useCallback(
    (node: HTMLButtonElement | null) => {
      triggerButtonRef.current = node;
      refs.setReference(node);
    },
    [refs]
  );

  const dismiss = useDismiss(context, { outsidePress: true, escapeKey: true });
  const role = useRole(context, { role: 'menu' });
  const { getReferenceProps, getFloatingProps } = useInteractions([dismiss, role]);

  // Separate normal actions vs destructive actions for clear grouping
  const normalItems = visibleItems.filter((i) => i.variant !== 'danger');
  const destructiveItems = visibleItems.filter((i) => i.variant === 'danger');

  if (visibleItems.length === 0) return null;

  return (
    <div className={`relative inline-block text-left ${className}`} data-menu-open={isOpen ? 'true' : 'false'}>
      {/* Trigger Button: >= 40px on Desktop, >= 44px on Mobile */}
      <button
        type="button"
        ref={setTriggerRef}
        data-testid="action-menu-trigger"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        {...getReferenceProps({
          onClick: (e) => {
            e.stopPropagation();
            setIsOpen((prev) => !prev);
          },
        })}
        className="inline-flex h-10 w-10 min-w-[40px] min-h-[40px] max-md:h-11 max-md:w-11 max-md:min-w-[44px] max-md:min-h-[44px] items-center justify-center rounded-lg border border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100/90 dark:hover:bg-slate-800 hover:border-slate-200/80 dark:hover:border-slate-700/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 transition-all select-none"
      >
        <MoreVertical className="w-4 h-4 shrink-0" />
        {buttonLabel && <span className="ml-1 text-xs font-medium">{buttonLabel}</span>}
      </button>

      {/* Render menu through FloatingPortal into document.body to prevent table/card overflow clipping */}
      {isOpen && (
        <FloatingPortal id="adhome-action-menu-portal">
          {isMobile ? (
            /* Mobile View: Contextual Bottom Action Sheet (UI-07-FIX-02 / UI-07-FIX-03) */
            <div
              data-testid="action-menu-bottom-sheet-container"
              className="fixed inset-0 z-[100] flex flex-col justify-end"
            >
              {/* Backdrop with touch lock */}
              <div
                data-testid="action-menu-backdrop"
                className="fixed inset-0 bg-black/55 backdrop-blur-xs transition-opacity animate-in fade-in duration-150 touch-none overscroll-none"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                }}
              />

              {/* Bottom Sheet Modal with Context Header & Accessibility (UI-07-FIX-04 Safe Area) */}
              <div
                ref={sheetRef}
                data-testid="action-menu-bottom-sheet"
                style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom, 2rem))' }}
                className="relative z-10 w-full rounded-t-2xl bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shadow-2xl p-4 max-h-[85vh] overflow-y-auto overscroll-contain animate-in slide-in-from-bottom duration-200 focus:outline-none"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="action-menu-sheet-title"
                aria-describedby={contextSubtitle ? 'action-menu-sheet-subtitle' : undefined}
                tabIndex={-1}
              >
                {/* Mobile Grab Bar */}
                <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-3" aria-hidden="true" />

                {/* Contextual Header (UI-07-FIX-02) */}
                <div className="px-2 pb-2.5 mb-2.5 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-2">
                    <h3
                      id="action-menu-sheet-title"
                      className="text-sm font-bold text-slate-900 dark:text-white truncate"
                    >
                      {contextTitle || ariaLabel}
                    </h3>
                    {contextBadge && (
                      <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700">
                        {contextBadge}
                      </span>
                    )}
                  </div>
                  {contextSubtitle && (
                    <div
                      id="action-menu-sheet-subtitle"
                      className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5"
                    >
                      {contextSubtitle}
                    </div>
                  )}
                </div>

                {/* Normal Actions */}
                <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {normalItems.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      data-testid={item.testId}
                      disabled={item.disabled}
                      onClick={() => {
                        setIsOpen(false);
                        if (!item.disabled) item.onClick();
                      }}
                      className={`w-full min-h-[44px] flex items-center gap-3 px-3 py-3 text-left text-sm font-medium rounded-lg transition-colors ${
                        item.disabled
                          ? 'opacity-40 cursor-not-allowed text-slate-400'
                          : item.variant === 'primary'
                          ? 'text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 dark:text-blue-400 font-semibold'
                          : item.variant === 'warning'
                          ? 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 dark:text-amber-400'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {item.icon && <span className="w-4 h-4 shrink-0">{item.icon}</span>}
                      <span className="truncate">{item.label}</span>
                    </button>
                  ))}
                </div>

                {/* Destructive Actions Section */}
                {destructiveItems.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-200/80 dark:border-slate-800">
                    {destructiveItems.map((item, idx) => (
                      <button
                        key={idx}
                        type="button"
                        data-testid={item.testId}
                        disabled={item.disabled}
                        onClick={() => {
                          setIsOpen(false);
                          if (!item.disabled) item.onClick();
                        }}
                        className={`w-full min-h-[44px] flex items-center gap-3 px-3 py-3 text-left text-sm font-semibold rounded-lg transition-colors text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 dark:text-rose-400 ${
                          item.disabled ? 'opacity-40 cursor-not-allowed text-slate-400' : ''
                        }`}
                      >
                        {item.icon && <span className="w-4 h-4 shrink-0">{item.icon}</span>}
                        <span className="truncate">{item.label}</span>
                      </button>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  data-testid="action-menu-close-sheet"
                  onClick={() => setIsOpen(false)}
                  className="w-full mt-4 min-h-[44px] py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs text-center transition-colors hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  Đóng
                </button>
              </div>
            </div>
          ) : (
            /* Desktop View: Floating Popover with Portal & Auto flip/shift (UI-06-FIX-01) */
            <FloatingFocusManager context={context} modal={false} returnFocus={true}>
              <div
                ref={refs.setFloating}
                style={floatingStyles}
                data-testid="action-menu-popover"
                role="menu"
                aria-label={contextTitle || ariaLabel}
                {...getFloatingProps({
                  onClick: (e) => e.stopPropagation(),
                })}
                className="z-[100] w-56 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-1.5 text-xs animate-in fade-in zoom-in-95 duration-100 focus:outline-none select-none"
              >
                {contextTitle && (
                  <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 mb-1">
                    <div className="text-[11px] font-bold text-slate-850 dark:text-slate-100 truncate">
                      {contextTitle}
                    </div>
                    {contextSubtitle && (
                      <div className="text-[10px] font-mono text-slate-400 truncate">
                        {contextSubtitle}
                      </div>
                    )}
                  </div>
                )}
                <div className="max-h-[60vh] overflow-y-auto py-0.5">
                  {visibleItems.map((item, idx) => (
                    <React.Fragment key={idx}>
                      {item.divider && (
                        <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                      )}
                      <button
                        type="button"
                        data-testid={item.testId}
                        disabled={item.disabled}
                        role="menuitem"
                        onClick={() => {
                          setIsOpen(false);
                          if (!item.disabled) item.onClick();
                        }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-left font-medium transition-colors ${
                          item.disabled
                            ? 'opacity-40 cursor-not-allowed text-slate-400'
                            : item.variant === 'danger'
                            ? 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 dark:text-rose-400'
                            : item.variant === 'primary'
                            ? 'text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 dark:text-blue-400 font-semibold'
                            : item.variant === 'warning'
                            ? 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 dark:text-amber-400'
                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {item.icon && <span className="w-4 h-4 shrink-0">{item.icon}</span>}
                        <span className="truncate">{item.label}</span>
                      </button>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </FloatingFocusManager>
          )}
        </FloatingPortal>
      )}
    </div>
  );
};
