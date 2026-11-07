import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught application error:", error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          backgroundColor: '#f8fafc',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
          <div style={{
            maxWidth: '480px',
            width: '100%',
            backgroundColor: '#ffffff',
            borderRadius: '1rem',
            padding: '2rem',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            textAlign: 'center'
          }}>
            <div style={{
              width: '3.75rem',
              height: '3.75rem',
              borderRadius: '50%',
              backgroundColor: '#fee2e2',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.25rem'
            }}>
              <AlertTriangle size={28} />
            </div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.5rem' }}>
              Une erreur inattendue est survenue
            </h1>
            <p style={{ fontSize: '0.875rem', color: '#64748b', lineHeight: 1.5, marginBottom: '1.25rem' }}>
              L'affichage n'a pas pu se charger correctement. Vos données sont préservées en sécurité dans la base SQLite locale.
            </p>
            {this.state.error?.message && (
              <div style={{
                backgroundColor: '#f1f5f9',
                padding: '0.625rem 0.875rem',
                borderRadius: '0.5rem',
                fontSize: '0.75rem',
                color: '#475569',
                fontFamily: 'monospace',
                marginBottom: '1.5rem',
                textAlign: 'left',
                overflowX: 'auto',
                maxHeight: '90px'
              }}>
                {this.state.error.message}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                onClick={this.handleReload}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.625rem 1.25rem',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '0.5rem',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  cursor: 'pointer'
                }}
              >
                <RefreshCw size={15} />
                Recharger
              </button>
              <button
                onClick={this.handleGoHome}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.625rem 1.25rem',
                  backgroundColor: '#f1f5f9',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  borderRadius: '0.5rem',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  cursor: 'pointer'
                }}
              >
                <Home size={15} />
                Tableau de bord
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
