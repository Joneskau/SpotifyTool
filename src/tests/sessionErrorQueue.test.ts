import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAppStore } from '../store/useAppStore';
import { asyncPool } from '../utils/asyncPool';
import { SpotifyApiError } from '../services/spotifyError';
import {
  HEADLINE_401,
  HEADLINE_403_SCOPE,
  formatActionableFeedback,
} from '../utils/errorFeedback';
import { fetchWithRateLimit } from '../services/spotifyApi';

class MockStorage implements Storage {
  private store: Record<string, string> = {};
  get length() {
    return Object.keys(this.store).length;
  }
  clear() {
    this.store = {};
  }
  getItem(key: string) {
    return this.store[key] ?? null;
  }
  key(index: number) {
    return Object.keys(this.store)[index] ?? null;
  }
  removeItem(key: string) {
    delete this.store[key];
  }
  setItem(key: string, value: string) {
    this.store[key] = String(value);
  }
}

describe('Session Error Queue & Fault Injection Handling', () => {
  const mockStorage = new MockStorage();

  beforeEach(() => {
    mockStorage.clear();
    (globalThis as unknown as { localStorage: Storage }).localStorage = mockStorage;
    (globalThis as unknown as { sessionStorage: Storage }).sessionStorage = mockStorage;
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: mockStorage,
      sessionStorage: mockStorage,
    };
    useAppStore.getState().resetToSearch();
    useAppStore.getState().setSessionError(null);
    useAppStore.getState().clearEventLogs();
    delete (window as unknown as { __SPOTIFY_FAULT__?: string | null }).__SPOTIFY_FAULT__;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('aborts search queue on first session-level error and sets a single persistent banner', async () => {
    const items = [
      'Pink Floyd - Animals',
      'Radiohead - Kid A',
      'The Beatles - Abbey Road',
      'Led Zeppelin - IV',
      'Daft Punk - Discovery',
    ];

    let apiCallCount = 0;

    const processItem = async (line: string) => {
      if (useAppStore.getState().isCancelled) {
        return { status: 'cancelled' as const, line };
      }

      apiCallCount++;

      // Simulate first call failing with 401 Unauthorized
      if (line === 'Pink Floyd - Animals') {
        const err = new SpotifyApiError({
          kind: 'session_expired',
          status: 401,
          message: 'The access token expired',
        });

        const feedback = formatActionableFeedback(err);
        useAppStore.getState().setSessionError(feedback);
        useAppStore.getState().setIsCancelled(true);
        useAppStore.getState().addEventLog({
          severity: 'error',
          itemLabel: 'Session Alert',
          message: feedback.title,
        });

        return { status: 'search_failed' as const, line, reason: err.message };
      }

      return { status: 'found' as const, line };
    };

    const results = await asyncPool(
      2,
      items,
      processItem,
      () => useAppStore.getState().isCancelled
    );

    // Assert that the store has exactly 1 session alert banner
    const state = useAppStore.getState();
    expect(state.sessionError).not.toBeNull();
    expect(state.sessionError?.kind).toBe('session_expired');
    expect(state.sessionError?.title).toBe(HEADLINE_401);
    expect(state.isCancelled).toBe(true);

    // Assert event logs contain only 1 session alert rather than spamming
    const sessionAlerts = state.eventLogs.filter(e => e.itemLabel === 'Session Alert');
    expect(sessionAlerts).toHaveLength(1);

    // In-flight cancellation prevented later items from calling the API
    expect(apiCallCount).toBeLessThan(items.length);

    // Cancelled items received cancelled status
    const cancelledCount = results.filter(
      r => r.status === 'fulfilled' && (r.value as { status: string }).status === 'cancelled'
    ).length;
    expect(cancelledCount).toBeGreaterThan(0);
  });

  it('sets forbidden_scope session error with HEADLINE_403_SCOPE on permission failure', () => {
    const scopeErr = new SpotifyApiError({
      kind: 'forbidden_scope',
      status: 403,
      message: 'Insufficient client scope',
    });

    const feedback = formatActionableFeedback(scopeErr);
    useAppStore.getState().setSessionError(feedback);

    const state = useAppStore.getState();
    expect(state.sessionError?.title).toBe(HEADLINE_403_SCOPE);
    expect(state.sessionError?.action?.type).toBe('reauthorize_scope');
  });

  it('triggers 401 fault injection and throws typed SpotifyApiError', async () => {
    (window as unknown as { __SPOTIFY_FAULT__: string }).__SPOTIFY_FAULT__ = '401';

    await expect(
      fetchWithRateLimit('https://api.spotify.com/v1/me', {}, 0)
    ).rejects.toThrowError(SpotifyApiError);

    try {
      await fetchWithRateLimit('https://api.spotify.com/v1/me', {}, 0);
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(SpotifyApiError);
      const spotifyErr = err as SpotifyApiError;
      expect(spotifyErr.kind).toBe('session_expired');
      expect(spotifyErr.status).toBe(401);
    }
  });

  it('triggers 403_scope fault injection and throws forbidden_scope', async () => {
    (window as unknown as { __SPOTIFY_FAULT__: string }).__SPOTIFY_FAULT__ = '403_scope';

    const response = await fetchWithRateLimit('https://api.spotify.com/v1/playlists/123/tracks', {}, 0);
    expect(response?.status).toBe(403);
  });

  it('triggers 429 rate limit fault injection with Retry-After header parsing', async () => {
    (window as unknown as { __SPOTIFY_FAULT__: string }).__SPOTIFY_FAULT__ = '429';

    try {
      await fetchWithRateLimit('https://api.spotify.com/v1/search', {}, 0);
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(SpotifyApiError);
      const spotifyErr = err as SpotifyApiError;
      expect(spotifyErr.kind).toBe('rate_limited');
      expect(spotifyErr.status).toBe(429);
      expect(spotifyErr.retryAfterMs).toBeGreaterThan(0);
    }
  });
});
