import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, Role } from '@/shared/types/auth';
import { BOOTSTRAP_ADMIN, SAMPLE_MANAGER } from '@/app/auth/mockUsers';

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  activeBuildingId: string | 'ALL';
  login: (role: Role, customEmail?: string) => void;
  logout: () => void;
  setActiveBuildingId: (id: string | 'ALL') => void;
  hasCapability: (key: keyof UserProfile['capabilities']) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('adhome_auth_user');
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {
          return BOOTSTRAP_ADMIN;
        }
      }
    }
    return BOOTSTRAP_ADMIN; // Default logged in as bootstrap admin
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
    }
  }, [user]);

  useEffect(() => {
    localStorage.setItem('adhome_active_building', activeBuildingId);
  }, [activeBuildingId]);

  const login = (role: Role, _customEmail?: string) => {
    if (role === 'ORG_ADMIN') {
      setUser(BOOTSTRAP_ADMIN);
      setActiveBuildingIdState('ALL');
    } else {
      setUser(SAMPLE_MANAGER);
      setActiveBuildingIdState('bld-01'); // Auto scope to first assigned building
    }
  };

  const logout = () => {
    setUser(null);
  };

  const setActiveBuildingId = (id: string | 'ALL') => {
    if (user && user.role === 'MANAGER' && user.assignedBuildingIds !== 'ALL') {
      if (id !== 'ALL' && !user.assignedBuildingIds.includes(id)) {
        return; // Reject out-of-scope building for manager
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
