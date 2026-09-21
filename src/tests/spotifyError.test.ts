import { describe, it, expect } from 'vitest';
import { SpotifyApiError, classifySpotifyResponse } from '../services/spotifyError';

describe('SpotifyApiError and Classification', () => {
  describe('SpotifyApiError instance', () => {
    it('creates an error with expected properties and inheritance', () => {
      const err = new SpotifyApiError({
        kind: 'session_expired',
        status: 401,
        message: 'The access token expired',
        bodyMessage: 'The access token expired',
        retryAfterMs: 3000,
        details: { endpoint: '/v1/me' },
      });

      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(SpotifyApiError);
      expect(err.name).toBe('SpotifyApiError');
      expect(err.kind).toBe('session_expired');
      expect(err.status).toBe(401);
      expect(err.message).toBe('The access token expired');
      expect(err.bodyMessage).toBe('The access token expired');
      expect(err.retryAfterMs).toBe(3000);
      expect(err.details).toEqual({ endpoint: '/v1/me' });
    });
  });

  describe('classifySpotifyResponse', () => {
    it('classifies 401 as session_expired', () => {
      const body = JSON.stringify({ error: { status: 401, message: 'The access token expired' } });
      const result = classifySpotifyResponse(401, body);
      expect(result.kind).toBe('session_expired');
      expect(result.bodyMessage).toBe('The access token expired');
    });

    it('classifies 403 with scope error as forbidden_scope', () => {
      const body = JSON.stringify({ error: { status: 403, message: 'Insufficient client scope: playlist-modify-public' } });
      const result = classifySpotifyResponse(403, body);
      expect(result.kind).toBe('forbidden_scope');
      expect(result.bodyMessage).toContain('Insufficient client scope');
    });

    it('classifies 403 with unregistered developer mode as forbidden_not_registered', () => {
      const body = JSON.stringify({ error: { status: 403, message: 'User not registered in the Developer Dashboard' } });
      const result = classifySpotifyResponse(403, body);
      expect(result.kind).toBe('forbidden_not_registered');
    });

    it('classifies 403 generic forbidden as forbidden_other', () => {
      const body = JSON.stringify({ error: { status: 403, message: 'You cannot edit this playlist' } });
      const result = classifySpotifyResponse(403, body);
      expect(result.kind).toBe('forbidden_other');
    });

    it('classifies 429 with Retry-After header', () => {
      const headers = new Headers({ 'Retry-After': '5' });
      const body = JSON.stringify({ error: { status: 429, message: 'API rate limit exceeded' } });
      const result = classifySpotifyResponse(429, body, headers);
      expect(result.kind).toBe('rate_limited');
      expect(result.retryAfterMs).toBe(5000);
      expect(result.bodyMessage).toBe('API rate limit exceeded');
    });

    it('classifies 429 without Retry-After header', () => {
      const result = classifySpotifyResponse(429, '');
      expect(result.kind).toBe('rate_limited');
      expect(result.retryAfterMs).toBeUndefined();
    });

    it('classifies 404 as not_found', () => {
      const body = JSON.stringify({ error: { status: 404, message: 'Non-existent playlist' } });
      const result = classifySpotifyResponse(404, body);
      expect(result.kind).toBe('not_found');
      expect(result.bodyMessage).toBe('Non-existent playlist');
    });

    it('classifies 5xx as server_error', () => {
      for (const status of [500, 502, 503, 504]) {
        const result = classifySpotifyResponse(status, 'Internal Server Error');
        expect(result.kind).toBe('server_error');
      }
    });

    it('classifies 400 playlist size limit as playlist_full', () => {
      const body = JSON.stringify({ error: { status: 400, message: 'Playlist track limit exceeded: maximum size 10000 tracks' } });
      const result = classifySpotifyResponse(400, body);
      expect(result.kind).toBe('playlist_full');
    });

    it('classifies 400 generic as unknown', () => {
      const body = JSON.stringify({ error: { status: 400, message: 'Invalid query parameters' } });
      const result = classifySpotifyResponse(400, body);
      expect(result.kind).toBe('unknown');
    });

    it('safely handles malformed non-JSON body string', () => {
      const result = classifySpotifyResponse(502, '<html><head><title>Bad Gateway</title></head></html>');
      expect(result.kind).toBe('server_error');
      expect(result.bodyMessage).toContain('Bad Gateway');
    });

    it('parses diverse Spotify JSON payload formats', () => {
      // string error
      const r1 = classifySpotifyResponse(400, JSON.stringify({ error: 'invalid_client' }));
      expect(r1.bodyMessage).toBe('invalid_client');

      // error_description
      const r2 = classifySpotifyResponse(400, JSON.stringify({ error_description: 'Authorization code expired' }));
      expect(r2.bodyMessage).toBe('Authorization code expired');

      // message field
      const r3 = classifySpotifyResponse(400, JSON.stringify({ message: 'Missing param' }));
      expect(r3.bodyMessage).toBe('Missing param');
    });
  });
});
