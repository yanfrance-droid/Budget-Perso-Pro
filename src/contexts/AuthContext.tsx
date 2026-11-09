import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiClient, getAuthToken, setAuthToken } from '../services/apiClient';

export interface UserSession {
  token: string;
  userId: string;
  username: string;
}

export interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  hasUsers: boolean;
  session: UserSession | null;
  user: { id: string; username: string } | null;
  error: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  setup: (username: string, password: string) => Promise<{ success: boolean; recoveryKey?: string }>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
  resetPasswordWithRecoveryKey: (username: string, recoveryKey: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
  getRecoveryKey: () => Promise<string>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasUsers, setHasUsers] = useState<boolean>(true);
  const [session, setSession] = useState<UserSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkAuthStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Vérification santé serveur et détection premier lancement
      const health = await apiClient.health();
      setHasUsers(health.hasUsers);

      // Si aucun utilisateur n'existe encore sur le serveur, on n'est pas authentifié mais le setup est requis
      if (!health.hasUsers) {
        setIsAuthenticated(false);
        setSession(null);
        setIsLoading(false);
        return;
      }

      // 2. Si un jeton est stocké, vérifier s'il est encore valide côté serveur
      const token = getAuthToken();
      if (token) {
        try {
          const me = await apiClient.getMe();
          if (me.session) {
            setIsAuthenticated(true);
            setSession(me.session);
          } else {
            setAuthToken(null);
            setIsAuthenticated(false);
            setSession(null);
          }
        } catch {
          setAuthToken(null);
          setIsAuthenticated(false);
          setSession(null);
        }
      } else {
        setIsAuthenticated(false);
        setSession(null);
      }
    } catch (err: any) {
      console.warn('Vérification serveur non disponible :', err.message);
      // Ne pas forcer une fausse authentification sans jeton valide
      const token = getAuthToken();
      if (!token) {
        setIsAuthenticated(false);
        setSession(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  // Réception de l'événement 401 Unauthorized pour réafficher immédiatement la modale de connexion
  useEffect(() => {
    const handleUnauthorized = () => {
      setAuthToken(null);
      setIsAuthenticated(false);
      setSession(null);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('auth:unauthorized', handleUnauthorized);
      return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
    }
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    setError(null);
    try {
      const res = await apiClient.login({ username, password });
      if (res.success && res.session) {
        setIsAuthenticated(true);
        setSession(res.session);
        return true;
      }
      return false;
    } catch (err: any) {
      setError(err.message || 'Identifiants invalides.');
      return false;
    }
  };

  const setup = async (username: string, password: string): Promise<{ success: boolean; recoveryKey?: string }> => {
    setError(null);
    try {
      const res = await apiClient.setup({ username, password });
      if (res.success && res.session) {
        setHasUsers(true);
        setIsAuthenticated(true);
        setSession(res.session);
        return { success: true, recoveryKey: (res as any).recoveryKey };
      }
      return { success: false };
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la configuration initiale.');
      return { success: false };
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> => {
    setError(null);
    try {
      const res = await apiClient.auth.changePassword({ currentPassword, newPassword });
      return { success: true, message: res.message || 'Mot de passe modifié avec succès.' };
    } catch (err: any) {
      const msg = err.message || 'Erreur lors du changement de mot de passe.';
      setError(msg);
      throw new Error(msg);
    }
  };

  const resetPasswordWithRecoveryKey = async (
    username: string, 
    recoveryKey: string, 
    newPassword: string
  ): Promise<{ success: boolean; message: string }> => {
    setError(null);
    try {
      const res = await apiClient.auth.resetPasswordWithRecoveryKey({ username, recoveryKey, newPassword });
      return { success: true, message: res.message || 'Mot de passe réinitialisé avec succès.' };
    } catch (err: any) {
      const msg = err.message || 'Erreur lors de la réinitialisation du mot de passe.';
      setError(msg);
      throw new Error(msg);
    }
  };

  const getRecoveryKey = async (): Promise<string> => {
    const res = await apiClient.auth.getRecoveryKey();
    return res.recoveryKey;
  };

  const logout = async () => {
    try {
      await apiClient.logout();
    } catch {
      // Ignorer les erreurs réseau lors de la déconnexion
    } finally {
      setAuthToken(null);
      setIsAuthenticated(false);
      setSession(null);
    }
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        hasUsers,
        session,
        user: session ? { id: session.userId, username: session.username } : null,
        error,
        login,
        setup,
        logout,
        changePassword,
        resetPasswordWithRecoveryKey,
        getRecoveryKey,
        clearError
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth doit être utilisé à l\'intérieur d\'un AuthProvider');
  }
  return context;
}
