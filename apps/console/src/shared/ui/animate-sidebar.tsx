import React from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import {
  Container,
  Gap,
  Highlight,
  Provider,
  TriggerIcon,
  useSidebar,
} from '@animate-ui/react/primitives/sidebar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@animate-ui/react/primitives/tooltip';
import { Dialog } from '@animate-ui/react/primitives/base-ui/dialog';
import { Collapsible } from '@animate-ui/react/primitives/base-ui/collapsible';

export { Collapsible, useSidebar };

export const SIDEBAR_EXPANDED_WIDTH = 248;
export const SIDEBAR_COLLAPSED_WIDTH = 72;

export function SidebarProvider({
  defaultOpen = true,
  open,
  onOpenChange,
  children,
  className = '',
}: {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <TooltipProvider openDelay={120} closeDelay={60}>
      <Provider
        defaultOpen={defaultOpen}
        open={open}
        onOpenChange={onOpenChange}
        animateOnHover={true}
        className={`flex min-h-screen w-full bg-[#F7F9FC] dark:bg-[#0B0F19] text-slate-900 dark:text-slate-100 ${className}`}
      >
        {children}
      </Provider>
    </TooltipProvider>
  );
}

export function Sidebar({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { state } = useSidebar();
  const widthPx =
    state === 'expanded'
      ? `${SIDEBAR_EXPANDED_WIDTH}px`
      : `${SIDEBAR_COLLAPSED_WIDTH}px`;

  return (
    <div
      className="group/sidebar relative hidden lg:block shrink-0"
      data-state={state}
      data-collapsible={state === 'collapsed' ? 'icon' : ''}
      data-testid="console-desktop-sidebar"
    >
      <Gap style={{ width: widthPx }} className="shrink-0" />
      <Container
        style={{ width: widthPx }}
        data-state={state}
        data-collapsible={state === 'collapsed' ? 'icon' : ''}
        className={`fixed inset-y-0 left-0 z-30 flex h-screen flex-col border-r border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-[#111827] select-none ${className}`}
      >
        {children}
      </Container>
    </div>
  );
}

export function SidebarHeader({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      data-sidebar="header"
      className={`flex h-16 shrink-0 items-center border-b border-slate-100 dark:border-slate-800/80 ${className}`}
    >
      {children}
    </div>
  );
}

export function SidebarContent({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Highlight
      data-sidebar="content"
      className={`flex flex-1 flex-col min-h-0 overflow-y-auto overflow-x-hidden py-3 ${className}`}
    >
      {children}
    </Highlight>
  );
}

export function SidebarFooter({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      data-sidebar="footer"
      className={`shrink-0 border-t border-slate-100 dark:border-slate-800/80 ${className}`}
    >
      {children}
    </div>
  );
}

export function SidebarGroup({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      data-sidebar="group"
      className={`flex flex-col px-2.5 mb-3 last:mb-0 ${className}`}
    >
      {children}
    </div>
  );
}

export function SidebarGroupLabel({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { state } = useSidebar();
  if (state === 'collapsed') {
    return (
      <div
        data-sidebar="group-label"
        className="mx-auto my-1.5 h-px w-7 bg-slate-200 dark:bg-slate-800"
        aria-hidden="true"
      />
    );
  }
  return (
    <div
      data-sidebar="group-label"
      className={`px-2.5 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500 truncate ${className}`}
    >
      {children}
    </div>
  );
}

export function SidebarMenu({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ul data-sidebar="menu" className={`flex flex-col gap-0.5 ${className}`}>
      {children}
    </ul>
  );
}

export function SidebarMenuItem({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <li data-sidebar="menu-item" className={`relative list-none ${className}`}>
      {children}
    </li>
  );
}

export function SidebarMenuButton({
  isActive = false,
  tooltip,
  onClick,
  children,
  className = '',
  testId,
}: {
  isActive?: boolean;
  tooltip?: string;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';

  const buttonEl = (
    <button
      type="button"
      data-sidebar="menu-button"
      data-active={isActive ? 'true' : 'false'}
      data-testid={testId}
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      aria-label={isCollapsed && tooltip ? tooltip : undefined}
      className={`relative z-10 flex w-full items-center rounded-lg text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 ${
        isCollapsed ? 'h-10 justify-center px-0' : 'h-9.5 gap-2.5 px-2.5 py-2'
      } ${
        isActive
          ? 'bg-blue-50/95 dark:bg-blue-500/15 text-brand-primary dark:text-blue-400 font-semibold'
          : 'text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100/80 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
      } ${className}`}
    >
      {isActive && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-brand-primary dark:bg-blue-400"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );

  if (!isCollapsed || !tooltip) {
    return buttonEl;
  }

  return (
    <Tooltip side="right" sideOffset={10} align="center">
      <TooltipTrigger asChild>{buttonEl}</TooltipTrigger>
      <TooltipContent className="z-50 rounded-lg border border-slate-700/80 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

export function SidebarRail() {
  const { toggleSidebar, state } = useSidebar();
  return (
    <button
      type="button"
      data-sidebar="rail"
      data-testid="console-sidebar-rail"
      onClick={toggleSidebar}
      title={
        state === 'expanded'
          ? 'Thu gọn thanh điều hướng (Ctrl+B)'
          : 'Mở rộng thanh điều hướng (Ctrl+B)'
      }
      aria-label={
        state === 'expanded'
          ? 'Thu gọn thanh điều hướng'
          : 'Mở rộng thanh điều hướng'
      }
      className="absolute inset-y-0 -right-2 z-40 hidden w-3.5 cursor-ew-resize lg:flex items-center justify-center group/rail focus:outline-none"
    >
      <span className="h-full w-[2px] bg-transparent transition-colors group-hover/rail:bg-brand-primary/50" />
    </button>
  );
}

export function SidebarTrigger({ className = '' }: { className?: string }) {
  const { toggleSidebar, state } = useSidebar();
  return (
    <button
      type="button"
      data-sidebar="trigger"
      data-testid="console-sidebar-trigger"
      onClick={toggleSidebar}
      title={
        state === 'expanded'
          ? 'Thu gọn menu (Ctrl+B)'
          : 'Mở rộng menu (Ctrl+B)'
      }
      aria-label={
        state === 'expanded'
          ? 'Thu gọn thanh điều hướng'
          : 'Mở rộng thanh điều hướng'
      }
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 ${className}`}
    >
      <TriggerIcon
        open={<PanelLeftClose className="h-4 w-4" />}
        closed={<PanelLeftOpen className="h-4 w-4" />}
      />
    </button>
  );
}

export function SidebarInset({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      data-sidebar="inset"
      className={`flex min-h-screen flex-1 flex-col min-w-0 ${className}`}
    >
      {children}
    </div>
  );
}

export function MobileSidebarSheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop
          data-testid="console-mobile-drawer-backdrop"
          onClick={() => onOpenChange(false)}
          className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-[2px] cursor-pointer"
        />
        <Dialog.Popup
          from="left"
          data-testid="console-mobile-drawer"
          className="fixed inset-y-0 left-0 z-50 flex w-[84vw] max-w-[310px] flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] shadow-2xl focus:outline-none"
        >
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

