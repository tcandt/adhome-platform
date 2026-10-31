import React, { useState, useRef, useEffect } from 'react';
import { MoreVertical } from 'lucide-react';

export interface ActionMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'danger' | 'warning' | 'primary';
  disabled?: boolean;
  divider?: boolean;
  hidden?: boolean;
}

export interface ActionMenuProps {
  items: ActionMenuItem[];
  align?: 'left' | 'right';
  className?: string;
  buttonLabel?: string;
  ariaLabel?: string;
}

/**
 * Standard Three-Dot Action Menu Component (UI-03)
 * Provides desktop dropdown and mobile bottom sheet action menu.
 */
export const ActionMenu: React.FC<ActionMenuProps> = ({
  items,
  align = 'right',
  className = '',
  buttonLabel,
  ariaLabel = 'Tùy chọn thao tác',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const visibleItems = items.filter((item) => !item.hidden);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  if (visibleItems.length === 0) return null;

  return (
    <div ref={containerRef} className={`relative inline-block text-left ${className}`}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-colors"
      >
        <MoreVertical className="w-4 h-4" />
        {buttonLabel && <span className="ml-1 text-xs font-medium">{buttonLabel}</span>}
      </button>

      {isOpen && (
        <>
          {/* Mobile backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/30 md:hidden"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
          />

          {/* Desktop dropdown / Mobile Bottom Action Sheet */}
          <div
            className={`fixed md:absolute bottom-0 md:bottom-auto inset-x-0 md:inset-x-auto ${
              align === 'right' ? 'md:right-0' : 'md:left-0'
            } md:top-full md:mt-1 z-50 md:w-52 rounded-t-2xl md:rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-2 md:py-1.5 text-sm animate-in fade-in zoom-in-95 duration-100`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mobile Grab Bar */}
            <div className="w-10 h-1 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-2 md:hidden" />

            <div className="max-h-[70vh] overflow-y-auto">
              {visibleItems.map((item, idx) => (
                <React.Fragment key={idx}>
                  {item.divider && (
                    <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                  )}
                  <button
                    type="button"
                    disabled={item.disabled}
                    onClick={() => {
                      setIsOpen(false);
                      if (!item.disabled) item.onClick();
                    }}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 md:py-2 text-left text-xs font-medium transition-colors ${
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
        </>
      )}
    </div>
  );
};
