export type SpotifyApiErrorKind =
  | 'session_expired'
  | 'forbidden_scope'
  | 'forbidden_not_registered'
  | 'forbidden_other'
  | 'rate_limited'
  | 'not_found'
  | 'playlist_full'
  | 'server_error'
  | 'network'
  | 'invalid_response'
  | 'cancelled'
  | 'unknown';

export interface SpotifyApiErrorOptions {
  kind: SpotifyApiErrorKind;
  status?: number;
  message: string;
  bodyMessage?: string;
  retryAfterMs?: number;
  details?: Record<string, unknown>;
}

export class SpotifyApiError extends Error {
  readonly kind: SpotifyApiErrorKind;
  readonly status?: number;
  readonly bodyMessage?: string;
  readonly retryAfterMs?: number;
  readonly details?: Record<string, unknown>;

  constructor(options: SpotifyApiErrorOptions) {
    super(options.message);
    this.name = 'SpotifyApiError';
    this.kind = options.kind;
    this.status = options.status;
    this.bodyMessage = options.bodyMessage;
    this.retryAfterMs = options.retryAfterMs;
    this.details = options.details;
    Object.setPrototypeOf(this, SpotifyApiError.prototype);
  }
}

/**
 * Classifies HTTP status and response body into a structured SpotifyApiErrorKind.
 */
export function classifySpotifyResponse(
  status: number,
  bodyText = '',
  headers?: Headers | null
): { kind: SpotifyApiErrorKind; bodyMessage?: string; retryAfterMs?: number } {
  let bodyMessage: string | undefined;

  try {
    const trimmed = bodyText.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const json = JSON.parse(trimmed);
      if (typeof json?.error === 'string') {
        bodyMessage = json.error;
      } else if (typeof json?.error?.message === 'string') {
        bodyMessage = json.error.message;
      } else if (typeof json?.error_description === 'string') {
        bodyMessage = json.error_description;
      } else if (typeof json?.message === 'string') {
        bodyMessage = json.message;
      }
    } else if (trimmed.length > 0) {
      bodyMessage = trimmed.slice(0, 300);
    }
  } catch {
    bodyMessage = bodyText.slice(0, 300);
  }

  const normalizedMsg = (bodyMessage || bodyText || '').toLowerCase();

  // 401 Unauthorized
  if (status === 401) {
    return { kind: 'session_expired', bodyMessage };
  }

  // 403 Forbidden
  if (status === 403) {
    if (
      normalizedMsg.includes('scope') ||
      normalizedMsg.includes('insufficient_scope') ||
      normalizedMsg.includes('permission')
    ) {
      return { kind: 'forbidden_scope', bodyMessage };
    }
    if (
      normalizedMsg.includes('not registered') ||
      normalizedMsg.includes('user not registered') ||
      normalizedMsg.includes('developer dashboard') ||
      normalizedMsg.includes('development mode')
    ) {
      return { kind: 'forbidden_not_registered', bodyMessage };
    }
    return { kind: 'forbidden_other', bodyMessage };
  }

  // 429 Too Many Requests
  if (status === 429) {
    let retryAfterMs: number | undefined;
    const retryHeader = headers?.get('Retry-After');
    if (retryHeader) {
      const parsedSeconds = parseInt(retryHeader, 10);
      if (!Number.isNaN(parsedSeconds)) {
        retryAfterMs = parsedSeconds * 1000;
      }
    }
    return { kind: 'rate_limited', bodyMessage, retryAfterMs };
  }

  // 404 Not Found
  if (status === 404) {
    return { kind: 'not_found', bodyMessage };
  }

  // 5xx Server Errors
  if (status >= 500 && status <= 599) {
    return { kind: 'server_error', bodyMessage };
  }

  // 400 Playlist track limit reached
  if (
    status === 400 &&
    (normalizedMsg.includes('exceeded') ||
      normalizedMsg.includes('maximum size') ||
      normalizedMsg.includes('track limit') ||
      normalizedMsg.includes('10000'))
  ) {
    return { kind: 'playlist_full', bodyMessage };
  }

  return { kind: 'unknown', bodyMessage };
}
