/**
 * Dev-only Fault Injection for reproducible error handling verification.
 * Enabled via query param: `?fault=401 | 403_scope | 403_dev | 429 | 500 | network | invalid_json | playlist_full`
 * or `window.__SPOTIFY_FAULT__`.
 */

export type FaultType =
  | '401'
  | '403_scope'
  | '403_dev'
  | '429'
  | '500'
  | 'network'
  | 'invalid_json'
  | 'playlist_full';

declare global {
  interface Window {
    __SPOTIFY_FAULT__?: FaultType | null;
  }
}

export function getActiveFault(): FaultType | null {
  if (typeof window === 'undefined') return null;

  if (window.__SPOTIFY_FAULT__) {
    return window.__SPOTIFY_FAULT__;
  }

  try {
    const params = new URLSearchParams(window.location.search);
    const fault = params.get('fault') as FaultType | null;
    if (fault) return fault;
  } catch {
    // Ignore URL parse errors
  }

  return null;
}

export function simulateFaultResponse(fault: FaultType): Response {
  switch (fault) {
    case '401':
      return new Response(
        JSON.stringify({
          error: {
            status: 401,
            message: 'The access token expired',
          },
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );

    case '403_scope':
      return new Response(
        JSON.stringify({
          error: {
            status: 403,
            message: 'Insufficient client scope to modify playlist',
          },
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );

    case '403_dev':
      return new Response(
        JSON.stringify({
          error: {
            status: 403,
            message: 'User not registered in the Developer Dashboard for this Development Mode application',
          },
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );

    case '429':
      return new Response(
        JSON.stringify({
          error: {
            status: 429,
            message: 'API rate limit exceeded',
          },
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '5',
          },
        }
      );

    case '500':
      return new Response(
        JSON.stringify({
          error: {
            status: 500,
            message: 'Internal Server Error',
          },
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );

    case 'invalid_json':
      return new Response('<html>502 Bad Gateway - HTML error page</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });

    case 'playlist_full':
      return new Response(
        JSON.stringify({
          error: {
            status: 400,
            message: 'Playlist track limit exceeded: cannot exceed 10000 tracks',
          },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );

    default:
      return new Response('Simulated Error', { status: 500 });
  }
}
