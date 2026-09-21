import { SpotifyApiError, SpotifyApiErrorKind } from '../services/spotifyError';
import { StatusMetrics, EventLogItem, FailedAlbum, PublishFailure } from '../types/app';

export const SPOTIFY_PLAYLIST_TRACK_LIMIT = 10000;

export const HEADLINE_401 = 'Your Spotify session expired. Reconnect to continue.';
export const HEADLINE_403_SCOPE = 'Spotify did not grant playlist-edit permission. Re-authorize with the required scopes.';
export const HEADLINE_403_DEV = 'Account not authorized in Spotify Developer Dashboard.';
export const HEADLINE_403_OTHER = 'Cannot modify this playlist.';
export const HEADLINE_429 = 'Spotify is rate-limiting requests. The app will retry automatically in a few seconds.';
export const HEADLINE_NOT_FOUND = 'No matching album found. Try editing the artist or album name.';
export const HEADLINE_SEARCH_FAILED = 'Search request to Spotify failed.';
export const HEADLINE_MARKET = 'Some tracks are not playable in your Spotify region.';
export const HEADLINE_PLAYLIST_TOO_LARGE = 'This playlist would exceed Spotify’s track limit. Try splitting into multiple playlists.';
export const HEADLINE_SERVER_ERROR = 'Spotify is having trouble; progress is saved.';
export const HEADLINE_NETWORK = 'Network connection lost.';
export const HEADLINE_INVALID_RESPONSE = 'Unexpected response from Spotify.';

export type FeedbackActionType =
  | 'reconnect'
  | 'reauthorize_scope'
  | 'open_manual_search'
  | 'new_playlist'
  | 'resume'
  | 'retry'
  | 'dismiss';

export interface FeedbackAction {
  label: string;
  type: FeedbackActionType;
  payload?: unknown;
}

export interface ActionableFeedback {
  kind: SpotifyApiErrorKind | 'not_found' | 'search_failed' | 'market_restricted' | 'playlist_full';
  title: string;
  detail: string;
  action?: FeedbackAction;
}

/**
 * Maps error kind or Error instance to user-facing actionable feedback shape: { title, detail, action }.
 */
export function formatActionableFeedback(
  error: unknown,
  context?: {
    artist?: string;
    albumName?: string;
    query?: string;
    currentTracks?: number;
    tracksToAdd?: number;
    retryAfterSeconds?: number;
    failedAlbumIndex?: number;
  }
): ActionableFeedback {
  // Check if it's already a SpotifyApiError
  if (error instanceof SpotifyApiError) {
    switch (error.kind) {
      case 'session_expired':
        return {
          kind: 'session_expired',
          title: HEADLINE_401,
          detail: 'Your entered albums, match candidates, and publish state are preserved.',
          action: { label: 'Reconnect to Spotify', type: 'reconnect' },
        };

      case 'forbidden_scope':
        return {
          kind: 'forbidden_scope',
          title: HEADLINE_403_SCOPE,
          detail: 'The app requires playlist modification permissions to create or update playlists.',
          action: { label: 'Re-authorize Scopes', type: 'reauthorize_scope' },
        };

      case 'forbidden_not_registered':
        return {
          kind: 'forbidden_not_registered',
          title: HEADLINE_403_DEV,
          detail: 'In Spotify Development Mode, your email must be explicitly added under Authorized Users in the Spotify Developer Dashboard.',
          action: { label: 'Dismiss', type: 'dismiss' },
        };

      case 'forbidden_other':
        return {
          kind: 'forbidden_other',
          title: HEADLINE_403_OTHER,
          detail: 'You may not have permission to edit this playlist. Try creating a new playlist instead.',
          action: { label: 'Create New Playlist', type: 'new_playlist' },
        };

      case 'rate_limited': {
        const seconds = context?.retryAfterSeconds || Math.ceil((error.retryAfterMs || 0) / 1000);
        const countdownText = seconds > 0 ? ` Automatic retry in ~${seconds}s.` : '';
        return {
          kind: 'rate_limited',
          title: HEADLINE_429,
          detail: `Spotify returned rate limit status (429).${countdownText}`,
          action: { label: 'Resume Now', type: 'resume' },
        };
      }

      case 'server_error':
        return {
          kind: 'server_error',
          title: HEADLINE_SERVER_ERROR,
          detail: error.bodyMessage || 'Spotify servers returned an error (5xx). Progress has been saved.',
          action: { label: 'Retry', type: 'retry' },
        };

      case 'network':
        return {
          kind: 'network',
          title: HEADLINE_NETWORK,
          detail: 'Unable to connect to Spotify. Progress has been saved.',
          action: { label: 'Retry', type: 'retry' },
        };

      case 'invalid_response':
        return {
          kind: 'invalid_response',
          title: HEADLINE_INVALID_RESPONSE,
          detail: 'Spotify returned an unexpected payload structure or HTML response.',
          action: { label: 'Retry', type: 'retry' },
        };

      case 'playlist_full': {
        const current = context?.currentTracks || 0;
        const toAdd = context?.tracksToAdd || 0;
        const total = current + toAdd;
        const countDetail =
          current > 0 && toAdd > 0
            ? `Adding ${toAdd} tracks would reach ${total} of ${SPOTIFY_PLAYLIST_TRACK_LIMIT} max tracks.`
            : `Playlists cannot exceed ${SPOTIFY_PLAYLIST_TRACK_LIMIT} tracks.`;
        return {
          kind: 'playlist_full',
          title: HEADLINE_PLAYLIST_TOO_LARGE,
          detail: countDetail,
          action: { label: 'Continue in a New Playlist', type: 'new_playlist' },
        };
      }

      default:
        break;
    }
  }

  // Handle outcome kinds from string or object
  const kindStr = typeof error === 'string' ? error : (error as { kind?: string })?.kind;
  if (kindStr === 'not_found') {
    const query = context?.query || (context?.artist && context?.albumName ? `${context.artist} - ${context.albumName}` : '');
    return {
      kind: 'not_found',
      title: HEADLINE_NOT_FOUND,
      detail: query ? `Searched for: "${query}".` : 'Search succeeded with zero matches on Spotify.',
      action: {
        label: 'Edit query',
        type: 'open_manual_search',
        payload: { query, failedAlbumIndex: context?.failedAlbumIndex },
      },
    };
  }

  if (kindStr === 'search_failed') {
    return {
      kind: 'search_failed',
      title: HEADLINE_SEARCH_FAILED,
      detail: 'The search could not be completed due to a connection or server error.',
      action: {
        label: 'Retry',
        type: 'retry',
        payload: { failedAlbumIndex: context?.failedAlbumIndex },
      },
    };
  }

  if (kindStr === 'market_restricted') {
    return {
      kind: 'market_restricted',
      title: HEADLINE_MARKET,
      detail: 'These tracks will still be saved to the playlist, but they appear greyed out in regions where Spotify lacks streaming rights.',
      action: { label: 'Dismiss', type: 'dismiss' },
    };
  }

  if (kindStr === 'playlist_full') {
    const current = context?.currentTracks || 0;
    const toAdd = context?.tracksToAdd || 0;
    const total = current + toAdd;
    return {
      kind: 'playlist_full',
      title: HEADLINE_PLAYLIST_TOO_LARGE,
      detail:
        current > 0 && toAdd > 0
          ? `Adding ${toAdd} tracks would reach ${total} of ${SPOTIFY_PLAYLIST_TRACK_LIMIT} max tracks.`
          : `Playlists cannot exceed ${SPOTIFY_PLAYLIST_TRACK_LIMIT} tracks.`,
      action: { label: 'Continue in a New Playlist', type: 'new_playlist' },
    };
  }

  // Fallback for generic Error instance
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return {
        kind: 'cancelled',
        title: 'Operation cancelled',
        detail: 'The operation was cancelled by the user.',
      };
    }
    return {
      kind: 'unknown',
      title: 'Unexpected error occurred',
      detail: error.message,
      action: { label: 'Retry', type: 'retry' },
    };
  }

  return {
    kind: 'unknown',
    title: 'An unexpected issue occurred',
    detail: String(error || 'Unknown error'),
    action: { label: 'Retry', type: 'retry' },
  };
}

/**
 * Sanitizes diagnostic text to guarantee no sensitive data is leaked into exports/clipboard.
 * Strips Bearer tokens, token query params, and Authorization headers.
 */
export function sanitizeDiagnosticText(text: string): string {
  if (!text) return '';

  return text
    // Strip Bearer tokens
    .replace(/Bearer\s+[A-Za-z0-9-_.~+/]+=*/gi, 'Bearer [REDACTED]')
    // Strip non-bearer Authorization headers or unredacted authorization contents
    .replace(/(authorization:\s*)(?:Bearer\s+\[REDACTED\]|([^\r\n]+))/gi, (match, prefix) => {
      if (match.toLowerCase().includes('bearer [redacted]')) {
        return match;
      }
      return `${prefix}[REDACTED]`;
    })
    // Strip access_token and refresh_token in query strings or JSON
    .replace(/(["']?(?:access_token|refresh_token|code|client_secret)["']?\s*[:=]\s*["']?)[^"'\s&]+/gi, '$1[REDACTED]')
    // Strip URL query parameters from spotify.com URLs
    .replace(/(https?:\/\/api\.spotify\.com\/[^\s?]+)\?[^\s)]*/gi, '$1?[PARAMS_REDACTED]');
}

/**
 * Formats the 5-line status summary with correct pluralization.
 */
export function generateStatusSummary(metrics: StatusMetrics): string {
  const albumWord = metrics.processing.total === 1 ? 'album' : 'albums';
  const processPrefix = metrics.processing.status === 'completed' ? 'Processed' : 'Processing';

  return [
    `${processPrefix}: ${metrics.processing.current} / ${metrics.processing.total} ${albumWord}`,
    `Warnings: ${metrics.warnings.total}`,
    `Errors: ${metrics.errors.total}`,
    `${metrics.duplicates.label}: ${metrics.duplicates.count}`,
    `Tracks ready: ${metrics.tracksReady.total}`,
  ].join('\n');
}

/**
 * Formats a comprehensive diagnostic report with timestamps and per-item issues.
 */
export function generateStatusDetails(
  metrics: StatusMetrics,
  events: EventLogItem[] = [],
  failedAlbums: FailedAlbum[] = [],
  publishFailures: PublishFailure[] = []
): string {
  const lines: string[] = [];

  lines.push('=== STATUS SUMMARY ===');
  lines.push(generateStatusSummary(metrics));
  lines.push('');

  lines.push('=== METRIC BREAKDOWNS ===');
  lines.push(
    `Warnings breakdown: ${metrics.warnings.breakdown.marketRestricted} region-restricted, ${metrics.warnings.breakdown.lowConfidence} low confidence, ${metrics.warnings.breakdown.duplicateInputLine} duplicate input lines.`
  );
  lines.push(
    `Errors breakdown: ${metrics.errors.breakdown.notFound} not found, ${metrics.errors.breakdown.searchFailed} search failed, ${metrics.errors.breakdown.skippedInvalid} invalid lines, ${metrics.errors.breakdown.batchFailures} batch failures.`
  );
  lines.push('');

  if (failedAlbums.length > 0) {
    lines.push(`=== FAILED ALBUMS (${failedAlbums.length}) ===`);
    failedAlbums.forEach((f, i) => {
      lines.push(`${i + 1}. [${f.status.toUpperCase()}] ${f.artist || 'Unknown'} - ${f.albumName || 'Unknown'}: ${f.reason}`);
    });
    lines.push('');
  }

  if (publishFailures.length > 0) {
    lines.push(`=== PUBLISH BATCH FAILURES (${publishFailures.length}) ===`);
    publishFailures.forEach((p, i) => {
      lines.push(
        `${i + 1}. Batch ${p.batchIndex + 1} (${p.trackCount} tracks) -> ${p.playlistName}: ${p.reason} (HTTP ${p.status || 'N/A'})`
      );
    });
    lines.push('');
  }

  if (events.length > 0) {
    lines.push(`=== RECENT EVENTS (${events.length}) ===`);
    events.slice(-20).forEach(ev => {
      const timeStr = new Date(ev.timestamp).toISOString();
      const itemStr = ev.itemLabel ? ` [${ev.itemLabel}]` : '';
      lines.push(`[${timeStr}] [${ev.severity.toUpperCase()}]${itemStr} ${ev.message}`);
    });
    lines.push('');
  }

  return sanitizeDiagnosticText(lines.join('\n'));
}
