import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UserProfile, UserCapabilities } from '@/shared/types/auth';

export const CONSOLE_CSRF_HEADER = 'AdHome-Console';

interface BackendActorPayload {
  id: string;
  displayName?: string | null;
  email: string;
  role: 'ADMIN' | 'MANAGER' | string;
  orgId: string;
  orgName?: string;
  permissions?: string[];
  buildingScopes?: string[];
  sessionVersion?: number;
  capabilities?: Partial<UserCapabilities>;
}

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  activeBuildingId: string | 'ALL';
  loginWithCredentials: (
    email: string,
    password: string,
    rememberMe?: boolean
  ) => Promise<{ ok: boolean; message?: string; errorCode?: string }>;
  refreshSession: () => Promise<boolean>;
  logout: () => Promise<void>;
  setActiveBuildingId: (id: string | 'ALL') => void;
  hasCapability: (key: keyof UserCapabilities) => boolean;
  hasPermission: (permission: string) => boolean;
  isBuildingAllowed: (buildingIdOrCode: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function normalizeScopeId(raw: string): string {
  const clean = String(raw || '').trim().toLowerCase();
  if (!clean) return '';
  if (clean === '*' || clean === 'all') return '*';
  return clean.startsWith('bld-') ? clean : `bld-${clean}`;
}

function deriveCapabilitiesFromActor(actor: BackendActorPayload): UserCapabilities {
  const isAdmin =
    actor.role === 'ADMIN' ||
    (Array.isArray(actor.permissions) && actor.permissions.includes('system.admin'));
  const perms = new Set(Array.isArray(actor.permissions) ? actor.permissions : []);
  const serverCaps = actor.capabilities;

  const check = (capKey: keyof UserCapabilities, fallbackPermCheck: boolean): boolean => {
    if (serverCaps && typeof serverCaps[capKey] === 'boolean') {
      return Boolean(serverCaps[capKey]);
    }
    return isAdmin || fallbackPermCheck;
  };

  return {
    canViewOverview: check('canViewOverview', perms.has('overview.read') || perms.has('rooms.read')),
    canManageBuildings: check('canManageBuildings', perms.has('buildings.manage')),
    canManageRooms: check(
      'canManageRooms',
      perms.has('rooms.manage') || perms.has('rooms.publish.write') || perms.has('rooms.read')
    ),
    canManageTenants: check('canManageTenants', perms.has('tenants.manage')),
    canManageContracts: check('canManageContracts', perms.has('contracts.manage')),
    canManageDeposits: check('canManageDeposits', perms.has('deposits.manage')),
    canRefundDeposits: check('canRefundDeposits', perms.has('deposits.refund')),
    canManageSettlements: check('canManageSettlements', perms.has('settlements.manage')),
    canManageInvoices: check('canManageInvoices', perms.has('invoices.manage')),
    canManagePayments: check('canManagePayments', perms.has('payments.manage')),
    canAccessFinance: check('canAccessFinance', perms.has('finance.read')),
    canViewReports: check('canViewReports', perms.has('reports.read')),
    canManageSettings: check(
      'canManageSettings',
      perms.has('settings.manage') || perms.has('accounts.manage')
    ),
    canManageRoles: check('canManageRoles', perms.has('accounts.manage')),
  };
}

function mapActorToUserProfile(actor: BackendActorPayload): UserProfile {
  const isAdmin =
    actor.role === 'ADMIN' ||
    (Array.isArray(actor.permissions) && actor.permissions.includes('system.admin'));
  const rawScopes = Array.isArray(actor.buildingScopes) ? actor.buildingScopes : [];
  const normalizedScopes = rawScopes.map(normalizeScopeId).filter(Boolean);
  const hasWildcard = isAdmin || normalizedScopes.includes('*');

  return {
    id: actor.id,
    name:
      (actor.displayName && actor.displayName.trim()) ||
      (isAdmin ? 'Quản trị viên Hệ thống' : actor.email.split('@')[0]),
    email: actor.email,
    role: isAdmin ? 'ORG_ADMIN' : 'MANAGER',
    backendRole: isAdmin ? 'ADMIN' : 'MANAGER',
    roleTitle: isAdmin
      ? 'Quản trị viên Hệ thống (Admin)'
      : 'Quản lý tòa nhà (Manager)',
    organizationId: actor.orgId || 'org-adhome-anphu',
    organizationName: actor.orgName || 'Khu đô thị Ân Phú Serviced Living',
    permissions: Array.isArray(actor.permissions) ? actor.permissions : [],
    buildingScopes: hasWildcard ? ['*'] : normalizedScopes,
    assignedBuildingIds: hasWildcard ? 'ALL' : normalizedScopes,
    sessionVersion: Number(actor.sessionVersion || 1),
    capabilities: deriveCapabilitiesFromActor(actor),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeBuildingId, setActiveBuildingIdState] = useState<string | 'ALL'>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('adhome_active_building') || 'ALL';
    }
    return 'ALL';
  });

  // Security hygiene: purge any legacy raw JWT or cached user profile from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('adhome_console_token');
      localStorage.removeItem('adhome_auth_user');
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('adhome_active_building', activeBuildingId);
    }
  }, [activeBuildingId]);

  const applyVerifiedUser = useCallback((nextUser: UserProfile | null) => {
    setUser(nextUser);
    if (!nextUser) {
      setActiveBuildingIdState('ALL');
      return;
    }
    if (nextUser.assignedBuildingIds !== 'ALL') {
      setActiveBuildingIdState((prev) => {
        if (prev === 'ALL') return 'ALL';
        const normalizedPrev = normalizeScopeId(prev);
        return nextUser.assignedBuildingIds !== 'ALL' &&
          nextUser.assignedBuildingIds.includes(normalizedPrev)
          ? normalizedPrev
          : 'ALL';
      });
    }
  }, []);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/v1/console/auth/me', {
        method: 'GET',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
        },
      });
      if (!res.ok) {
        applyVerifiedUser(null);
        return false;
      }
      const data = await res.json().catch(() => ({}));
      if (!data.ok || !data.actor) {
        applyVerifiedUser(null);
        return false;
      }
      const profile = mapActorToUserProfile(data.actor);
      applyVerifiedUser(profile);
      return true;
    } catch {
      applyVerifiedUser(null);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [applyVerifiedUser]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const loginWithCredentials = async (
    email: string,
    password: string,
    rememberMe = true
  ): Promise<{ ok: boolean; message?: string; errorCode?: string }> => {
    try {
      const res = await fetch('/api/v1/console/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': CONSOLE_CSRF_HEADER,
        },
        body: JSON.stringify({ email: email.trim(), password, rememberMe }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok || !data.actor) {
        return {
          ok: false,
          errorCode: data.errorCode || 'LOGIN_FAILED',
          message: data.message || 'Email hoặc mật khẩu không chính xác.',
        };
      }

      // Ensure raw token is never persisted in localStorage
      if (typeof window !== 'undefined') {
        localStorage.removeItem('adhome_console_token');
        localStorage.removeItem('adhome_auth_user');
      }

      const mappedUser = mapActorToUserProfile(data.actor);
      applyVerifiedUser(mappedUser);
      setActiveBuildingIdState('ALL');
      if (typeof window !== 'undefined' && window.location.pathname === '/login') {
        window.history.replaceState({}, '', '/');
      }
      return { ok: true };
    } catch {
      return {
        ok: false,
        errorCode: 'NETWORK_ERROR',
        message: 'Không thể kết nối đến máy chủ xác thực.',
      };
    }
  };

  const logout = useCallback(async () => {
    try {
      await fetch('/api/v1/console/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'X-Requested-With': CONSOLE_CSRF_HEADER,
        },
      });
    } catch {
      // Best-effort server logout; clear client state unconditionally
    } finally {
      applyVerifiedUser(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('adhome_console_token');
        localStorage.removeItem('adhome_auth_user');
        localStorage.removeItem('adhome_active_module');
        if (window.location.pathname !== '/login') {
          window.history.replaceState({}, '', '/login');
        }
      }
    }
  }, [applyVerifiedUser]);

  const isBuildingAllowed = useCallback(
    (buildingIdOrCode: string): boolean => {
      if (!user) return false;
      if (user.assignedBuildingIds === 'ALL') return true;
      const normalized = normalizeScopeId(buildingIdOrCode);
      if (!normalized) return false;
      return user.assignedBuildingIds.includes(normalized);
    },
    [user]
  );

  const setActiveBuildingId = useCallback(
    (id: string | 'ALL') => {
      if (id === 'ALL') {
        setActiveBuildingIdState('ALL');
        return;
      }
      if (user && user.assignedBuildingIds !== 'ALL') {
        const normalized = normalizeScopeId(id);
        if (!user.assignedBuildingIds.includes(normalized)) {
          return;
        }
      }
      setActiveBuildingIdState(id);
    },
    [user]
  );

  const hasCapability = useCallback(
    (key: keyof UserCapabilities): boolean => {
      if (!user) return false;
      return Boolean(user.capabilities[key]);
    },
    [user]
  );

  const hasPermission = useCallback(
    (permission: string): boolean => {
      if (!user) return false;
      if (user.backendRole === 'ADMIN' || user.permissions.includes('system.admin')) {
        return true;
      }
      return user.permissions.includes(permission);
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        activeBuildingId,
        loginWithCredentials,
        refreshSession,
        logout,
        setActiveBuildingId,
        hasCapability,
        hasPermission,
        isBuildingAllowed,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
