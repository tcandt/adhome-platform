import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserCapabilities } from '@/shared/types/auth';
import { useAuth } from '@/app/providers/AuthContext';

export type NavModuleId =
  | 'overview'
  | 'buildings'
  | 'tenants'
  | 'deposits'
  | 'contracts'
  | 'settlements'
  | 'invoices'
  | 'payments'
  | 'finance'
  | 'reports'
  | 'settings';

export interface NavItemConfig {
  id: NavModuleId;
  label: string;
  badge?: string | number;
  badgeColor?: 'warning' | 'danger' | 'brand';
  category: 'core' | 'operations' | 'finance' | 'system';
  requiredCapability?: keyof UserCapabilities;
  description: string;
}

export const NAV_ITEMS_CONFIG: NavItemConfig[] = [
  {
    id: 'overview',
    label: 'Tổng quan',
    category: 'core',
    requiredCapability: 'canViewOverview',
    description: 'Bảng điều khiển KPI, tỷ lệ lấp đầy và tình trạng hoạt động theo phạm vi tòa nhà được phân công',
  },
  {
    id: 'buildings',
    label: 'Tòa nhà & Phòng',
    category: 'core',
    requiredCapability: 'canManageRooms',
    description: 'Unified Workspace quản lý các tòa nhà và căn hộ thuộc phạm vi được cấp quyền',
  },
  {
    id: 'tenants',
    label: 'Khách thuê',
    category: 'operations',
    requiredCapability: 'canManageTenants',
    description: 'Hồ sơ người thuê, CCCD, thông tin liên lạc và lịch sử lưu trú',
  },
  {
    id: 'deposits',
    label: 'Đặt cọc & Giữ chỗ',
    category: 'operations',
    badgeColor: 'warning',
    requiredCapability: 'canManageDeposits',
    description: 'Quản lý tiền cọc giữ phòng, thời hạn cọc và hoàn/chuyển cọc',
  },
  {
    id: 'contracts',
    label: 'Hợp đồng',
    category: 'operations',
    badgeColor: 'danger',
    requiredCapability: 'canManageContracts',
    description: 'Hợp đồng thuê, phụ lục, thời hạn và cảnh báo gia hạn tự động',
  },
  {
    id: 'settlements',
    label: 'Kỳ tổng hợp',
    category: 'finance',
    badge: 'Hunonic',
    badgeColor: 'brand',
    requiredCapability: 'canManageSettlements',
    description: 'Đồng bộ công tơ điện nước Hunonic, chốt chỉ số và sinh hóa đơn chu kỳ',
  },
  {
    id: 'invoices',
    label: 'Hóa đơn',
    category: 'finance',
    badgeColor: 'warning',
    requiredCapability: 'canManageInvoices',
    description: 'Quản lý vòng đời hóa đơn tiền phòng, phí dịch vụ và nhắc nợ đa kênh',
  },
  {
    id: 'payments',
    label: 'Thanh toán & Đối soát',
    category: 'finance',
    requiredCapability: 'canManagePayments',
    description: 'Tự động đối soát chuyển khoản ngân hàng, mã SePay QR và tiền mặt',
  },
  {
    id: 'finance',
    label: 'Thu chi & Sổ quỹ',
    category: 'finance',
    requiredCapability: 'canAccessFinance',
    description: 'Theo dõi dòng tiền, chi phí vận hành, bảo trì và lợi nhuận ròng',
  },
  {
    id: 'reports',
    label: 'Báo cáo & Phân tích',
    category: 'system',
    requiredCapability: 'canViewReports',
    description: 'Báo cáo công suất phòng, doanh thu thực thu và công nợ quá hạn',
  },
  {
    id: 'settings',
    label: 'Cài đặt & Phân quyền',
    category: 'system',
    requiredCapability: 'canManageSettings',
    description: 'Quản lý tài khoản nhân sự, gán phạm vi tòa nhà, phân quyền Admin/Manager và bảo mật',
  },
];

interface NavigationContextType {
  activeModule: NavModuleId;
  setActiveModule: (module: NavModuleId) => void;
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;
  isNotificationsOpen: boolean;
  setIsNotificationsOpen: (open: boolean) => void;
  currentNavConfig: NavItemConfig;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, hasCapability, refreshSession } = useAuth();

  const [activeModule, setActiveModuleState] = useState<NavModuleId>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('adhome_active_module');
      if (stored && NAV_ITEMS_CONFIG.some(item => item.id === stored)) {
        return stored as NavModuleId;
      }
    }
    return 'overview';
  });

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  // Reset activeModule to 'overview' on logout or if current user lacks required capability
  useEffect(() => {
    if (!isAuthenticated) {
      setActiveModuleState('overview');
      return;
    }
    const targetConfig = NAV_ITEMS_CONFIG.find(item => item.id === activeModule);
    if (targetConfig?.requiredCapability && !hasCapability(targetConfig.requiredCapability)) {
      setActiveModuleState('overview');
      if (typeof window !== 'undefined') {
        localStorage.setItem('adhome_active_module', 'overview');
      }
    }
  }, [isAuthenticated, user, activeModule, hasCapability]);

  const setActiveModule = (module: NavModuleId) => {
    const targetConfig = NAV_ITEMS_CONFIG.find(item => item.id === module);
    if (targetConfig?.requiredCapability && !hasCapability(targetConfig.requiredCapability)) {
      return;
    }
    setActiveModuleState(module);
    if (typeof window !== 'undefined') {
      localStorage.setItem('adhome_active_module', module);
    }
    // Background session re-validation so Admin permission edits take effect immediately
    void refreshSession();
  };

  const currentNavConfig =
    NAV_ITEMS_CONFIG.find(item => item.id === activeModule) || NAV_ITEMS_CONFIG[0];

  return (
    <NavigationContext.Provider
      value={{
        activeModule,
        setActiveModule,
        isSearchOpen,
        setIsSearchOpen,
        isNotificationsOpen,
        setIsNotificationsOpen,
        currentNavConfig,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within NavigationProvider');
  }
  return context;
}
