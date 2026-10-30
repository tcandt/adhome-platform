import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Building2,
  ClipboardCheck,
  CreditCard,
  FileSignature,
  KeyRound,
  LayoutDashboard,
  Receipt,
  Settings,
  Wallet,
} from 'lucide-react';
import type { UserCapabilities } from '@/shared/types/auth';

export type NavModuleId =
  | 'overview'
  | 'buildings'
  | 'deposits'
  | 'contracts'
  | 'settlements'
  | 'invoices'
  | 'payments'
  | 'finance'
  | 'reports'
  | 'settings';

export type NavGroupId = 'core_ops' | 'finance_summary' | 'system';

export type BuildingsSubTabId = 'rooms' | 'tenants';

export type SettingsTabId =
  | 'organization'
  | 'staff'
  | 'tariffs'
  | 'notifications'
  | 'payments'
  | 'hunonic'
  | 'cron'
  | 'audit';

export interface NavItemConfig {
  id: NavModuleId;
  label: string;
  shortMobileLabel: string;
  groupId: NavGroupId;
  icon: LucideIcon;
  requiredCapability?: keyof UserCapabilities;
  supportsBuildingScope: boolean;
  hasPeriodToolbar: boolean;
  countKey?:
    | 'buildings'
    | 'rooms'
    | 'deposits'
    | 'contracts'
    | 'invoicesUnpaid';
  description: string;
}

export interface NavGroupConfig {
  id: NavGroupId;
  label: string;
  items: NavItemConfig[];
}

export interface SettingsTabConfig {
  id: SettingsTabId;
  label: string;
  description: string;
}

export const SETTINGS_TABS_CONFIG: SettingsTabConfig[] = [
  {
    id: 'organization',
    label: 'Tổ chức & Tòa nhà',
    description: 'Thông tin pháp nhân, liên hệ vận hành và danh mục tòa nhà',
  },
  {
    id: 'staff',
    label: 'Nhân sự & Phân quyền',
    description: 'Quản lý tài khoản Admin / Manager và gán phạm vi tòa nhà',
  },
  {
    id: 'tariffs',
    label: 'Cấu hình Tiền phòng & Dịch vụ',
    description:
      'Đơn giá điện và 3 phương thức tính nước (theo m³, theo đầu người, khoán cố định)',
  },
  {
    id: 'notifications',
    label: 'Kênh thông báo',
    description: 'Zalo OA / ZBS, Zalo Bot, Telegram Bot và Facebook Messenger',
  },
  {
    id: 'payments',
    label: 'Cổng thanh toán',
    description: 'SePay, payOS và Tingee theo ma trận năng lực thực tế',
  },
  {
    id: 'hunonic',
    label: 'Đồng hồ Hunonic',
    description: 'Kết nối tài khoản công tơ điện thông minh Hunonic',
  },
  {
    id: 'cron',
    label: 'Lịch tự động',
    description: 'Cấu hình lịch chạy Cron theo múi giờ Asia/Ho_Chi_Minh',
  },
  {
    id: 'audit',
    label: 'Nhật ký & Bảo mật',
    description: 'Nhật ký thao tác nghiệp vụ và lịch sử xác thực hệ thống',
  },
];

export const NAV_GROUPS_CONFIG: NavGroupConfig[] = [
  {
    id: 'core_ops',
    label: 'VẬN HÀNH CỐT LÕI',
    items: [
      {
        id: 'overview',
        label: 'Tổng quan',
        shortMobileLabel: 'Tổng quan',
        groupId: 'core_ops',
        icon: LayoutDashboard,
        requiredCapability: 'canViewOverview',
        supportsBuildingScope: true,
        hasPeriodToolbar: false,
        description:
          'Bảng điều khiển KPI thực tế, tỷ lệ lấp đầy và cảnh báo vận hành từ PostgreSQL',
      },
      {
        id: 'buildings',
        label: 'Tòa nhà & phòng',
        shortMobileLabel: 'Phòng & Khách',
        groupId: 'core_ops',
        icon: Building2,
        requiredCapability: 'canManageRooms',
        supportsBuildingScope: true,
        hasPeriodToolbar: false,
        countKey: 'rooms',
        description:
          'Quản lý tòa nhà, sơ đồ tầng/phòng, xuất bản Landing và hồ sơ khách thuê',
      },
      {
        id: 'deposits',
        label: 'Đặt cọc & giữ chỗ',
        shortMobileLabel: 'Đặt cọc',
        groupId: 'core_ops',
        icon: KeyRound,
        requiredCapability: 'canManageDeposits',
        supportsBuildingScope: true,
        hasPeriodToolbar: false,
        countKey: 'deposits',
        description:
          'Quản lý phiếu giữ chỗ, tiền cọc, thời hạn giữ phòng và chuyển hợp đồng',
      },
      {
        id: 'contracts',
        label: 'Hợp đồng',
        shortMobileLabel: 'Hợp đồng',
        groupId: 'core_ops',
        icon: FileSignature,
        requiredCapability: 'canManageContracts',
        supportsBuildingScope: true,
        hasPeriodToolbar: false,
        countKey: 'contracts',
        description:
          'Hợp đồng thuê đang hiệu lực, biểu giá điện nước áp dụng và theo dõi đáo hạn',
      },
    ],
  },
  {
    id: 'finance_summary',
    label: 'TÀI CHÍNH VÀ TỔNG HỢP',
    items: [
      {
        id: 'settlements',
        label: 'Tổng hợp & Cron',
        shortMobileLabel: 'Tổng hợp',
        groupId: 'finance_summary',
        icon: ClipboardCheck,
        requiredCapability: 'canManageSettlements',
        supportsBuildingScope: true,
        hasPeriodToolbar: true,
        description:
          'Chốt chỉ số điện nước cuối kỳ, kiểm duyệt ngoại lệ và trạng thái tác vụ Cron',
      },
      {
        id: 'invoices',
        label: 'Hóa đơn',
        shortMobileLabel: 'Hóa đơn',
        groupId: 'finance_summary',
        icon: Receipt,
        requiredCapability: 'canManageInvoices',
        supportsBuildingScope: true,
        hasPeriodToolbar: true,
        countKey: 'invoicesUnpaid',
        description:
          'Hóa đơn tiền phòng, điện, nước, dịch vụ và theo dõi công nợ theo kỳ',
      },
      {
        id: 'payments',
        label: 'Thanh toán và đối soát',
        shortMobileLabel: 'Đối soát',
        groupId: 'finance_summary',
        icon: CreditCard,
        requiredCapability: 'canManagePayments',
        supportsBuildingScope: true,
        hasPeriodToolbar: true,
        description:
          'Giao dịch chuyển khoản, VietQR động và đối soát SePay / payOS / Tingee',
      },
      {
        id: 'finance',
        label: 'Thu chi và sổ quỹ',
        shortMobileLabel: 'Sổ quỹ',
        groupId: 'finance_summary',
        icon: Wallet,
        requiredCapability: 'canAccessFinance',
        supportsBuildingScope: true,
        hasPeriodToolbar: true,
        description:
          'Ghi nhận phiếu thu, phiếu chi vận hành và cân đối dòng tiền thực tế',
      },
      {
        id: 'reports',
        label: 'Báo cáo doanh thu',
        shortMobileLabel: 'Báo cáo',
        groupId: 'finance_summary',
        icon: BarChart3,
        requiredCapability: 'canViewReports',
        supportsBuildingScope: true,
        hasPeriodToolbar: true,
        description:
          'Phân tích công suất lấp đầy, doanh thu hợp đồng và thực thu theo tòa nhà',
      },
    ],
  },
  {
    id: 'system',
    label: 'HỆ THỐNG',
    items: [
      {
        id: 'settings',
        label: 'Cài đặt & Thiết lập',
        shortMobileLabel: 'Cài đặt',
        groupId: 'system',
        icon: Settings,
        requiredCapability: 'canManageSettings',
        supportsBuildingScope: false,
        hasPeriodToolbar: false,
        description:
          'Cấu hình tổ chức, phân quyền nhân sự, biểu giá điện nước và tích hợp hệ thống',
      },
    ],
  },
];

export const NAV_ITEMS_CONFIG: NavItemConfig[] = NAV_GROUPS_CONFIG.flatMap(
  (group) => group.items
);

export function getCurrentVnPeriodKey(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value || '2026';
  const m = parts.find((p) => p.type === 'month')?.value || '10';
  return `${y}-${m}`;
}

export function formatPeriodDisplay(periodKey: string): string {
  if (!/^\d{4}-\d{2}$/.test(periodKey)) return periodKey;
  const [y, m] = periodKey.split('-');
  return `Tháng ${m}/${y}`;
}

