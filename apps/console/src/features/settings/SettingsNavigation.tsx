import { Button } from '@animate-ui/react/primitives/buttons/button';
import {
  BellRing,
  Building2,
  CalendarClock,
  Database,
  Gauge,
  Landmark,
  PackageOpen,
  ReceiptText,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import {
  SETTINGS_TABS_CONFIG,
  type SettingsTabId,
} from '@/app/navigation/navigationConfig';

const TAB_ICONS: Record<SettingsTabId, LucideIcon> = {
  organization: Building2,
  staff: UsersRound,
  tariffs: ReceiptText,
  notifications: BellRing,
  payments: Landmark,
  hunonic: Gauge,
  cron: CalendarClock,
  audit: ShieldCheck,
  data: Database,
  versions: PackageOpen,
};

const GROUPS: Array<{ label: string; tabs: SettingsTabId[] }> = [
  {
    label: 'Vận hành',
    tabs: ['organization', 'staff', 'tariffs'],
  },
  {
    label: 'Kết nối',
    tabs: ['notifications', 'payments', 'hunonic'],
  },
  {
    label: 'Hệ thống',
    tabs: ['cron', 'audit', 'data', 'versions'],
  },
];

interface SettingsNavigationProps {
  activeTab: SettingsTabId;
  onChange: (tab: SettingsTabId) => void;
}

export function SettingsNavigation({
  activeTab,
  onChange,
}: SettingsNavigationProps) {
  return (
    <aside
      aria-label="Danh mục cài đặt"
      className="min-w-0 lg:sticky lg:top-4 lg:self-start lg:w-60 lg:shrink-0"
    >
      {/* Mobile scrollable tabs */}
      <div className="overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden">
        <nav className="flex min-w-max items-center gap-1.5 p-1 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          {SETTINGS_TABS_CONFIG.map((tab) => {
            const Icon = TAB_ICONS[tab.id];
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                data-testid={`settings-tab-mobile-${tab.id}`}
                onClick={() => onChange(tab.id)}
                className={`flex min-h-[38px] items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Desktop vertical sidebar card */}
      <div className="hidden lg:block rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#111827] p-2.5 shadow-2xs">
        <nav className="flex flex-col gap-3.5">
          {GROUPS.map((group) => (
            <div key={group.label}>
              <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
                {group.label}
              </p>
              <div className="space-y-1">
                {group.tabs.map((tabId) => {
                  const tab = SETTINGS_TABS_CONFIG.find((item) => item.id === tabId);
                  if (!tab) return null;
                  const Icon = TAB_ICONS[tab.id];
                  const isActive = activeTab === tab.id;

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      aria-current={isActive ? 'page' : undefined}
                      data-testid={`settings-tab-${tab.id}`}
                      onClick={() => onChange(tab.id)}
                      className={`group flex min-h-[42px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-semibold transition-all cursor-pointer ${
                        isActive
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <span
                        className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors ${
                          isActive
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200/70 group-hover:text-slate-800 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <span className="truncate">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}
