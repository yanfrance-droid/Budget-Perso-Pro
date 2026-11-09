import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom';
import { LayoutDashboard, Wallet, CreditCard, PiggyBank, Settings, FileText, HeartPulse, Building, BarChart3, LogOut, AlertCircle, RotateCcw, Eye, EyeOff, Moon, Sun, ShoppingBag, HelpCircle, Menu, X, CalendarClock, SlidersHorizontal } from 'lucide-react';
import Incomes from './pages/Incomes';
import FixedExpenses from './pages/FixedExpenses';
import VariableExpenses from './pages/VariableExpenses';
import CurrentExpenses from './pages/CurrentExpenses';
import FutureExpenses from './pages/FutureExpenses';
import PlannedExpenses from './pages/PlannedExpenses';
import ExpenseAnalysis from './pages/ExpenseAnalysis';
import ChargesAnalysis from './pages/ChargesAnalysis';
import Health from './pages/Health';
import Loans from './pages/Loans';
import Savings from './pages/Savings';

import Dashboard from './pages/Dashboard';
import SettingsPage from './pages/Settings';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ServerDataProvider, useServerDataOptional } from './contexts/ServerDataContext';
import { UndoRedoControls } from './components/ui/UndoRedoControls';
import { AuthModal } from './components/auth/AuthModal';
import { useUIPreferences } from './contexts/UIPreferencesContext';

function getPageTitle(pathname: string): string {
  switch (pathname) {
    case '/': return 'Tableau de bord';
    case '/revenus': return 'Revenus';
    case '/charges-fixes': return 'Charges fixes';
    case '/charges-variables': return 'Charges variables';
    case '/credits': return 'Crédits';
    case '/sante': return 'Santé';
    case '/depenses-courantes': return 'Dépenses';
    case '/depenses-futures': return 'Dépenses futures';
    case '/mes-projets': return 'Mes projets';
    case '/analyse-depenses': return 'Analyse des dépenses';
    case '/analyse-charges': return 'Analyse des charges';
    case '/epargne': return 'Épargne & transferts';
    case '/parametres': return 'Paramètres';
    default: return 'Budget Perso Pro';
  }
}

function AppContent() {
  const { isAuthenticated, isLoading: isAuthLoading, user, logout } = useAuth();
  const serverData = useServerDataOptional();
  const { isPrivacyMode, togglePrivacyMode, theme, setTheme } = useUIPreferences();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  // Fermeture automatique du menu mobile lors du changement d'URL
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname, location.search]);

  return (
    <>
      {!isAuthenticated && !isAuthLoading && (
        <AuthModal />
      )}
      {serverData?.error && (
        <div 
          role="alert"
          style={{
            backgroundColor: '#fee2e2',
            borderBottom: '2px solid #ef4444',
            color: '#991b1b',
            padding: '0.75rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            fontWeight: 600,
            fontSize: '0.875rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <AlertCircle size={20} color="#dc2626" />
            <span>Erreur de communication avec le serveur SQLite : {serverData.error}</span>
          </div>
          <button
            type="button"
            onClick={() => serverData.refreshAll()}
            style={{
              backgroundColor: '#dc2626',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              padding: '0.35rem 0.85rem',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            <RotateCcw size={14} />
            Réessayer la connexion
          </button>
        </div>
      )}

      {/* HEADER MOBILE (Visible uniquement sous 768px via CSS) */}
      <header className="mobile-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <button
            type="button"
            className="mobile-menu-toggle"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label={isMobileMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu de navigation'}
          >
            {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-light, #fff)' }}>Budget Perso Pro</span>
            <div style={{ fontSize: '0.68rem', opacity: 0.8, color: 'var(--text-light, #fff)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ 
                width: 6, 
                height: 6, 
                borderRadius: '50%', 
                backgroundColor: serverData?.error ? '#ef4444' : (serverData ? '#22c55e' : '#f59e0b'), 
                display: 'inline-block' 
              }} />
              <span>{serverData?.error ? 'Hors ligne' : 'Serveur connecté'}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {serverData && <UndoRedoControls compact />}
          <button
            type="button"
            title={isPrivacyMode ? 'Désactiver le mode discret' : 'Activer le mode discret'}
            onClick={togglePrivacyMode}
            className="mobile-header-btn"
          >
            {isPrivacyMode ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <button
            type="button"
            title={theme === 'dark' ? 'Thème clair' : 'Thème sombre'}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="mobile-header-btn"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>

      {/* BACKDROP MOBILE */}
      {isMobileMenuOpen && (
        <div 
          className="mobile-backdrop" 
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className="app-container">
        <aside className={`sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
          <div className="sidebar-header" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Budget Perso Pro</span>
              <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                <button
                  type="button"
                  title={isPrivacyMode ? 'Désactiver le mode discret' : 'Activer le mode discret (masquer les montants)'}
                  onClick={togglePrivacyMode}
                  style={{
                    background: isPrivacyMode ? 'rgba(59, 130, 246, 0.25)' : 'transparent',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: '4px',
                    color: isPrivacyMode ? '#60a5fa' : 'rgba(255,255,255,0.7)',
                    padding: '0.25rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  {isPrivacyMode ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button
                  type="button"
                  title={theme === 'dark' ? 'Basculer en thème clair' : 'Basculer en thème sombre'}
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: '4px',
                    color: 'rgba(255,255,255,0.7)',
                    padding: '0.25rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                </button>
              </div>
            </div>
            <div style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ 
                width: 8, 
                height: 8, 
                borderRadius: '50%', 
                backgroundColor: serverData?.error ? '#ef4444' : (serverData ? '#22c55e' : '#f59e0b'), 
                display: 'inline-block' 
              }} />
              <span>{serverData?.error ? 'Serveur déconnecté' : (serverData ? 'Serveur SQLite' : 'Connexion...')}</span>
              {user && <span style={{ marginLeft: 'auto', opacity: 0.85 }}>({user.username})</span>}
            </div>
          </div>
          <nav className="sidebar-nav">
            <NavLink to="/" end onClick={() => setIsMobileMenuOpen(false)}><LayoutDashboard size={18} style={{marginRight: '8px'}} /> Tableau de bord</NavLink>
            <NavLink to="/revenus" onClick={() => setIsMobileMenuOpen(false)}><Wallet size={18} style={{marginRight: '8px'}} /> Revenus</NavLink>
            <NavLink to="/charges-fixes" onClick={() => setIsMobileMenuOpen(false)}><FileText size={18} style={{marginRight: '8px'}} /> Charges fixes</NavLink>
            <NavLink to="/charges-variables" onClick={() => setIsMobileMenuOpen(false)}><FileText size={18} style={{marginRight: '8px'}} /> Charges variables</NavLink>
            <NavLink to="/credits" onClick={() => setIsMobileMenuOpen(false)}><Building size={18} style={{marginRight: '8px'}} /> Crédits</NavLink>
            <NavLink to="/sante" onClick={() => setIsMobileMenuOpen(false)}><HeartPulse size={18} style={{marginRight: '8px'}} /> Santé</NavLink>
            <NavLink to="/depenses-courantes" onClick={() => setIsMobileMenuOpen(false)}><CreditCard size={18} style={{marginRight: '8px'}} /> Dépenses</NavLink>
            <NavLink to="/depenses-futures" onClick={() => setIsMobileMenuOpen(false)}><CalendarClock size={18} style={{marginRight: '8px'}} /> Dépenses futures</NavLink>
            <NavLink to="/analyse-depenses" onClick={() => setIsMobileMenuOpen(false)}><BarChart3 size={18} style={{marginRight: '8px'}} /> Analyse des dépenses</NavLink>
            <NavLink to="/analyse-charges" onClick={() => setIsMobileMenuOpen(false)}><SlidersHorizontal size={18} style={{marginRight: '8px'}} /> Analyse des charges</NavLink>
            <NavLink to="/mes-projets" onClick={() => setIsMobileMenuOpen(false)}><ShoppingBag size={18} style={{marginRight: '8px'}} /> Mes projets</NavLink>
            <NavLink to="/epargne" onClick={() => setIsMobileMenuOpen(false)}><PiggyBank size={18} style={{marginRight: '8px'}} /> Épargne & transferts</NavLink>
          </nav>

          <div className="sidebar-bottom">
            <NavLink to="/parametres?tab=help" onClick={() => setIsMobileMenuOpen(false)} title="Manuel utilisateur et documentation technique">
              <HelpCircle size={18} style={{marginRight: '8px'}} /> Aide & Documentation
            </NavLink>
            <NavLink to="/parametres" onClick={() => setIsMobileMenuOpen(false)}><Settings size={18} style={{marginRight: '8px'}} /> Paramètres</NavLink>
            {isAuthenticated && (
              <div style={{ padding: '0.5rem 1rem 0.75rem 1rem' }}>
                <button
                  type="button"
                  onClick={logout}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: 'rgba(255,255,255,0.8)',
                    padding: '0.4rem 0.75rem',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    cursor: 'pointer',
                    fontSize: '0.8rem'
                  }}
                >
                  <LogOut size={14} /> Déconnexion
                </button>
              </div>
            )}
            <div style={{ textAlign: 'center', padding: '0.4rem 0 0.6rem 0', fontSize: '0.72rem', opacity: 0.65, color: 'var(--text-light, #ffffff)', userSelect: 'none' }}>
              PersonalBudgetPro v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0'}
            </div>
          </div>
        </aside>
        
        <div className="main-area">
          <header className="desktop-top-bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-main)' }}>
                {getPageTitle(location.pathname)}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {serverData && <UndoRedoControls />}
            </div>
          </header>

          <main className="main-content">
            <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/revenus" element={<Incomes />} />
            <Route path="/charges-fixes" element={<FixedExpenses />} />
            <Route path="/charges-variables" element={<VariableExpenses />} />
            <Route path="/depenses-courantes" element={<CurrentExpenses />} />
            <Route path="/depenses-futures" element={<FutureExpenses />} />
            <Route path="/mes-projets" element={<PlannedExpenses />} />
            <Route path="/analyse-depenses" element={<ExpenseAnalysis />} />
            <Route path="/analyse-charges" element={<ChargesAnalysis />} />
            <Route path="/sante" element={<Health />} />
            <Route path="/credits" element={<Loans />} />
            <Route path="/epargne" element={<Savings />} />
            <Route path="/parametres" element={<SettingsPage />} />
            {/* Redirection par défaut vers le Tableau de bord pour toute route inconnue ou malformée */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </main>
        </div>
      </div>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ServerDataProvider>
          <AppContent />
        </ServerDataProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
