import { describe, it, expect, beforeEach, beforeAll } from 'vitest';

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

beforeAll(() => {
  if (typeof globalThis.localStorage === 'undefined') {
    globalThis.localStorage = new MockStorage();
  }
  if (typeof globalThis.sessionStorage === 'undefined') {
    globalThis.sessionStorage = new MockStorage();
  }
  if (typeof globalThis.window === 'undefined') {
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: globalThis.localStorage,
      sessionStorage: globalThis.sessionStorage,
      location: { origin: 'http://localhost:5173', pathname: '/' },
    };
  }
});

import {
  SPOTIFY_SCOPES,
  SCOPES,
  getStorageType,
  setStorageType,
  saveSessionSnapshot,
  restoreSessionSnapshot,
} from '../services/spotifyAuth';

describe('spotifyAuth resilience & transparency', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('Spotify Scopes Transparency', () => {
    it('defines 5 clear scopes with user-facing descriptions', () => {
      expect(SPOTIFY_SCOPES.length).toBe(5);
      expect(SPOTIFY_SCOPES.map(s => s.scope)).toEqual([
        'playlist-read-private',
        'playlist-read-collaborative',
        'playlist-modify-public',
        'playlist-modify-private',
        'user-read-private',
      ]);
    });

    it('each scope includes a purpose and category', () => {
      SPOTIFY_SCOPES.forEach(s => {
        expect(s.purpose.length).toBeGreaterThan(15);
        expect(['Playlists', 'User']).toContain(s.category);
      });
    });

    it('builds a space-delimited SCOPES query parameter string', () => {
      expect(SCOPES).toBe(
        'playlist-read-private playlist-read-collaborative playlist-modify-public playlist-modify-private user-read-private'
      );
    });
  });

  describe('Storage Preference Options', () => {
    it('defaults to local storage if unset', () => {
      expect(getStorageType()).toBe('local');
    });

    it('allows switching to session storage and migrates keys', () => {
      localStorage.setItem('spotify_access_token', 'test-token-123');
      localStorage.setItem('spotify_token_expiry', '9999999999');

      setStorageType('session');
      expect(getStorageType()).toBe('session');
      expect(sessionStorage.getItem('spotify_access_token')).toBe('test-token-123');
      expect(localStorage.getItem('spotify_access_token')).toBeNull();
    });

    it('allows switching back to local storage', () => {
      sessionStorage.setItem('spotify_access_token', 'test-token-456');

      setStorageType('local');
      expect(getStorageType()).toBe('local');
      expect(localStorage.getItem('spotify_access_token')).toBe('test-token-456');
      expect(sessionStorage.getItem('spotify_access_token')).toBeNull();
    });
  });

  describe('Session Snapshot Recovery', () => {
    it('saves and restores snapshot state across reconnect', () => {
      const mockState = {
        albumListText: 'Radiohead - Kid A\nMassive Attack - Mezzanine',
        matchedAlbums: [{ status: 'found', artist: 'Radiohead' }],
        selectedPlaylistId: 'playlist_123',
      };

      saveSessionSnapshot(mockState);
      const restored = restoreSessionSnapshot<typeof mockState>();

      expect(restored).toEqual(mockState);
      // Once restored, snapshot should be purged
      expect(restoreSessionSnapshot()).toBeNull();
    });
  });
});
