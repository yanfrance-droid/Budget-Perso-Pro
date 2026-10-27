import React, { createContext, useContext, useState, useEffect } from 'react';

export type ThemeMode = 'light' | 'dark' | 'auto';

export interface UIPreferencesContextType {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  isPrivacyMode: boolean;
  togglePrivacyMode: () => void;
  setPrivacyMode: (active: boolean) => void;
}

const UIPreferencesContext = createContext<UIPreferencesContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'budget_pref_theme';
const PRIVACY_STORAGE_KEY = 'budget_pref_privacy';

export const UIPreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode;
      if (saved === 'light' || saved === 'dark' || saved === 'auto') return saved;
    }
    return 'light';
  });

  const [isPrivacyMode, setIsPrivacyModeState] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem(PRIVACY_STORAGE_KEY) === 'true';
    }
    return false;
  });

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    }
  };

  const setPrivacyMode = (active: boolean) => {
    setIsPrivacyModeState(active);
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(PRIVACY_STORAGE_KEY, active ? 'true' : 'false');
    }
  };

  const togglePrivacyMode = () => {
    setPrivacyMode(!isPrivacyMode);
  };

  // Application dynamique des classes CSS globales
  useEffect(() => {
    const root = document.documentElement;

    // Gestion du thème clair / sombre
    let effectiveTheme = theme;
    if (theme === 'auto') {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      effectiveTheme = prefersDark ? 'dark' : 'light';
    }

    if (effectiveTheme === 'dark') {
      root.classList.add('dark-theme');
    } else {
      root.classList.remove('dark-theme');
    }

    // Gestion du mode discret
    if (isPrivacyMode) {
      root.classList.add('privacy-mode-active');
    } else {
      root.classList.remove('privacy-mode-active');
    }
  }, [theme, isPrivacyMode]);

  return (
    <UIPreferencesContext.Provider
      value={{
        theme,
        setTheme,
        isPrivacyMode,
        togglePrivacyMode,
        setPrivacyMode
      }}
    >
      {children}
    </UIPreferencesContext.Provider>
  );
};

export function useUIPreferences(): UIPreferencesContextType {
  const context = useContext(UIPreferencesContext);
  if (!context) {
    throw new Error('useUIPreferences doit être utilisé à l\'intérieur de UIPreferencesProvider');
  }
  return context;
}
