import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, Role } from '@/shared/types/auth';
import { BOOTSTRAP_ADMIN, SAMPLE_MANAGER } from '@/app/auth/mockUsers';

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  activeBuildingId: string | 'ALL';
  login: (role: Role, customEmail?: string) => void;
  loginWithCredentials: (
    email: string,
    password: string
  ) => Promise<{ ok: boolean; message?: string; errorCode?: string }>;
  logout: () => void;
  setActiveBuildingId: (id: string | 'ALL') => void;
  hasCapability: (key: keyof UserProfile['capabilities']) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('adhome_auth_user');
      const token = localStorage.getItem('adhome_console_token');
      if (stored && token) {
        try {
          return JSON.parse(stored);
        } catch {
          return null;
        }
      }
    }
    return null; // Require explicit authentication by default
  });

  const [activeBuildingId, setActiveBuildingIdState] = useState<string | 'ALL'>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('adhome_active_building') || 'ALL';
    }
    return 'ALL';
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem('adhome_auth_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('adhome_auth_user');
      localStorage.removeItem('adhome_console_token');
    }
  }, [user]);

  useEffect(() => {
    localStorage.setItem('adhome_active_building', activeBuildingId);
  }, [activeBuildingId]);

  const loginWithCredentials = async (
    email: string,
    password: string
  ): Promise<{ ok: boolean; message?: string; errorCode?: string }> => {
    try {
      const res = await fetch('/api/v1/console/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        return {
          ok: false,
          errorCode: data.errorCode || 'LOGIN_FAILED',
          message: data.message || 'Email hoặc mật khẩu không chính xác.',
        };
      }

      localStorage.setItem('adhome_console_token', data.token);

      const mappedUser: UserProfile = {
        id: data.actor?.id || 'usr-admin-prod',
        name:
          data.actor?.id === 'usr-admin-prod'
            ? 'Quản trị viên Hệ thống'
            : data.actor?.email || 'AdHome Admin',
        email: data.actor?.email || email,
        role: data.actor?.role === 'ADMIN' ? 'ORG_ADMIN' : 'MANAGER',
        roleTitle:
          data.actor?.role === 'ADMIN'
            ? 'Chủ sở hữu & Quản trị hệ thống (Admin)'
            : 'Quản lý cơ sở',
        organizationId: data.actor?.orgId || 'org-adhome-anphu',
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

      setUser(mappedUser);
      setActiveBuildingIdState('ALL');
      return { ok: true };
    } catch {
      return {
        ok: false,
        errorCode: 'NETWORK_ERROR',
        message: 'Không thể kết nối đến máy chủ xác thực.',
      };
    }
  };

  const login = (role: Role, _customEmail?: string) => {
    if (role === 'ORG_ADMIN') {
      setUser(BOOTSTRAP_ADMIN);
      setActiveBuildingIdState('ALL');
    } else {
      setUser(SAMPLE_MANAGER);
      setActiveBuildingIdState('bld-01');
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('adhome_auth_user');
    localStorage.removeItem('adhome_console_token');
  };

  const setActiveBuildingId = (id: string | 'ALL') => {
    if (user && user.role === 'MANAGER' && user.assignedBuildingIds !== 'ALL') {
      if (id !== 'ALL' && !user.assignedBuildingIds.includes(id)) {
        return;
      }
    }
    setActiveBuildingIdState(id);
  };

  const hasCapability = (key: keyof UserProfile['capabilities']): boolean => {
    if (!user) return false;
    return Boolean(user.capabilities[key]);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        activeBuildingId,
        login,
        loginWithCredentials,
        logout,
        setActiveBuildingId,
        hasCapability,
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
