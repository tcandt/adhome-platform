import { UserProfile } from '@/shared/types/auth';

export const BOOTSTRAP_ADMIN: UserProfile = {
  id: 'usr-admin-01',
  name: 'Nguyễn Đức Tính',
  email: 'admin@adhome.vn',
  role: 'ORG_ADMIN',
  roleTitle: 'Chủ sở hữu & Quản trị hệ thống (Admin)',
  organizationId: 'org-adhome-living',
  organizationName: 'AdHome Living Corp',
  assignedBuildingIds: 'ALL',
  capabilities: {
    canViewOverview: true,
    canManageBuildings: true,
    canManageRooms: true,
    canManageTenants: true,
    canManageContracts: true,
    canManageDeposits: true,
    canRefundDeposits: true,
    canManageSettlements: true,
    canManageInvoices: true,
    canManagePayments: true,
    canAccessFinance: true,
    canViewReports: true,
    canManageSettings: true,
    canManageRoles: true,
  },
};

export const SAMPLE_MANAGER: UserProfile = {
  id: 'usr-manager-02',
  name: 'Lê Hoàng Nam',
  email: 'manager@adhome.vn',
  role: 'MANAGER',
  roleTitle: 'Quản lý cơ sở (Property Manager)',
  organizationId: 'org-adhome-living',
  organizationName: 'AdHome Living Corp',
  assignedBuildingIds: ['bld-01', 'bld-02'],
  capabilities: {
    canViewOverview: true,
    canManageBuildings: true,
    canManageRooms: true,
    canManageTenants: true,
    canManageContracts: true,
    canManageDeposits: true,
    canRefundDeposits: false, // Locked by Admin
    canManageSettlements: false, // Locked
    canManageInvoices: false, // Locked
    canManagePayments: false, // Locked
    canAccessFinance: false, // Locked
    canViewReports: true,
    canManageSettings: false, // Locked
    canManageRoles: false, // Locked
  },
};
