import React, { createContext, useContext, useState } from 'react';

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
  requiredCapability?: string;
  description: string;
}

export const NAV_ITEMS_CONFIG: NavItemConfig[] = [
  {
    id: 'overview',
    label: 'Tổng quan',
    category: 'core',
    description: 'Bảng điều khiển KPI, occupancy và tình trạng hoạt động toàn hệ thống',
  },
  {
    id: 'buildings',
    label: 'Tòa nhà & Phòng',
    category: 'core',
    badge: '34',
    description: 'Unified Workspace quản lý toàn bộ 4 tòa nhà và 34 phòng tập trung',
  },
  {
    id: 'tenants',
    label: 'Khách thuê',
    category: 'operations',
    badge: '6',
    description: 'Hồ sơ người thuê, CCCD, thông tin liên lạc và lịch sử lưu trú',
  },
  {
    id: 'deposits',
    label: 'Đặt cọc & Giữ chỗ',
    category: 'operations',
    badge: '3',
    badgeColor: 'warning',
    description: 'Quản lý tiền cọc giữ phòng, thời hạn cọc và hoàn/chuyển cọc',
  },
  {
    id: 'contracts',
    label: 'Hợp đồng',
    category: 'operations',
    badge: '3',
    badgeColor: 'danger',
    description: 'Hợp đồng thuê, phụ lục, thời hạn và cảnh báo gia hạn tự động',
  },
  {
    id: 'settlements',
    label: 'Kỳ tổng hợp',
    category: 'finance',
    badge: 'Hunonic',
    badgeColor: 'brand',
    description: 'Đồng bộ công tơ điện nước Hunonic, chốt chỉ số và sinh hóa đơn chu kỳ',
  },
  {
    id: 'invoices',
    label: 'Hóa đơn',
    category: 'finance',
    badge: '3',
    badgeColor: 'warning',
    description: 'Quản lý vòng đời hóa đơn tiền phòng, phí dịch vụ và nhắc nợ đa kênh',
  },
  {
    id: 'payments',
    label: 'Thanh toán & Đối soát',
    category: 'finance',
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
    description: 'Báo cáo công suất phòng, doanh thu thực thu và công nợ quá hạn',
  },
  {
    id: 'settings',
    label: 'Cài đặt hệ thống',
    category: 'system',
    requiredCapability: 'canManageSettings',
    description: 'Cấu hình tổ chức, phân quyền Admin/Manager, cổng Hunonic và bảo mật',
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
  const [activeModule, setActiveModuleState] = useState<NavModuleId>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('adhome_active_module');
      if (stored) return stored as NavModuleId;
    }
    return 'overview';
  });

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  const setActiveModule = (module: NavModuleId) => {
    setActiveModuleState(module);
    localStorage.setItem('adhome_active_module', module);
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
