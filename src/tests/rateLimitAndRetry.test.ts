import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchWithRateLimit,
  calculateBackoff,
  cancellableDelay,
  setRateLimitBlockedUntil,
  resetRateLimitGate,
  addTracksBatchWithReconciliation,
} from '../services/spotifyApi';

describe('Rate limiting and backoff reliability', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // Deterministic jitter
    resetRateLimitGate();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    resetRateLimitGate();
  });

  it('calculates deterministic backoff with exponential increase and jitter', () => {
    // baseDelay = 1000, jitter = 500, Math.random = 0.5 -> jitter = 250
    const delay0 = calculateBackoff(0, 1000, 30000, 500);
    expect(delay0).toBe(1000 + 250); // 1250

    const delay1 = calculateBackoff(1, 1000, 30000, 500);
    expect(delay1).toBe(2000 + 250); // 2250

    const delay2 = calculateBackoff(2, 1000, 30000, 500);
    expect(delay2).toBe(4000 + 250); // 4250

    // Caps at maxDelay
    const delayLarge = calculateBackoff(10, 1000, 10000, 500);
    expect(delayLarge).toBe(10000 + 250);
  });

  it('cancellableDelay can be cancelled early with AbortSignal', async () => {
    const controller = new AbortController();
    const delayPromise = cancellableDelay(10000, controller.signal);

    controller.abort();

    await expect(delayPromise).rejects.toThrow('Aborted');
  });

  it('retries on 429 honoring Retry-After header', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    // 1st call: 429 with Retry-After: 3 seconds
    const response429 = new Response(null, {
      status: 429,
      headers: new Headers({ 'Retry-After': '3' }),
    });

    // 2nd call: 200 OK
    const response200 = new Response(JSON.stringify({ ok: true }), { status: 200 });

    mockFetch.mockResolvedValueOnce(response429).mockResolvedValueOnce(response200);

    const promise = fetchWithRateLimit('https://api.spotify.com/v1/me');

    // Fast-forward through the 3.5s wait (3s + 500ms buffer)
    await vi.advanceTimersByTimeAsync(3500);

    const result = await promise;
    expect(result?.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retries on 429 with exponential backoff fallback when Retry-After is missing', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    // 429 without Retry-After header
    const response429 = new Response(null, { status: 429 });
    const response200 = new Response(JSON.stringify({ ok: true }), { status: 200 });

    mockFetch.mockResolvedValueOnce(response429).mockResolvedValueOnce(response200);

    const promise = fetchWithRateLimit('https://api.spotify.com/v1/me');

    // attempt 0 fallback: base 1500 + 250 jitter = 1750ms
    await vi.advanceTimersByTimeAsync(1750);

    const result = await promise;
    expect(result?.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('shares module-level rate-limit gate so concurrent requests wait together', async () => {
    const now = Date.now();
    setRateLimitBlockedUntil(now + 4000);

    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    const promise1 = fetchWithRateLimit('https://api.spotify.com/v1/album/1');
    const promise2 = fetchWithRateLimit('https://api.spotify.com/v1/album/2');

    // Before advancing time, neither has called fetch yet
    expect(mockFetch).not.toHaveBeenCalled();

    // Advance 4000ms
    await vi.advanceTimersByTimeAsync(4000);

    await Promise.all([promise1, promise2]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws rate limit error when Retry-After exceeds 60s instead of sleeping silently', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 429,
        headers: new Headers({ 'Retry-After': '120' }), // 2 minutes
      })
    );
    vi.stubGlobal('fetch', mockFetch);

    await expect(fetchWithRateLimit('https://api.spotify.com/v1/me')).rejects.toThrow(
      'Rate limit wait exceeds 60s (120s required). Paused.'
    );
  });

  it('retries on 5xx server errors (500, 502, 503) with backoff', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    mockFetch
      .mockResolvedValueOnce(new Response('Server Error', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));

    const promise = fetchWithRateLimit('https://api.spotify.com/v1/playlists/123');

    // attempt 0 for 5xx: 1000 + 200 jitter = 1200ms
    await vi.advanceTimersByTimeAsync(1200);

    const result = await promise;
    expect(result?.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry non-retryable client errors (400, 403, 404)', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    mockFetch.mockResolvedValueOnce(new Response('Forbidden', { status: 403 }));

    const result = await fetchWithRateLimit('https://api.spotify.com/v1/playlists/secret');
    expect(result?.status).toBe(403);
    // Should NOT have retried
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries temporary network fetch errors', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    mockFetch
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const promise = fetchWithRateLimit('https://api.spotify.com/v1/me');

    // attempt 0: 1000 + 200 jitter = 1200ms
    await vi.advanceTimersByTimeAsync(1200);

    const result = await promise;
    expect(result?.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('cancels immediately during backoff when AbortSignal is triggered', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    vi.stubGlobal('fetch', mockFetch);

    const controller = new AbortController();
    const promise = fetchWithRateLimit('https://api.spotify.com/v1/me', {
      signal: controller.signal,
    });

    // Abort while waiting for backoff
    controller.abort();

    await expect(promise).rejects.toThrow('Aborted');
  });

  it('reconciles ambiguous POST failure against tracks.total to prevent duplicate track additions', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const playlistId = 'playlist_xyz';
    const batch = ['spotify:track:1', 'spotify:track:2'];

    // 1. Initial getPlaylistDetails before POST: total = 50
    const baselineDetails = {
      id: playlistId,
      name: 'Test Playlist',
      snapshot_id: 'snap_v1',
      tracks: { total: 50 },
    };

    // 2. The POST request lands on Spotify server, but the response drops (502 Bad Gateway)
    const postResponse502 = new Response('Bad Gateway', { status: 502 });

    // 3. Post-failure reconciliation getPlaylistDetails: total = 52 (the 2 tracks landed!)
    const reconciledDetails = {
      id: playlistId,
      name: 'Test Playlist',
      snapshot_id: 'snap_v2',
      tracks: { total: 52 },
    };

    mockFetch
      // call 1: baseline details
      .mockResolvedValueOnce(
        new Response(JSON.stringify(baselineDetails), { status: 200 })
      )
      // call 2: POST fails with 502 (exhausting retries for test brevity with retries=0)
      .mockResolvedValueOnce(postResponse502)
      .mockResolvedValueOnce(postResponse502)
      .mockResolvedValueOnce(postResponse502)
      .mockResolvedValueOnce(postResponse502)
      // call 3: postCheck getPlaylistDetails sees tracks landed!
      .mockResolvedValueOnce(
        new Response(JSON.stringify(reconciledDetails), { status: 200 })
      );

    const resultPromise = addTracksBatchWithReconciliation(playlistId, batch, 'fake_token');

    // Advance all retry timers
    await vi.advanceTimersByTimeAsync(30000);

    const result = await resultPromise;
    expect(result.success).toBe(true);
    expect(result.reconciled).toBe(true);
    expect(result.snapshot_id).toBe('snap_v2');
    expect(result.tracksAdded).toBe(2);
  });
});
