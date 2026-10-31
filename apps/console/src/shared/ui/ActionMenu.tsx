import React, { useState, useEffect } from 'react';
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useClick,
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
}

/**
 * Standard Three-Dot Action Menu Component (UI-01 / UI-03)
 * Provides portal-based desktop popover with auto-flip/shift to prevent table clipping,
 * and accessible mobile bottom action sheet with 44px+ touch targets.
 */
export const ActionMenu: React.FC<ActionMenuProps> = ({
  items,
  align = 'right',
  className = '',
  buttonLabel,
  ariaLabel = 'Tùy chọn thao tác',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768;
    }
    return false;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  const dismiss = useDismiss(context, { outsidePress: true, escapeKey: true });
  const role = useRole(context, { role: 'menu' });
  const { getReferenceProps, getFloatingProps } = useInteractions([dismiss, role]);

  if (visibleItems.length === 0) return null;

  return (
    <div className={`relative inline-block text-left ${className}`} data-menu-open={isOpen ? 'true' : 'false'}>
      <button
        type="button"
        ref={refs.setReference}
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
        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-colors"
      >
        <MoreVertical className="w-4 h-4" />
        {buttonLabel && <span className="ml-1 text-xs font-medium">{buttonLabel}</span>}
      </button>

      {/* Render menu through FloatingPortal into document.body to prevent table/card overflow clipping */}
      {isOpen && (
        <FloatingPortal>
          {isMobile ? (
            /* Mobile View: Bottom Action Sheet with safe area padding */
            <div className="fixed inset-0 z-[100] flex flex-col justify-end">
              {/* Backdrop */}
              <div
                className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                }}
              />

              {/* Bottom Sheet Modal */}
              <div
                className="relative z-10 w-full rounded-t-2xl bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shadow-2xl p-4 pb-8 max-h-[80vh] overflow-y-auto animate-in slide-in-from-bottom duration-200"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={ariaLabel}
              >
                {/* Mobile Grab Bar */}
                <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-3" />

                <div className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-2 mb-2">
                  {ariaLabel}
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {visibleItems.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      data-testid={item.testId}
                      disabled={item.disabled}
                      onClick={() => {
                        setIsOpen(false);
                        if (!item.disabled) item.onClick();
                      }}
                      className={`w-full min-h-[44px] flex items-center gap-3 px-3 py-2.5 text-left text-sm font-medium rounded-lg transition-colors ${
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
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="w-full mt-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs text-center"
                >
                  Đóng
                </button>
              </div>
            </div>
          ) : (
            /* Desktop View: Floating Popover positioned outside table scroll containers */
            <FloatingFocusManager context={context} modal={false} returnFocus={true}>
              <div
                ref={refs.setFloating}
                style={floatingStyles}
                {...getFloatingProps({
                  onClick: (e) => e.stopPropagation(),
                })}
                className="z-[100] w-56 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-1.5 text-xs animate-in fade-in zoom-in-95 duration-100 focus:outline-none"
              >
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
