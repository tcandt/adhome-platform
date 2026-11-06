import { Button } from '@animate-ui/react/primitives/buttons/button';
import {
  BellRing,
  Building2,
  CalendarClock,
  Database,
  Gauge,
  Landmark,
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
    tabs: ['cron', 'audit', 'data'],
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
      className="min-w-0 lg:sticky lg:top-4 lg:self-start"
    >
      <div className="overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:overflow-visible lg:pb-0">
        <nav className="flex min-w-max gap-2 lg:min-w-0 lg:flex-col lg:gap-4">
          {GROUPS.map((group) => (
            <div key={group.label} className="contents lg:block">
              <p className="mb-1.5 hidden px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 lg:block">
                {group.label}
              </p>
              <div className="contents lg:flex lg:flex-col lg:gap-1">
                {group.tabs.map((tabId) => {
                  const tab = SETTINGS_TABS_CONFIG.find((item) => item.id === tabId);
                  if (!tab) return null;
                  const Icon = TAB_ICONS[tab.id];
                  const isActive = activeTab === tab.id;

                  return (
                    <Button
                      key={tab.id}
                      type="button"
                      hoverScale={1.01}
                      tapScale={0.98}
                      aria-current={isActive ? 'page' : undefined}
                      data-testid={`settings-tab-${tab.id}`}
                      onClick={() => onChange(tab.id)}
                      className={`group flex min-h-11 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950 lg:w-full ${
                        isActive
                          ? 'border-blue-200 bg-blue-50 text-blue-700 shadow-sm dark:border-blue-800/70 dark:bg-blue-500/10 dark:text-blue-300'
                          : 'border-slate-200/80 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-[#111827] dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800/80 lg:border-transparent lg:bg-transparent lg:shadow-none dark:lg:border-transparent dark:lg:bg-transparent'
                      }`}
                    >
                      <span
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                          isActive
                            ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                            : 'bg-slate-100 text-slate-500 group-hover:text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="whitespace-nowrap text-xs font-semibold lg:whitespace-normal">
                        {tab.label}
                      </span>
                    </Button>
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
