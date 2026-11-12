/**
 * Client API universel pour Budget Perso Pro
 * Permet au Frontend React de communiquer avec le backend centralisé Proxmox.
 * Fonctionne sur PC Windows, iPhone (Safari/PWA) et tout appareil connecté au VPN.
 */

const TOKEN_KEY = 'budget_server_token';
const API_URL_KEY = 'budget_server_url';

let inMemoryApiUrl = 'http://localhost:3001';
let inMemoryToken: string | null = null;

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const customUrl = window.localStorage ? window.localStorage.getItem(API_URL_KEY) : null;
    if (customUrl) {
      // Sécurité : si customUrl pointe sur localhost mais qu'on navigue sur une IP réseau (ex: 192.168.x.x),
      // on ignore et purge le localhost obsolète pour éviter de court-circuiter le réseau local
      const isRemoteHost = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
      const isCustomLocalhost = customUrl.includes('localhost') || customUrl.includes('127.0.0.1');
      if (isRemoteHost && isCustomLocalhost) {
        window.localStorage?.removeItem(API_URL_KEY);
        return window.location.origin;
      }
      return customUrl.replace(/\/+$/, '');
    }
    // Détection dynamique basée sur l'hôte et l'origine actuels (localhost, 192.168.0.59, etc.)
    return window.location.origin;
  }
  return inMemoryApiUrl;
}

export function setApiBaseUrl(url: string): void {
  inMemoryApiUrl = url.trim().replace(/\/+$/, '');
  if (typeof window !== 'undefined' && window.localStorage) {
    if (url) {
      localStorage.setItem(API_URL_KEY, inMemoryApiUrl);
    } else {
      localStorage.removeItem(API_URL_KEY);
    }
  }
}

export function getAuthToken(): string | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return localStorage.getItem(TOKEN_KEY);
  }
  return inMemoryToken;
}

export function setAuthToken(token: string | null): void {
  inMemoryToken = token;
  if (typeof window !== 'undefined' && window.localStorage) {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const token = getAuthToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const timeoutSignal = typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(15000) : undefined;

  // Si on est dans le navigateur et que l'URL de base correspond à l'origine courante,
  // on utilise un chemin relatif (/api/...) pour éviter tout problème CORS ou d'IP en dur.
  const isSameOrigin = typeof window !== 'undefined' && (baseUrl === '' || baseUrl === window.location.origin);
  const targetUrl = isSameOrigin ? endpoint : (baseUrl ? `${baseUrl}${endpoint}` : endpoint);

  const response = await fetch(targetUrl, {
    ...options,
    signal: options.signal || timeoutSignal,
    headers
  });

  if (!response.ok) {
    let errorMsg = `Erreur HTTP ${response.status}`;
    try {
      const errorData = await response.json();
      if (errorData.error) errorMsg = errorData.error;
    } catch {
      // Ignorer si pas de JSON d'erreur
    }
    const err: any = new Error(errorMsg);
    err.status = response.status;

    // Détection automatique du 401 pour déclencher la ré-authentification
    if (response.status === 401 && !endpoint.startsWith('/api/auth/login')) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth:unauthorized', { detail: { endpoint } }));
      }
    }

    throw err;
  }

  return response.json();
}

export const apiClient = {
  // 1. Authentification & Santé
  health: () => request<{ status: string; hasUsers: boolean }>('/api/health'),
  setup: (credentials: { username: string; password: string }) => 
    request<{ success: boolean; session: { token: string; userId: string; username: string } }>('/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify(credentials)
    }),
  login: async (credentials: { username: string; password: string }) => {
    const res = await request<{ success: boolean; session: { token: string; userId: string; username: string } }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
    });
    if (res.session?.token) {
      setAuthToken(res.session.token);
    }
    return res;
  },
  logout: async () => {
    try {
      await request('/api/auth/logout', { method: 'POST' });
    } finally {
      setAuthToken(null);
    }
  },
  getMe: () => request<{ session: { token: string; userId: string; username: string } | null }>('/api/auth/me'),

  auth: {
    setup: async (username: string, password: string) => {
      const res = await apiClient.setup({ username, password });
      return { user: { id: res.session.userId, username: res.session.username }, token: res.session.token };
    },
    login: async (username: string, password: string) => {
      const res = await apiClient.login({ username, password });
      return { user: { id: res.session.userId, username: res.session.username }, token: res.session.token };
    },
    logout: async () => {
      return apiClient.logout();
    },
    me: async () => {
      const res = await apiClient.getMe();
      if (!res.session) throw new Error('Non authentifié');
      return { user: { id: res.session.userId, username: res.session.username } };
    },
    changePassword: (payload: { currentPassword: string; newPassword: string }) =>
      request<{ success: boolean; message: string }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify(payload)
      }),
    resetPasswordWithRecoveryKey: (payload: { username: string; recoveryKey: string; newPassword: string }) =>
      request<{ success: boolean; message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify(payload)
      }),
    getRecoveryKey: () =>
      request<{ recoveryKey: string }>('/api/auth/recovery-key')
  },

  // 2. Comptes
  accounts: {
    getAll: () => request<any[]>('/api/accounts'),
    save: (account: any) => request<any>('/api/accounts', { method: 'POST', body: JSON.stringify(account) }),
    delete: (id: string) => request<{ success: boolean }>(`/api/accounts/${id}`, { method: 'DELETE' })
  },

  // 3. Catégories
  categories: {
    getAll: () => request<any[]>('/api/categories'),
    save: (category: any) => request<any>('/api/categories', { method: 'POST', body: JSON.stringify(category) }),
    delete: (id: string) => request<{ success: boolean }>(`/api/categories/${id}`, { method: 'DELETE' })
  },

  // 3b. Organismes verseurs
  incomePayers: {
    getAll: () => request<any[]>('/api/income-payers'),
    save: (payer: any) => request<any>('/api/income-payers', { method: 'POST', body: JSON.stringify(payer) }),
    delete: (id: string) => request<{ success: boolean }>(`/api/income-payers/${id}`, { method: 'DELETE' })
  },

  // 4. Transactions
  transactions: {
    get: (filters: { month?: string; accountId?: string; type?: string; status?: string; includeDeleted?: boolean } = {}) => {
      const params = new URLSearchParams();
      if (filters.month) params.append('month', filters.month);
      if (filters.accountId) params.append('accountId', filters.accountId);
      if (filters.type) params.append('type', filters.type);
      if (filters.status) params.append('status', filters.status);
      if (filters.includeDeleted) params.append('includeDeleted', 'true');
      const query = params.toString() ? `?${params.toString()}` : '';
      return request<any[]>(`/api/transactions${query}`);
    },
    getAll: (filters: { month?: string; accountId?: string; type?: string; status?: string; includeDeleted?: boolean } = {}) => {
      return apiClient.transactions.get(filters);
    },
    save: (transaction: any) => request<any>('/api/transactions', { method: 'POST', body: JSON.stringify(transaction) }),
    delete: (id: string) => request<{ success: boolean }>(`/api/transactions/${id}`, { method: 'DELETE' }),
    restore: (id: string, fallbackData?: any) => 
      request<{ success: boolean; transaction: any }>(`/api/transactions/${id}/restore`, { 
        method: 'POST',
        body: fallbackData ? JSON.stringify(fallbackData) : undefined 
      }),
    updateStatus: (id: string, status: string) => 
      request<any>(`/api/transactions/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
  },

  // 5. Crédits
  loans: {
    getAll: () => request<any[]>('/api/loans'),
    save: (loan: any) => request<any>('/api/loans', { method: 'POST', body: JSON.stringify(loan) }),
    delete: (id: string) => request<{ success: boolean }>(`/api/loans/${id}`, { method: 'DELETE' }),
    archive: (id: string, isArchived = true, disableFuturePlanned = false) =>
      request<{ loan: any; disabledCount: number }>(`/api/loans/${id}/archive`, {
        method: 'POST',
        body: JSON.stringify({ isArchived, disableFuturePlanned })
      }),
    unarchive: (id: string) =>
      request<{ loan: any; disabledCount: number }>(`/api/loans/${id}/unarchive`, {
        method: 'POST',
        body: JSON.stringify({ isArchived: false })
      }),
    reactivateFuture: (id: string) =>
      request<{ success: boolean; reactivatedCount: number }>(`/api/loans/${id}/reactivate-future`, {
        method: 'POST'
      }),
    paymentHistory: {
      get: (loanId: string) => request<any[]>(`/api/loans/${loanId}/payment-history`),
      add: (loanId: string, data: { effectiveMonth: string; monthlyPayment: number; notes?: string }) =>
        request<any>(`/api/loans/${loanId}/payment-history`, {
          method: 'POST',
          body: JSON.stringify(data)
        }),
      delete: (historyId: string, allowPastCorrection = false) =>
        request<{ success: boolean }>(`/api/loans/payment-history/${historyId}`, {
          method: 'DELETE',
          body: JSON.stringify({ allowPastCorrection })
        })
    },
    updatePaymentStatus: (paymentId: string, status: string) =>
      request<{ payment: any; loan: any }>(`/api/loans/payments/${paymentId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status })
      }),
    history: {
      getAll: () => request<any[]>('/api/loans/history'),
      saveRecord: (record: any) => request<any>('/api/loans/history', { method: 'POST', body: JSON.stringify(record) }),
      updateMonth: (month: string, record: any) => request<any>(`/api/loans/history/${month}`, { method: 'PUT', body: JSON.stringify(record) }),
      deleteMonth: (month: string) => request<{ success: boolean; deleted: boolean }>(`/api/loans/history/${month}`, { method: 'DELETE' }),
      clearAll: () => request<{ success: boolean; deletedCount: number }>('/api/loans/history', { method: 'DELETE', body: JSON.stringify({ confirm: true }) }),
      export: () => request<any>('/api/loans/history/export'),
      import: (payload: any, mode: 'replace' | 'merge' = 'replace') => request<any>('/api/loans/history/import', { method: 'POST', body: JSON.stringify({ payload, mode }) })
    }
  },

  // 6. Récurrences
  recurrence: {
    getAll: () => request<any[]>('/api/recurrence-templates'),
    save: (template: any) => request<any>('/api/recurrence-templates', { method: 'POST', body: JSON.stringify(template) }),
    saveTemplate: (template: any) => request<any>('/api/recurrence-templates', { method: 'POST', body: JSON.stringify(template) }),
    delete: (id: string, fromDate?: string) => request<{ success: boolean }>(`/api/recurrence-templates/${id}${fromDate ? `?fromDate=${encodeURIComponent(fromDate)}` : ''}`, { method: 'DELETE' }),
    generate: (month: string) => request<{ generated: number }>('/api/recurrence-templates/generate', {
      method: 'POST',
      body: JSON.stringify({ month })
    }),
    generateOccurrences: async (month: string) => {
      const res = await request<{ generated: number }>('/api/recurrence-templates/generate', {
        method: 'POST',
        body: JSON.stringify({ month })
      });
      return res.generated;
    },
    syncRollingHorizon: (currentMonth?: string, pastMonths?: number, futureMonths?: number) =>
      request<{ totalCreated: number; monthsProcessed: string[] }>('/api/recurrence-templates/sync-horizon', {
        method: 'POST',
        body: JSON.stringify({ currentMonth, pastMonths, futureMonths })
      }),
    generateSingleOccurrence: (templateId: string, month: string) =>
      request<{ success: boolean; transaction: any }>(`/api/recurrence-templates/${templateId}/generate-month`, {
        method: 'POST',
        body: JSON.stringify({ month })
      })
  },

  // 6b. Dépenses prévisionnelles
  plannedExpenses: {
    getAll: () => request<any[]>('/api/planned-expenses'),
    save: (expense: any) => request<any>('/api/planned-expenses', { method: 'POST', body: JSON.stringify(expense) }),
    delete: (id: string) => request<{ success: boolean }>(`/api/planned-expenses/${id}`, { method: 'DELETE' })
  },

  // 7. Paramètres & Dashboard
  settings: {
    get: () => request<Record<string, string>>('/api/settings'),
    save: (settings: Record<string, string>) => request<{ success: boolean }>('/api/settings', {
      method: 'POST',
      body: JSON.stringify(settings)
    }),
    getDashboard: async () => {
      const s = await request<Record<string, string>>('/api/settings');
      return {
        manualBalance: s.manualBalance || '0',
        card1: s.card1 || '0',
        card2: s.card2 || '0'
      };
    },
    saveDashboard: (settings: Record<string, string>) => request<{ success: boolean }>('/api/settings', {
      method: 'POST',
      body: JSON.stringify(settings)
    })
  },

  // 8. Migration et Sauvegarde
  migration: {
    import: (backupData: any) => request<any>('/api/migration/import', {
      method: 'POST',
      body: JSON.stringify(backupData)
    }),
    export: () => request<any>('/api/migration/export'),
    getExportExcelUrl: (options?: { startDate?: string; endDate?: string }) => {
      const baseUrl = getApiBaseUrl();
      const token = getAuthToken();
      const params = new URLSearchParams();
      if (token) params.set('token', token);
      if (options?.startDate) params.set('startDate', options.startDate);
      if (options?.endDate) params.set('endDate', options.endDate);
      const qs = params.toString();
      return `${baseUrl}/api/migration/export-excel${qs ? `?${qs}` : ''}`;
    },
    downloadExcel: async (options?: { startDate?: string; endDate?: string }) => {
      const baseUrl = getApiBaseUrl();
      const token = getAuthToken();
      const params = new URLSearchParams();
      if (options?.startDate) params.set('startDate', options.startDate);
      if (options?.endDate) params.set('endDate', options.endDate);
      const qs = params.toString();
      const isSameOrigin = typeof window !== 'undefined' && (baseUrl === '' || baseUrl === window.location.origin);
      const endpoint = `/api/migration/export-excel${qs ? `?${qs}` : ''}`;
      const targetUrl = isSameOrigin ? endpoint : `${baseUrl}${endpoint}`;
      const res = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });
      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        throw new Error(errorJson.error || `Erreur lors de l'export Excel (${res.status})`);
      }
      const blob = await res.blob();
      const today = new Date().toISOString().split('T')[0];
      const periodSuffix = options?.startDate && options?.endDate ? `_${options.startDate}_au_${options.endDate}` : '';
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `budget_perso_pro_export_${today}${periodSuffix}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    createSnapshot: () => request<{ success: boolean; fileName: string; filePath: string; timestamp: string }>('/api/backup/snapshot', {
      method: 'POST'
    })
  },

  // 9. Maintenance & Outils SQLite
  maintenance: {
    getStatus: () => request<{
      integrity: string;
      dbSizeBytes: number;
      dbSizeFormatted: string;
      walSizeBytes: number;
      walSizeFormatted: string;
      tableCounts: Record<string, number>;
      systemMetrics: {
        uptimeSeconds: number;
        uptimeFormatted: string;
        memoryUsageMb: number;
        memoryUsageFormatted: string;
        ramStats?: {
          totalFormatted: string;
          freeFormatted: string;
          usedFormatted: string;
          percentUsed: number;
        };
        serverIp?: string;
        cpu?: {
          cores: number;
          usagePercent: number;
          loadAvg: number[];
          loadFormatted: string;
        };
        diskStats?: {
          totalFormatted: string;
          freeFormatted: string;
          usedFormatted: string;
          percentUsed: number;
        };
      };
    }>('/api/maintenance/status'),
    vacuum: () => request<{
      success: boolean;
      message: string;
      beforeSize: string;
      afterSize: string;
    }>('/api/maintenance/vacuum', { method: 'POST' }),
    checkOrphans: () => request<{
      orphanTransactionsCount: number;
      missingAccountTransactions: number;
      missingCategoryTransactions: number;
      brokenRecurringLinks: number;
      brokenLoanLinks?: number;
      brokenHealthLinks?: number;
      brokenDestinationAccounts?: number;
      brokenPayers?: number;
      brokenPlannedCategories?: number;
      brokenRecurrenceAccounts?: number;
      brokenRecurrencePayers?: number;
      expiredRecurrences?: number;
      brokenLoanPaymentHistories?: number;
      negativeLoanCapitals?: number;
      excessAmortizedCapitals?: number;
      expiredSessionsCount?: number;
      details: string[];
    }>('/api/maintenance/orphans/check'),
    repairOrphans: () => request<{
      success: boolean;
      repaired: number;
      message: string;
    }>('/api/maintenance/orphans/repair', { method: 'POST' }),
    reset: (reseedDefaults = true) => request<{
      success: boolean;
      safetyBackupPath: string;
      message: string;
    }>('/api/maintenance/reset', {
      method: 'POST',
      body: JSON.stringify({ reseedDefaults })
    }),
    getDownloadDbUrl: () => {
      const baseUrl = getApiBaseUrl();
      const token = getAuthToken();
      return `${baseUrl}/api/maintenance/download-db${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    },
    getLogs: () => request<{ lines: string[] }>('/api/maintenance/logs'),
    clearLogs: () => request<{ success: boolean; message: string }>('/api/maintenance/logs', { method: 'DELETE' }),
    getDownloadLogsUrl: () => {
      const baseUrl = getApiBaseUrl();
      const token = getAuthToken();
      return `${baseUrl}/api/maintenance/logs/download${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    },
    listSnapshots: () => request<{
      snapshots: Array<{
        fileName: string;
        relativePath: string;
        type: 'auto' | 'safety' | 'manual';
        label: string;
        sizeBytes: number;
        sizeFormatted: string;
        createdAt: string;
        createdFormatted: string;
      }>;
    }>('/api/maintenance/backups/list'),
    restoreSnapshot: (fileName: string) => request<{
      success: boolean;
      safetyBackupPath: string;
      message: string;
    }>('/api/maintenance/backups/restore-snapshot', {
      method: 'POST',
      body: JSON.stringify({ fileName })
    }),
    purgeBackups: () => request<{
      success: boolean;
      deletedCount: number;
      message: string;
    }>('/api/maintenance/backups', {
      method: 'DELETE'
    }),
    restartServer: () => request<{
      success: boolean;
      message: string;
    }>('/api/maintenance/restart', {
      method: 'POST'
    }),
    restoreDbFile: async (file: File) => {
      const baseUrl = getApiBaseUrl();
      const token = getAuthToken();
      const isSameOrigin = typeof window !== 'undefined' && (baseUrl === '' || baseUrl === window.location.origin);
      const endpoint = '/api/maintenance/restore-db';
      const targetUrl = isSameOrigin ? endpoint : `${baseUrl}${endpoint}`;
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-sqlite3',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: file
      });
      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        throw new Error(errorJson.error || `Erreur lors de la restauration (${res.status})`);
      }
      return res.json();
    }
  },

  // Utilitaires de configuration
  setBaseUrl: setApiBaseUrl,
  setToken: setAuthToken
};
