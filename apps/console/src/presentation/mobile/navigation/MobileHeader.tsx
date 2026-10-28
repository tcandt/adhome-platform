import React from 'react';
import { Menu, Search, Sun, Moon, Building2, Monitor } from 'lucide-react';
import { BrandLogo } from '@/shared/ui/BrandLogo';
import { useNavigation } from '@/app/providers/NavigationContext';
import { useAuth } from '@/app/providers/AuthContext';
import { useTheme } from '@/app/providers/ThemeContext';
import { usePresentationMode } from '@/shared/hooks/usePresentationMode';
import { usePortfolio } from '@/app/providers/PortfolioContext';

interface MobileHeaderProps {
  onOpenDrawer: () => void;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({ onOpenDrawer }) => {
  const { currentNavConfig, setIsSearchOpen } = useNavigation();
  const { user, activeBuildingId, setActiveBuildingId } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { setOverride } = usePresentationMode();
  const { buildings } = usePortfolio();

  const availableBuildings = buildings.filter(b => {
    if (!user || user.assignedBuildingIds === 'ALL') return true;
    return user.assignedBuildingIds.includes(b.id);
  });

  return (
    <header className="fixed top-0 left-0 right-0 z-20 h-14 bg-surface dark:bg-header-dark border-b border-appBorder-light dark:border-appBorder-dark flex items-center justify-between px-3">
      {/* Left: Hamburger & Brand */}
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenDrawer}
          className="p-2 -ml-1 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Mở menu điều hướng"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-1.5">
          <BrandLogo size="sm" variant="icon-only" />
          <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-slate-100">
            AdHome
          </span>
        </div>
      </div>

      {/* Center/Right: Building Switcher & Actions */}
      <div className="flex items-center gap-1.5">
        <select
          value={activeBuildingId}
          onChange={e => setActiveBuildingId(e.target.value)}
          className="bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-300 py-1 px-2 rounded-lg border-0 max-w-[130px] truncate"
        >
          {user?.assignedBuildingIds === 'ALL' && <option value="ALL">Tất cả tòa</option>}
          {availableBuildings.map(b => (
            <option key={b.id} value={b.id}>
              {b.shortCode}
            </option>
          ))}
        </select>

        <button
          onClick={() => setIsSearchOpen(true)}
          className="p-1.5 text-slate-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Tìm kiếm"
        >
          <Search className="w-4 h-4" />
        </button>

        <button
          onClick={toggleTheme}
          className="p-1.5 text-slate-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Chuyển chế độ giao diện"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
        </button>

        <button
          onClick={() => setOverride('desktop')}
          className="p-1.5 text-slate-500 hover:text-brand-primary rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          title="Chuyển sang giao diện Desktop"
          aria-label="Chuyển sang giao diện Desktop"
        >
          <Monitor className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
