export const CLIENT_ID =
  import.meta.env.VITE_SPOTIFY_CLIENT_ID || '4de24b8ba1194ceab1f9b87226582f04';

export interface SpotifyScopeDetail {
  scope: string;
  category: 'Playlists' | 'User';
  purpose: string;
}

export const SPOTIFY_SCOPES: SpotifyScopeDetail[] = [
  {
    scope: 'playlist-read-private',
    category: 'Playlists',
    purpose: 'Read your private playlists so we can list target destinations and avoid adding duplicate tracks.',
  },
  {
    scope: 'playlist-read-collaborative',
    category: 'Playlists',
    purpose: 'Read collaborative playlists you follow or contribute to.',
  },
  {
    scope: 'playlist-modify-public',
    category: 'Playlists',
    purpose: 'Create and add tracks to public playlists you manage.',
  },
  {
    scope: 'playlist-modify-private',
    category: 'Playlists',
    purpose: 'Create and add tracks to private playlists you manage.',
  },
  {
    scope: 'user-read-private',
    category: 'User',
    purpose: 'Retrieve your display name and avatar so you know which account is active.',
  },
];

export const SCOPES = SPOTIFY_SCOPES.map(s => s.scope).join(' ');

export type StorageType = 'local' | 'session';

export function getStorageType(): StorageType {
  const localType = localStorage.getItem('spotify_storage_type') as StorageType | null;
  const sessionType = sessionStorage.getItem('spotify_storage_type') as StorageType | null;
  return localType || sessionType || 'local';
}

export function setStorageType(type: StorageType): void {
  if (type === 'session') {
    sessionStorage.setItem('spotify_storage_type', 'session');
    localStorage.removeItem('spotify_storage_type');

    // Move existing auth tokens to sessionStorage if present
    const token = localStorage.getItem('spotify_access_token');
    const expiry = localStorage.getItem('spotify_token_expiry');
    const refresh = localStorage.getItem('spotify_refresh_token');

    if (token) sessionStorage.setItem('spotify_access_token', token);
    if (expiry) sessionStorage.setItem('spotify_token_expiry', expiry);
    if (refresh) sessionStorage.setItem('spotify_refresh_token', refresh);

    localStorage.removeItem('spotify_access_token');
    localStorage.removeItem('spotify_token_expiry');
    localStorage.removeItem('spotify_refresh_token');
  } else {
    localStorage.setItem('spotify_storage_type', 'local');
    sessionStorage.removeItem('spotify_storage_type');

    // Move existing auth tokens to localStorage if present
    const token = sessionStorage.getItem('spotify_access_token');
    const expiry = sessionStorage.getItem('spotify_token_expiry');
    const refresh = sessionStorage.getItem('spotify_refresh_token');

    if (token) localStorage.setItem('spotify_access_token', token);
    if (expiry) localStorage.setItem('spotify_token_expiry', expiry);
    if (refresh) localStorage.setItem('spotify_refresh_token', refresh);

    sessionStorage.removeItem('spotify_access_token');
    sessionStorage.removeItem('spotify_token_expiry');
    sessionStorage.removeItem('spotify_refresh_token');
  }
}

export function getActiveStorage(): Storage {
  return getStorageType() === 'session' ? window.sessionStorage : window.localStorage;
}

export function getRedirectUri(): string {
  if (import.meta.env.VITE_SPOTIFY_REDIRECT_URI) {
    return import.meta.env.VITE_SPOTIFY_REDIRECT_URI;
  }
  return window.location.origin + window.location.pathname;
}

function generateRandomString(length: number): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values)
    .map(x => possible[x % possible.length])
    .join('');
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return window.crypto.subtle.digest('SHA-256', data);
}

function base64encode(input: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const hashed = await sha256(codeVerifier);
  return base64encode(hashed);
}

export async function initiateLogin(storageTypePreference?: StorageType): Promise<void> {
  if (storageTypePreference) {
    setStorageType(storageTypePreference);
  }

  const codeVerifier = generateRandomString(64);
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const storage = getActiveStorage();
  storage.setItem('code_verifier', codeVerifier);

  const redirectUri = getRedirectUri();
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    redirect_uri: redirectUri,
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  // Check active storage first, then fallback to both in case user toggled
  const codeVerifier =
    getActiveStorage().getItem('code_verifier') ||
    localStorage.getItem('code_verifier') ||
    sessionStorage.getItem('code_verifier');

  if (!codeVerifier) {
    throw new Error('Missing code verifier in local or session storage.');
  }

  const redirectUri = getRedirectUri();
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  const data = await response.json();

  if (data.access_token) {
    const storage = getActiveStorage();
    storage.setItem('spotify_access_token', data.access_token);
    storage.setItem(
      'spotify_token_expiry',
      (Date.now() + data.expires_in * 1000).toString()
    );
    if (data.refresh_token) {
      storage.setItem('spotify_refresh_token', data.refresh_token);
    }
    return data.access_token;
  } else {
    throw new Error(data.error_description || data.error || 'Failed to exchange token');
  }
}

export async function refreshAccessToken(): Promise<string | null> {
  const storage = getActiveStorage();
  const storedRefresh =
    storage.getItem('spotify_refresh_token') ||
    localStorage.getItem('spotify_refresh_token') ||
    sessionStorage.getItem('spotify_refresh_token');

  if (!storedRefresh) return null;

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: storedRefresh,
  });

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });

    const data = await response.json();
    if (data.access_token) {
      storage.setItem('spotify_access_token', data.access_token);
      storage.setItem(
        'spotify_token_expiry',
        (Date.now() + data.expires_in * 1000).toString()
      );
      if (data.refresh_token) {
        storage.setItem('spotify_refresh_token', data.refresh_token);
      }
      return data.access_token;
    }
  } catch (error) {
    console.error('Failed to refresh access token:', error);
  }
  return null;
}

export function getStoredValidToken(): string | null {
  const storage = getActiveStorage();
  let token = storage.getItem('spotify_access_token');
  let expiry = storage.getItem('spotify_token_expiry');

  if (!token) {
    // Fallback check
    token = localStorage.getItem('spotify_access_token') || sessionStorage.getItem('spotify_access_token');
    expiry = localStorage.getItem('spotify_token_expiry') || sessionStorage.getItem('spotify_token_expiry');
  }

  if (token && expiry) {
    if (Date.now() < parseInt(expiry, 10)) {
      return token;
    }
  }
  return null;
}

export function getStoredTokenExpiry(): number | null {
  const storage = getActiveStorage();
  const expiry =
    storage.getItem('spotify_token_expiry') ||
    localStorage.getItem('spotify_token_expiry') ||
    sessionStorage.getItem('spotify_token_expiry');
  return expiry ? parseInt(expiry, 10) : null;
}

export function saveSessionSnapshot(snapshot: unknown): void {
  try {
    const serialized = JSON.stringify(snapshot);
    localStorage.setItem('spotify_pending_session_recovery', serialized);
  } catch (err) {
    console.error('Failed to save session snapshot:', err);
  }
}

export function restoreSessionSnapshot<T>(): T | null {
  try {
    const raw = localStorage.getItem('spotify_pending_session_recovery');
    if (!raw) return null;
    localStorage.removeItem('spotify_pending_session_recovery');
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error('Failed to restore session snapshot:', err);
    return null;
  }
}

export function logout(): void {
  // Clear both storage types
  ['spotify_access_token', 'spotify_token_expiry', 'spotify_refresh_token', 'code_verifier', 'spotify_pending_session_recovery'].forEach(k => {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  });
  window.location.reload();
}
