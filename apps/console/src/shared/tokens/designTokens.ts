/**
 * AdHome Console V2 — Standard Design & Motion Tokens
 * Standardized design specifications conforming to Blueprint Section 3 & 4
 */

export const DESIGN_TOKENS = {
  // Typography Hierarchy
  typography: {
    fontSans: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    fontMono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    scale: {
      h1: 'text-lg font-bold tracking-tight',
      h2: 'text-base font-bold tracking-tight',
      h3: 'text-sm font-semibold',
      body: 'text-xs text-slate-700 dark:text-slate-300',
      caption: 'text-[11px] text-slate-500 dark:text-slate-400',
      badge: 'text-[10.5px] font-bold tracking-wide',
      tabular: 'tabular-nums font-mono',
    },
  },

  // Color Palette & Surface Tokens
  colors: {
    brand: {
      primary: '#2563EB',
      primaryDark: '#3B82F6',
      hover: '#1D4ED8',
      hoverDark: '#2563EB',
      subtle: 'bg-blue-50/80 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300',
    },
    surface: {
      backgroundLight: '#F7F9FC',
      backgroundDark: '#0B0F19',
      cardLight: '#FFFFFF',
      cardDark: '#111827',
      elevatedLight: '#FFFFFF',
      elevatedDark: '#1E293B',
    },
    border: {
      subtleLight: '#E2E8F0',
      subtleDark: '#1E293B',
      defaultLight: '#CBD5E1',
      defaultDark: '#334155',
    },
    status: {
      active: {
        bg: 'bg-emerald-50 dark:bg-emerald-950/50',
        text: 'text-emerald-700 dark:text-emerald-300',
        border: 'border-emerald-200 dark:border-emerald-800/60',
        dot: 'bg-emerald-500',
        label: 'Đang hiệu lực',
      },
      draft: {
        bg: 'bg-amber-50 dark:bg-amber-950/50',
        text: 'text-amber-700 dark:text-amber-300',
        border: 'border-amber-200 dark:border-amber-800/60',
        dot: 'bg-amber-500',
        label: 'Chờ bàn giao',
      },
      expiring: {
        bg: 'bg-orange-50 dark:bg-orange-950/50',
        text: 'text-orange-700 dark:text-orange-300',
        border: 'border-orange-200 dark:border-orange-800/60',
        dot: 'bg-orange-500',
        label: 'Sắp hết hạn',
      },
      terminated: {
        bg: 'bg-slate-100 dark:bg-slate-800/70',
        text: 'text-slate-600 dark:text-slate-400',
        border: 'border-slate-200 dark:border-slate-700',
        dot: 'bg-slate-400',
        label: 'Đã thanh lý',
      },
      reserved: {
        bg: 'bg-sky-50 dark:bg-sky-950/50',
        text: 'text-sky-700 dark:text-sky-300',
        border: 'border-sky-200 dark:border-sky-800/60',
        dot: 'bg-sky-500',
        label: 'Đang giữ chỗ',
      },
      available: {
        bg: 'bg-slate-50 dark:bg-slate-800/50',
        text: 'text-slate-700 dark:text-slate-300',
        border: 'border-slate-200 dark:border-slate-700',
        dot: 'bg-slate-400',
        label: 'Còn trống',
      },
    },
  },

  // Touch targets & Layout
  layout: {
    touchTargetDesktop: 40,
    touchTargetMobile: 44,
    sidebarExpandedWidth: 248,
    sidebarCollapsedWidth: 72,
    headerHeight: 64,
  },

  // Motion Tokens (Budget: <300ms, cubic-bezier)
  motion: {
    duration: {
      instant: '100ms',
      fast: '150ms',
      base: '200ms',
      modal: '250ms',
    },
    easing: {
      default: 'cubic-bezier(0.16, 1, 0.3, 1)',
      inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
      spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    },
    transition: {
      base: 'transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
      colors: 'transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]',
      transform: 'transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
    },
  },
} as const;

/**
 * Format contract code to clean short display code while preserving immutable trace.
 * Example:
 *   "HD-IMP-R-WF-010A-3673" -> { displayCode: "HD-WF-010A", isImported: true, rawCode: "HD-IMP-R-WF-010A-3673" }
 *   "HD-S2B-S2R-105-BCF2"   -> { displayCode: "HD-S2R-105", isImported: false, rawCode: "HD-S2B-S2R-105-BCF2" }
 *   "HD-S4-401"             -> { displayCode: "HD-S4-401", isImported: false, rawCode: "HD-S4-401" }
 */
export function formatContractDisplayCode(rawCode: string): {
  displayCode: string;
  isImported: boolean;
  rawCode: string;
} {
  if (!rawCode) return { displayCode: '—', isImported: false, rawCode: '' };

  const isImported = rawCode.includes('-IMP-') || rawCode.startsWith('IMP-');

  // Regex patterns to simplify verbose codes:
  // 1. HD-IMP-R-WF-010A-3673 -> HD-WF-010A
  let displayCode = rawCode;
  if (isImported) {
    const match = rawCode.match(/HD-IMP-(?:R-)?([A-Za-z0-9._-]+?)(?:-[0-9a-fA-F]{4})?$/);
    if (match && match[1]) {
      displayCode = `HD-${match[1]}`;
    }
  } else {
    // 2. HD-S2B-S2R-105-BCF2 -> HD-S2R-105
    const match = rawCode.match(/^HD-[A-Za-z0-9._]+-([A-Za-z0-9._-]+)-[0-9a-fA-F]{4}$/);
    if (match && match[1]) {
      displayCode = `HD-${match[1]}`;
    }
  }

  return { displayCode, isImported, rawCode };
}

/**
 * Human-readable Water Billing Method Label
 */
export function formatWaterBillingLabel(method: string): string {
  switch (method) {
    case 'PER_M3':
      return '/m³';
    case 'PER_PERSON':
      return '/người';
    case 'FIXED_ROOM':
      return '/phòng';
    default:
      return method || '';
  }
}
