import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Lock, ShieldCheck, UserPlus, LogIn, AlertCircle, KeyRound, ArrowLeft, CheckCircle2 } from 'lucide-react';

export const AuthModal: React.FC = () => {
  const { hasUsers, login, setup, resetPasswordWithRecoveryKey, error, clearError } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // États Mode "Mot de passe oublié"
  const [isForgotMode, setIsForgotMode] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);

  // État affichage clé générée au setup
  const [generatedRecoveryKey, setGeneratedRecoveryKey] = useState<string | null>(null);

  const [localError, setLocalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setResetSuccessMessage(null);
    clearError();

    if (isForgotMode) {
      if (!username.trim()) {
        setLocalError('Veuillez renseigner votre nom d\'utilisateur.');
        return;
      }
      if (!recoveryKey.trim()) {
        setLocalError('Veuillez renseigner votre clé de secours.');
        return;
      }
      if (newPassword.length < 6) {
        setLocalError('Le nouveau mot de passe doit comporter au moins 6 caractères.');
        return;
      }
      if (newPassword !== confirmNewPassword) {
        setLocalError('Les nouveaux mots de passe ne correspondent pas.');
        return;
      }

      setIsSubmitting(true);
      try {
        const res = await resetPasswordWithRecoveryKey(username.trim(), recoveryKey.trim(), newPassword);
        setResetSuccessMessage(res.message);
        setIsForgotMode(false);
        setPassword('');
        setRecoveryKey('');
        setNewPassword('');
        setConfirmNewPassword('');
      } catch (err: any) {
        setLocalError(err.message || 'Échec de la réinitialisation.');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (!username.trim()) {
      setLocalError('Veuillez renseigner votre nom d\'utilisateur.');
      return;
    }
    if (!password) {
      setLocalError('Veuillez renseigner votre mot de passe.');
      return;
    }

    if (!hasUsers) {
      if (password.length < 6) {
        setLocalError('Le mot de passe doit comporter au moins 6 caractères.');
        return;
      }
      if (password !== confirmPassword) {
        setLocalError('Les mots de passe ne correspondent pas.');
        return;
      }

      setIsSubmitting(true);
      try {
        const res = await setup(username.trim(), password);
        if (res.recoveryKey) {
          setGeneratedRecoveryKey(res.recoveryKey);
        }
      } finally {
        setIsSubmitting(false);
      }
    } else {
      setIsSubmitting(true);
      try {
        await login(username.trim(), password);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const activeError = localError || error;

  // Si une clé vient d'être générée lors du premier setup, l'afficher pour que l'utilisateur la note
  if (generatedRecoveryKey) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem'
      }}>
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: '2.5rem',
          maxWidth: '460px',
          width: '100%',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #e2e8f0',
          textAlign: 'center'
        }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '54px',
            height: '54px',
            borderRadius: '50%',
            backgroundColor: '#dcfce7',
            color: '#16a34a',
            marginBottom: '1rem'
          }}>
            <KeyRound size={28} />
          </div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.5rem 0' }}>
            Compte créé avec succès !
          </h2>
          <p style={{ fontSize: '0.875rem', color: '#64748b', lineHeight: 1.5, marginBottom: '1.25rem' }}>
            Voici votre <strong>Clé de secours unique</strong>. Conservez-la précieusement : elle vous permettra de réinitialiser votre mot de passe en cas d'oubli.
          </p>
          <div style={{
            backgroundColor: '#f8fafc',
            border: '2px dashed #cbd5e1',
            borderRadius: '8px',
            padding: '1rem',
            fontFamily: 'monospace',
            fontSize: '1.15rem',
            fontWeight: 700,
            color: '#1e293b',
            letterSpacing: '1px',
            marginBottom: '1.5rem',
            userSelect: 'all'
          }}>
            {generatedRecoveryKey}
          </div>
          <button
            type="button"
            onClick={() => setGeneratedRecoveryKey(null)}
            style={{
              width: '100%',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              padding: '0.75rem',
              borderRadius: '8px',
              border: 'none',
              fontWeight: 600,
              fontSize: '0.95rem',
              cursor: 'pointer'
            }}
          >
            J'ai bien noté ma clé et j'accède à mon budget
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '1rem'
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        padding: '2.5rem',
        maxWidth: '420px',
        width: '100%',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        border: '1px solid #e2e8f0'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '54px',
            height: '54px',
            borderRadius: '50%',
            backgroundColor: isForgotMode ? '#fef3c7' : '#eff6ff',
            color: isForgotMode ? '#d97706' : '#2563eb',
            marginBottom: '1rem'
          }}>
            {isForgotMode ? <KeyRound size={28} /> : (hasUsers ? <Lock size={28} /> : <ShieldCheck size={28} />)}
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.5rem 0' }}>
            {isForgotMode 
              ? 'Récupération de compte' 
              : (hasUsers ? 'Connexion Serveur' : 'Configuration Initiale')}
          </h2>
          <p style={{ fontSize: '0.875rem', color: '#64748b', margin: 0 }}>
            {isForgotMode
              ? 'Réinitialisez votre mot de passe avec votre clé'
              : (hasUsers
                ? 'Accès centralisé à vos finances (Proxmox VPN)'
                : 'Créez votre compte administrateur maître')}
          </p>
        </div>

        {resetSuccessMessage && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            backgroundColor: '#f0fdf4',
            color: '#16a34a',
            border: '1px solid #bbf7d0',
            borderRadius: '8px',
            padding: '0.75rem 1rem',
            marginBottom: '1.25rem',
            fontSize: '0.875rem'
          }}>
            <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
            <span>{resetSuccessMessage}</span>
          </div>
        )}

        {activeError && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            backgroundColor: '#fef2f2',
            color: '#dc2626',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            padding: '0.75rem 1rem',
            marginBottom: '1.25rem',
            fontSize: '0.875rem'
          }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{activeError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
              Nom d'utilisateur
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Ex: yann"
              disabled={isSubmitting}
              autoFocus
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.95rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {isForgotMode ? (
            <>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                  Clé de secours unique
                </label>
                <input
                  type="text"
                  value={recoveryKey}
                  onChange={(e) => setRecoveryKey(e.target.value)}
                  placeholder="BUDGET-XXXX-XXXX-XXXX"
                  disabled={isSubmitting}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.95rem',
                    fontFamily: 'monospace',
                    textTransform: 'uppercase',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                  Nouveau mot de passe
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={isSubmitting}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.95rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                  Confirmer le nouveau mot de passe
                </label>
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={isSubmitting}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.95rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>
                  Mot de passe
                </label>
                {hasUsers && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsForgotMode(true);
                      setLocalError(null);
                      clearError();
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#2563eb',
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                      padding: 0,
                      textDecoration: 'underline'
                    }}
                  >
                    Mot de passe oublié ?
                  </button>
                )}
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.95rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          )}

          {!hasUsers && !isForgotMode && (
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                Confirmer le mot de passe
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.95rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              backgroundColor: isForgotMode ? '#d97706' : '#2563eb',
              color: '#ffffff',
              padding: '0.75rem',
              borderRadius: '8px',
              border: 'none',
              fontWeight: 600,
              fontSize: '0.95rem',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              marginTop: '0.5rem',
              transition: 'background-color 0.15s ease'
            }}
          >
            {isForgotMode ? (
              <KeyRound size={18} />
            ) : (
              hasUsers ? <LogIn size={18} /> : <UserPlus size={18} />
            )}
            {isSubmitting
              ? 'Traitement...'
              : isForgotMode
              ? 'Réinitialiser le mot de passe'
              : hasUsers
              ? 'Se connecter'
              : 'Créer mon compte et initialiser'}
          </button>

          {isForgotMode && (
            <button
              type="button"
              onClick={() => {
                setIsForgotMode(false);
                setLocalError(null);
                clearError();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.35rem',
                background: 'none',
                border: 'none',
                color: '#64748b',
                fontSize: '0.85rem',
                cursor: 'pointer',
                marginTop: '0.25rem'
              }}
            >
              <ArrowLeft size={16} /> Retour à la connexion
            </button>
          )}
        </form>
      </div>
    </div>
  );
};
