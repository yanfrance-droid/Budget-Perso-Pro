import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './ErrorBoundary.tsx'
import { UIPreferencesProvider } from './contexts/UIPreferencesContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <UIPreferencesProvider>
        <App />
      </UIPreferencesProvider>
    </ErrorBoundary>
  </StrictMode>,
)
