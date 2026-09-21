import { describe, it, expect } from 'vitest';
import {
  HEADLINE_401,
  HEADLINE_403_SCOPE,
  HEADLINE_429,
  HEADLINE_NOT_FOUND,
  HEADLINE_MARKET,
  HEADLINE_PLAYLIST_TOO_LARGE,
  formatActionableFeedback,
  sanitizeDiagnosticText,
  generateStatusSummary,
  generateStatusDetails,
} from '../utils/errorFeedback';
import { SpotifyApiError } from '../services/spotifyError';
import { StatusMetrics, EventLogItem, FailedAlbum } from '../types/app';

describe('Error Feedback and Actionable Messages', () => {
  describe('Exact 6 Headline Strings', () => {
    it('has the exact 6 specified headline strings', () => {
      expect(HEADLINE_401).toBe('Your Spotify session expired. Reconnect to continue.');
      expect(HEADLINE_403_SCOPE).toBe('Spotify did not grant playlist-edit permission. Re-authorize with the required scopes.');
      expect(HEADLINE_429).toBe('Spotify is rate-limiting requests. The app will retry automatically in a few seconds.');
      expect(HEADLINE_NOT_FOUND).toBe('No matching album found. Try editing the artist or album name.');
      expect(HEADLINE_MARKET).toBe('Some tracks are not playable in your Spotify region.');
      expect(HEADLINE_PLAYLIST_TOO_LARGE).toBe('This playlist would exceed Spotify’s track limit. Try splitting into multiple playlists.');
    });
  });

  describe('formatActionableFeedback', () => {
    it('formats 401 session expired with reconnect action', () => {
      const err = new SpotifyApiError({ kind: 'session_expired', status: 401, message: 'The access token expired' });
      const feedback = formatActionableFeedback(err);
      expect(feedback.kind).toBe('session_expired');
      expect(feedback.title).toBe(HEADLINE_401);
      expect(feedback.action).toEqual({ label: 'Reconnect to Spotify', type: 'reconnect' });
    });

    it('formats 403 scope error with reauthorize action', () => {
      const err = new SpotifyApiError({ kind: 'forbidden_scope', status: 403, message: 'Insufficient client scope' });
      const feedback = formatActionableFeedback(err);
      expect(feedback.kind).toBe('forbidden_scope');
      expect(feedback.title).toBe(HEADLINE_403_SCOPE);
      expect(feedback.action?.type).toBe('reauthorize_scope');
    });

    it('formats 429 rate limited with countdown seconds', () => {
      const err = new SpotifyApiError({ kind: 'rate_limited', status: 429, message: 'Rate limit', retryAfterMs: 4000 });
      const feedback = formatActionableFeedback(err);
      expect(feedback.kind).toBe('rate_limited');
      expect(feedback.title).toBe(HEADLINE_429);
      expect(feedback.detail).toContain('~4s');
      expect(feedback.action?.type).toBe('resume');
    });

    it('distinguishes not_found from search_failed', () => {
      // not_found (0 results) -> action open_manual_search
      const notFound = formatActionableFeedback('not_found', { query: 'Radiohead - OK Computer' });
      expect(notFound.kind).toBe('not_found');
      expect(notFound.title).toBe(HEADLINE_NOT_FOUND);
      expect(notFound.action?.type).toBe('open_manual_search');
      expect(notFound.action?.label).toBe('Edit query');

      // search_failed (network/HTTP failure) -> action retry
      const searchFailed = formatActionableFeedback('search_failed');
      expect(searchFailed.kind).toBe('search_failed');
      expect(searchFailed.title).toBe('Search request to Spotify failed.');
      expect(searchFailed.action?.type).toBe('retry');
      expect(searchFailed.action?.label).toBe('Retry');
    });

    it('formats playlist_full with clear track count details', () => {
      const err = new SpotifyApiError({ kind: 'playlist_full', status: 400, message: 'Limit exceeded' });
      const feedback = formatActionableFeedback(err, { currentTracks: 9950, tracksToAdd: 100 });
      expect(feedback.kind).toBe('playlist_full');
      expect(feedback.title).toBe(HEADLINE_PLAYLIST_TOO_LARGE);
      expect(feedback.detail).toContain('reach 10050 of 10000 max tracks');
      expect(feedback.action?.type).toBe('new_playlist');
    });
  });

  describe('sanitizeDiagnosticText', () => {
    it('redacts Bearer tokens', () => {
      const text = 'Error: Authorization: Bearer BQC7v89w4th2k... failed';
      const sanitized = sanitizeDiagnosticText(text);
      expect(sanitized).not.toContain('BQC7v89w4th2k');
      expect(sanitized).toContain('Bearer [REDACTED]');
    });

    it('redacts token query parameters from Spotify URLs', () => {
      const text = 'GET https://api.spotify.com/v1/search?q=radiohead&access_token=secret_abc123&type=album';
      const sanitized = sanitizeDiagnosticText(text);
      expect(sanitized).not.toContain('secret_abc123');
      expect(sanitized).toContain('https://api.spotify.com/v1/search?[PARAMS_REDACTED]');
    });

    it('redacts client_secret or tokens in json strings', () => {
      const text = '{"client_secret": "xyz123secret", "refresh_token": "rt_98765"}';
      const sanitized = sanitizeDiagnosticText(text);
      expect(sanitized).not.toContain('xyz123secret');
      expect(sanitized).not.toContain('rt_98765');
      expect(sanitized).toContain('[REDACTED]');
    });
  });

  describe('generateStatusSummary & generateStatusDetails', () => {
    const mockMetrics: StatusMetrics = {
      processing: {
        current: 34,
        total: 61,
        status: 'processing',
        text: 'Processing: 34 / 61 albums',
      },
      warnings: {
        total: 4,
        breakdown: {
          marketRestricted: 2,
          lowConfidence: 1,
          duplicateInputLine: 1,
        },
      },
      errors: {
        total: 2,
        breakdown: {
          notFound: 1,
          searchFailed: 1,
          skippedInvalid: 0,
          batchFailures: 0,
        },
      },
      duplicates: {
        count: 12,
        isPostPublish: false,
        label: 'Duplicates to skip',
        text: 'Duplicates to skip: 12',
      },
      tracksReady: {
        total: 718,
        text: 'Tracks ready: 718',
      },
    };

    it('generates the exact 5-metric status summary', () => {
      const summary = generateStatusSummary(mockMetrics);
      expect(summary).toBe(
        'Processing: 34 / 61 albums\n' +
        'Warnings: 4\n' +
        'Errors: 2\n' +
        'Duplicates to skip: 12\n' +
        'Tracks ready: 718'
      );
    });

    it('handles singular album pluralization', () => {
      const singleMetrics: StatusMetrics = {
        ...mockMetrics,
        processing: { current: 1, total: 1, status: 'completed', text: 'Processed: 1 / 1 album' },
      };
      const summary = generateStatusSummary(singleMetrics);
      expect(summary).toContain('Processed: 1 / 1 album');
    });

    it('generates detailed report with breakdown and redaction', () => {
      const events: EventLogItem[] = [
        {
          id: '1',
          timestamp: 1710000000000,
          severity: 'error',
          itemLabel: 'Radiohead - OK Computer',
          message: 'Error with token: Bearer BQC_token_here',
        },
      ];
      const failed: FailedAlbum[] = [
        {
          line: 'Pink Floyd - Animals',
          artist: 'Pink Floyd',
          albumName: 'Animals',
          reason: HEADLINE_NOT_FOUND,
          status: 'not_found',
        },
      ];

      const details = generateStatusDetails(mockMetrics, events, failed);
      expect(details).toContain('=== STATUS SUMMARY ===');
      expect(details).toContain('=== METRIC BREAKDOWNS ===');
      expect(details).toContain('2 region-restricted');
      expect(details).toContain('=== FAILED ALBUMS (1) ===');
      expect(details).toContain('[NOT_FOUND] Pink Floyd - Animals');
      expect(details).not.toContain('BQC_token_here');
      expect(details).toContain('Bearer [REDACTED]');
    });
  });
});
