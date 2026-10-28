export type Role = 'ORG_ADMIN' | 'MANAGER';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: Role;
  roleTitle: string;
  avatar?: string;
  organizationId: string;
  organizationName: string;
  assignedBuildingIds: string[] | 'ALL';
  capabilities: {
    canViewOverview: boolean;
    canManageBuildings: boolean;
    canManageRooms: boolean;
    canManageTenants: boolean;
    canManageContracts: boolean;
    canManageDeposits: boolean;
    canRefundDeposits: boolean;
    canManageSettlements: boolean;
    canManageInvoices: boolean;
    canManagePayments: boolean;
    canAccessFinance: boolean;
    canViewReports: boolean;
    canManageSettings: boolean;
    canManageRoles: boolean;
  };
}

export interface AuthState {
  isAuthenticated: boolean;
  user: UserProfile | null;
  activeBuildingId: string | 'ALL';
  isLoading: boolean;
}
