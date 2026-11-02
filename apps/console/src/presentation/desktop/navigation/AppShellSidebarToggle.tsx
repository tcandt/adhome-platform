import React from 'react';
import { Menu } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@animate-ui/react/primitives/tooltip';
import {
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_EXPANDED_WIDTH,
  useSidebar,
} from '@/shared/ui/animate-sidebar';

/**
 * UI-SIDEBAR-02 — App Shell Floating Toggle.
 *
 * - Rendered at DesktopShell level: it is NOT a DOM descendant of the Sidebar
 *   nor of the DesktopHeader.
 * - Sits on the Sidebar/Content boundary, vertically centred on the 64px
 *   header. Only its X position changes (248px <-> 72px); Y never changes.
 * - Single always-mounted <button>, so keyboard focus survives toggling.
 * - Horizontal motion reuses the Animate UI collapse timing via the CSS
 *   variables exposed by the Animate UI `Provider`
 *   (`--animate-ui-sidebar-duration` is already 0ms under reduced-motion).
 * - Ctrl/Cmd+B is owned by the Animate UI Provider; this component does not
 *   register a second shortcut.
 */
export const APP_SHELL_HEADER_HEIGHT = 64;
export const APP_SHELL_TOGGLE_SIZE = 44;
/** Gap between the sidebar edge and the toggle. */
export const APP_SHELL_TOGGLE_GAP = 8;

export const AppShellSidebarToggle: React.FC = () => {
  const { state, toggleSidebar } = useSidebar();
  const isExpanded = state === 'expanded';
  const sidebarWidth = isExpanded
    ? SIDEBAR_EXPANDED_WIDTH
    : SIDEBAR_COLLAPSED_WIDTH;
  const label = isExpanded
    ? 'Thu gọn thanh điều hướng'
    : 'Mở rộng thanh điều hướng';

  return (
    <Tooltip side="bottom" sideOffset={6} align="start">
      <TooltipTrigger asChild>
        <button
          type="button"
          data-testid="console-sidebar-toggle"
          data-sidebar="trigger"
          data-state={state}
          aria-expanded={isExpanded}
          aria-controls="console-desktop-sidebar-panel"
          aria-label={`${label} (Ctrl+B)`}
          onClick={toggleSidebar}
          style={{
            top: (APP_SHELL_HEADER_HEIGHT - APP_SHELL_TOGGLE_SIZE) / 2,
            left: 0,
            width: APP_SHELL_TOGGLE_SIZE,
            height: APP_SHELL_TOGGLE_SIZE,
            transform: `translateX(${sidebarWidth + APP_SHELL_TOGGLE_GAP}px)`,
            transitionProperty: 'transform, background-color, color',
            transitionDuration:
              'var(--animate-ui-sidebar-duration, 280ms), 150ms, 150ms',
            transitionTimingFunction:
              'var(--animate-ui-sidebar-easing, cubic-bezier(0.77,0,0.175,1)), ease, ease',
          }}
          className="fixed z-30 hidden lg:inline-flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white active:bg-slate-200 dark:active:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50 cursor-pointer select-none"
        >
          <span data-testid="console-sidebar-trigger" className="sr-only">
            {label}
          </span>
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="z-50 rounded-lg border border-slate-700/80 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg">
        {label} <kbd className="ml-1 font-mono text-[10px] text-slate-300">Ctrl B</kbd>
      </TooltipContent>
    </Tooltip>
  );
};

