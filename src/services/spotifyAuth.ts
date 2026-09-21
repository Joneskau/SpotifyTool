export const CLIENT_ID =
  import.meta.env.VITE_SPOTIFY_CLIENT_ID || '4de24b8ba1194ceab1f9b87226582f04';

export const SCOPES =
  'playlist-modify-public playlist-modify-private playlist-read-private user-read-private';

export function getRedirectUri(): string {
  if (import.meta.env.VITE_SPOTIFY_REDIRECT_URI) {
    return import.meta.env.VITE_SPOTIFY_REDIRECT_URI;
  }
  // Remove any hash or query parameters from current URL
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

export async function initiateLogin(): Promise<void> {
  const codeVerifier = generateRandomString(64);
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  window.localStorage.setItem('code_verifier', codeVerifier);

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
  const codeVerifier = window.localStorage.getItem('code_verifier');
  if (!codeVerifier) {
    throw new Error('Missing code verifier in local storage.');
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
    window.localStorage.setItem('spotify_access_token', data.access_token);
    window.localStorage.setItem(
      'spotify_token_expiry',
      (Date.now() + data.expires_in * 1000).toString()
    );
    if (data.refresh_token) {
      window.localStorage.setItem('spotify_refresh_token', data.refresh_token);
    }
    return data.access_token;
  } else {
    throw new Error(data.error_description || data.error || 'Failed to exchange token');
  }
}

export async function refreshAccessToken(): Promise<string | null> {
  const storedRefresh = window.localStorage.getItem('spotify_refresh_token');
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
      window.localStorage.setItem('spotify_access_token', data.access_token);
      window.localStorage.setItem(
        'spotify_token_expiry',
        (Date.now() + data.expires_in * 1000).toString()
      );
      if (data.refresh_token) {
        window.localStorage.setItem('spotify_refresh_token', data.refresh_token);
      }
      return data.access_token;
    }
  } catch (error) {
    console.error('Failed to refresh access token:', error);
  }
  return null;
}

export function getStoredValidToken(): string | null {
  const token = window.localStorage.getItem('spotify_access_token');
  const expiry = window.localStorage.getItem('spotify_token_expiry');

  if (token && expiry) {
    if (Date.now() < parseInt(expiry, 10)) {
      return token;
    }
  }
  return null;
}

export function logout(): void {
  window.localStorage.removeItem('spotify_access_token');
  window.localStorage.removeItem('spotify_token_expiry');
  window.localStorage.removeItem('spotify_refresh_token');
  window.localStorage.removeItem('code_verifier');
  window.location.reload();
}
