// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiClient, getApiBaseUrl, setApiBaseUrl, setAuthToken, getAuthToken } from './apiClient';

describe('apiClient - Détection dynamique d\'hôte & Résilience Réseau Local', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    localStorage.clear();
    setAuthToken(null);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    // Reset location
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation
    });
  });

  it('détecte dynamiquement l\'hôte IP du réseau local (192.168.0.59:3001)', () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        origin: 'http://192.168.0.59:3001',
        hostname: '192.168.0.59',
        port: '3001',
        protocol: 'http:'
      }
    });

    const baseUrl = getApiBaseUrl();
    expect(baseUrl).toBe('http://192.168.0.59:3001');
  });

  it('purge automatiquement une URL localhost obsolète en localStorage si on navigue sur une IP distante', () => {
    localStorage.setItem('budget_server_url', 'http://localhost:3001');
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        origin: 'http://192.168.0.59:3001',
        hostname: '192.168.0.59',
        port: '3001',
        protocol: 'http:'
      }
    });

    const baseUrl = getApiBaseUrl();
    expect(baseUrl).toBe('http://192.168.0.59:3001');
    expect(localStorage.getItem('budget_server_url')).toBeNull();
  });

  it('utilise un chemin relatif sans préfixe en dur lors d\'un appel même origine', async () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        origin: 'http://192.168.0.59:3001',
        hostname: '192.168.0.59',
        port: '3001',
        protocol: 'http:'
      }
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', hasUsers: true })
    });
    global.fetch = fetchMock;

    await apiClient.health();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0][0];
    expect(calledUrl).toBe('/api/health');
  });

  it('déclenche l\'événement auth:unauthorized sur une réponse HTTP 401', async () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        origin: 'http://192.168.0.59:3001',
        hostname: '192.168.0.59',
        port: '3001',
        protocol: 'http:'
      }
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Accès non autorisé : authentification requise.' })
    });
    global.fetch = fetchMock;

    let eventFired = false;
    window.addEventListener('auth:unauthorized', () => {
      eventFired = true;
    }, { once: true });

    await expect(apiClient.accounts.getAll()).rejects.toThrow('Accès non autorisé : authentification requise.');
    expect(eventFired).toBe(true);
  });
});
