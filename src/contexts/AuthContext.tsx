import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Role, Permission, ROLE_PERMISSIONS } from '../types';
import { api } from '../services/api';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password?: string) => Promise<void>;
  loginWith2fa: (challenge: string, code: string) => Promise<void>;
  signupOrg: (orgName: string, orgSlug: string, adminEmail: string, adminName: string, password: string) => Promise<void>;
  loginAsDemoUser: (userId: string) => Promise<void>;
  impersonateUser: (userId: string) => Promise<void>;
  logout: () => void;
  can: (permission: Permission) => boolean;
  hasPermission: (permission: string) => boolean;
  loading: boolean;
}

export type Login2faRequired = { requires2fa: true; challenge: string };

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [rolePermissions, setRolePermissions] = useState<Record<Role, string[]> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const currentUser = await api.auth.me();
        setUser(currentUser);
      } catch (e) {
        // Silent fail on session restoration
      } finally {
        setLoading(false);
      }
    };
    initAuth();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadRolePermissions = async () => {
      if (!user?.orgId) {
        setRolePermissions(null);
        return;
      }

      try {
        const permissions = await api.org.getRolePermissions();
        if (!cancelled) {
          setRolePermissions(permissions);
        }
      } catch {
        if (!cancelled) {
          setRolePermissions(null);
        }
      }
    };

    loadRolePermissions();
    return () => {
      cancelled = true;
    };
  }, [user?.orgId]);

  const login = async (email: string, password?: string) => {
    const result = await api.auth.login(email, password);
    if ('requires2fa' in result && result.requires2fa) {
      const err: any = new Error('2FA required');
      err.requires2fa = true;
      err.challenge = result.challenge;
      throw err;
    }
    setUser(result.user);
  };

  const loginWith2fa = async (challenge: string, code: string) => {
    const { user: loggedInUser } = await api.auth.verify2faLogin(challenge, code);
    setUser(loggedInUser);
  };

  const signupOrg = async (orgName: string, orgSlug: string, adminEmail: string, adminName: string, password: string) => {
    const result = await api.auth.signupOrg(orgName, orgSlug, adminEmail, adminName, password);
    setUser(result.user);
  };

  const loginAsDemoUser = async (userId: string) => {
    const { user: loggedInUser } = await api.auth.demoLogin(userId);
    setUser(loggedInUser);
    localStorage.setItem('nebula_auth_token', 'mock_jwt_token');
  };

  const impersonateUser = async (userId: string) => {
    await loginAsDemoUser(userId);
    // State update triggers re-render, effectively switching the view
    window.location.reload(); // Force reload to ensure all permission gates reset cleanly
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('nebula_auth_token');
  };

  const can = (permission: Permission): boolean => {
    if (!user) return false;
    const rolePerms = rolePermissions?.[user.role] || ROLE_PERMISSIONS[user.role] || [];
    const customPerms = user.customPermissions || [];
    return rolePerms.includes(permission) || customPerms.includes(permission);
  };

  const hasPermission = (permission: string): boolean => {
    if (!user) return false;
    const rolePerms = rolePermissions?.[user.role] || ROLE_PERMISSIONS[user.role] || [];
    const customPerms = user.customPermissions || [];
    return rolePerms.includes(permission as Permission) || customPerms.includes(permission);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, loginWith2fa, signupOrg, loginAsDemoUser, impersonateUser, logout, can, hasPermission, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
