import {
  SpotifyUserSchema,
  SpotifyPlaylistSimplifiedSchema,
  SpotifyPlaylistDetailsSchema,
  SpotifySnapshotResponseSchema,
  SpotifySearchAlbumsResponseSchema,
  SpotifyTrackFullSchema,
  SpotifyTrackSimplifiedSchema,
  SpotifyPagingResponseSchema,
} from '../schemas/spotifySchemas';
import {
  UserProfile,
  SimplifiedPlaylist,
  TrackObject,
  ScoredCandidate,
} from '../types/app';
import { similarity, normalizeAlbumName, normalizeDashes } from '../utils/fuzzyMatch';
import { refreshAccessToken } from './spotifyAuth';
import { useAppStore } from '../store/useAppStore';

// Shared module-level rate-limit gate
let rateLimitBlockedUntil = 0;

export function getRateLimitBlockedUntil(): number {
  return rateLimitBlockedUntil;
}

export function setRateLimitBlockedUntil(timestamp: number): void {
  rateLimitBlockedUntil = Math.max(rateLimitBlockedUntil, timestamp);
}

export function resetRateLimitGate(): void {
  rateLimitBlockedUntil = 0;
}

export function calculateBackoff(
  attempt: number,
  baseDelay = 1000,
  maxDelay = 30000,
  jitter = 500
): number {
  const exponential = Math.min(maxDelay, baseDelay * Math.pow(2, attempt));
  const randomJitter = Math.random() * jitter;
  return Math.round(exponential + randomJitter);
}

export const cancellableDelay = (ms: number, signal?: AbortSignal | null): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new DOMException('Aborted', 'AbortError'));
    }
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });

export async function fetchWithRateLimit(
  url: string,
  options: RequestInit = {},
  retries = 3,
  onRateLimited?: (msg: string) => void,
  attempt = 0
): Promise<Response | null> {
  if (options.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  // Check shared rate-limit gate
  const now = Date.now();
  if (rateLimitBlockedUntil > now) {
    const waitTime = rateLimitBlockedUntil - now;
    onRateLimited?.(`⏳ Rate limit gate active. Pausing for ${(waitTime / 1000).toFixed(1)}s...`);
    await cancellableDelay(waitTime, options.signal);
  }

  try {
    const response = await fetch(url, options);

    // 429 Too Many Requests
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      let waitTime: number;

      if (retryAfter && !isNaN(parseInt(retryAfter, 10))) {
        const seconds = parseInt(retryAfter, 10);
        if (seconds > 60) {
          setRateLimitBlockedUntil(Date.now() + seconds * 1000);
          const err = new Error(`Rate limit wait exceeds 60s (${seconds}s required). Paused.`);
          (err as unknown as { isRateLimitExceeded: boolean }).isRateLimitExceeded = true;
          (err as unknown as { retryAfter: number }).retryAfter = seconds;
          throw err;
        }
        waitTime = seconds * 1000 + 500;
      } else {
        waitTime = calculateBackoff(attempt, 1500, 30000, 500);
      }

      setRateLimitBlockedUntil(Date.now() + waitTime);

      if (retries > 0) {
        onRateLimited?.(
          `⏳ Rate limited (429). Retrying in ${(waitTime / 1000).toFixed(1)}s (attempt ${attempt + 1})...`
        );
        await cancellableDelay(waitTime, options.signal);
        return fetchWithRateLimit(url, options, retries - 1, onRateLimited, attempt + 1);
      }

      onRateLimited?.('❌ Rate limit exceeded. Maximum retries reached.');
      return response;
    }

    // 5xx Server Errors (500, 502, 503, 504)
    if (response.status >= 500 && response.status <= 599) {
      if (retries > 0) {
        const waitTime = calculateBackoff(attempt, 1000, 20000, 400);
        onRateLimited?.(
          `⏳ Server error (${response.status}). Retrying in ${(waitTime / 1000).toFixed(1)}s (attempt ${attempt + 1})...`
        );
        await cancellableDelay(waitTime, options.signal);
        return fetchWithRateLimit(url, options, retries - 1, onRateLimited, attempt + 1);
      }
      return response;
    }

    // 401 Unauthorized (Token Expiration)
    if (response.status === 401) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        const newHeaders = new Headers(options.headers || {});
        newHeaders.set('Authorization', `Bearer ${newToken}`);
        return fetchWithRateLimit(
          url,
          { ...options, headers: newHeaders },
          retries,
          onRateLimited,
          attempt
        );
      }
      // Graceful handling: Open reconnect modal preserving work
      useAppStore.getState().setIsSessionExpiredModalOpen(true);
      return null;
    }

    // Non-retryable client errors: 400, 403, 404, etc. Return immediately.
    return response;
  } catch (error: unknown) {
    if (
      (error instanceof DOMException && error.name === 'AbortError') ||
      (error as { name?: string }).name === 'AbortError' ||
      (error as { isRateLimitExceeded?: boolean }).isRateLimitExceeded
    ) {
      throw error;
    }

    if (retries > 0) {
      const waitTime = calculateBackoff(attempt, 1000, 20000, 400);
      onRateLimited?.(
        `⏳ Network error. Retrying in ${(waitTime / 1000).toFixed(1)}s (attempt ${attempt + 1})...`
      );
      await cancellableDelay(waitTime, options.signal);
      return fetchWithRateLimit(url, options, retries - 1, onRateLimited, attempt + 1);
    }
    throw error;
  }
}


export async function getUserProfile(token: string): Promise<UserProfile> {
  const response = await fetchWithRateLimit('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response || !response.ok) {
    throw new Error('Failed to load user profile');
  }
  const json = await response.json();
  const parsed = SpotifyUserSchema.parse(json);
  return {
    id: parsed.id,
    display_name: parsed.display_name || 'Spotify User',
    images: parsed.images,
  };
}

export async function getUserPlaylists(token: string): Promise<SimplifiedPlaylist[]> {
  const playlists: SimplifiedPlaylist[] = [];
  let nextUrl: string | null | undefined = 'https://api.spotify.com/v1/me/playlists?limit=50';

  while (nextUrl) {
    const response = await fetchWithRateLimit(nextUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response || !response.ok) {
      throw new Error('Failed to load playlists');
    }
    const json = await response.json();
    const paging = SpotifyPagingResponseSchema(SpotifyPlaylistSimplifiedSchema).parse(json);

    playlists.push(
      ...paging.items.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description ?? undefined,
        images: p.images || [],
        snapshot_id: p.snapshot_id,
        owner: p.owner
          ? {
              id: p.owner.id,
              display_name: p.owner.display_name ?? null,
            }
          : undefined,
        public: p.public,
        collaborative: Boolean(p.collaborative),
        tracks: { total: p.items?.total ?? p.tracks?.total ?? 0 },
      }))
    );
    nextUrl = paging.next;
  }

  return playlists;
}

export interface GetPlaylistTracksOptions {
  signal?: AbortSignal;
  onProgress?: (current: number, total: number) => void;
}

export async function getPlaylistTracks(
  playlistId: string,
  token: string,
  options?: GetPlaylistTracksOptions
): Promise<Set<string>> {
  const trackUris = new Set<string>();
  let nextUrl: string | null | undefined = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?fields=next,total,items(track(uri))&limit=50`;
  let totalTracks = 0;
  let fetchedCount = 0;

  while (nextUrl) {
    if (options?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const response = await fetchWithRateLimit(nextUrl, {
      headers: { Authorization: `Bearer ${token}` },
      signal: options?.signal,
    });
    if (!response || !response.ok) {
      throw new Error(`Failed to fetch playlist tracks (${response?.status || 'Network error'})`);
    }
    const data = await response.json();

    if (typeof data.total === 'number' && totalTracks === 0) {
      totalTracks = data.total;
    }

    if (data.items && Array.isArray(data.items)) {
      data.items.forEach((item: { track?: { uri?: string } }) => {
        const uri = item?.track?.uri;
        if (uri && typeof uri === 'string' && uri.startsWith('spotify:track:')) {
          trackUris.add(uri);
        }
      });
      fetchedCount += data.items.length;
      options?.onProgress?.(fetchedCount, totalTracks || fetchedCount);
    }
    nextUrl = data.next;
  }

  return trackUris;
}

export async function getAlbumTracks(
  albumId: string,
  token: string,
  signal?: AbortSignal
): Promise<TrackObject[]> {
  const allTrackIds: string[] = [];
  let nextUrl: string | null | undefined = `https://api.spotify.com/v1/albums/${albumId}/tracks?limit=50&market=from_token`;

  while (nextUrl) {
    const response = await fetchWithRateLimit(
      nextUrl,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      },
      3
    );
    if (!response || !response.ok) {
      throw new Error('Failed to fetch album tracks');
    }
    const data = await response.json();
    const paging = SpotifyPagingResponseSchema(SpotifyTrackSimplifiedSchema).parse(data);

    allTrackIds.push(...paging.items.map(t => t.id));
    nextUrl = paging.next;
  }

  // Get full track objects in batches of 50 to access popularity, explicit and playability flags
  const allTracks: TrackObject[] = [];
  for (let i = 0; i < allTrackIds.length; i += 50) {
    const batchIds = allTrackIds.slice(i, i + 50).join(',');
    const tracksResponse = await fetchWithRateLimit(
      `https://api.spotify.com/v1/tracks?ids=${batchIds}&market=from_token`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      },
      3
    );
    if (!tracksResponse || !tracksResponse.ok) {
      throw new Error('Failed to fetch track details');
    }
    const tracksData = await tracksResponse.json();
    if (tracksData.tracks && Array.isArray(tracksData.tracks)) {
      const parsedBatch = tracksData.tracks
        .filter(Boolean)
        .map((t: unknown) => SpotifyTrackFullSchema.parse(t));
      allTracks.push(...parsedBatch);
    }
  }

  // Filter out tracks less than 30 seconds (30000 ms)
  return allTracks.filter(track => track && track.duration_ms >= 30000);
}

export interface AlbumSearchResult {
  best: ScoredCandidate;
  candidates: ScoredCandidate[];
}

export async function searchAlbumWithStrategies(
  artist: string,
  albumName: string,
  token: string
): Promise<AlbumSearchResult | null> {
  const cleanArtist = artist.replace(/["\\]/g, '');
  const cleanAlbum = albumName.replace(/["\\]/g, '');

  const executeSearch = async (query: string): Promise<AlbumSearchResult | null> => {
    try {
      const normalizedQuery = normalizeDashes(query);
      const response = await fetchWithRateLimit(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(normalizedQuery)}&type=album&limit=10&market=from_token`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response || !response.ok) return null;

      const raw = await response.json();
      const parsed = SpotifySearchAlbumsResponseSchema.parse(raw);
      const items = parsed.albums?.items || [];
      if (items.length === 0) return null;

      const ARTIST_THRESHOLD = 0.7;
      const ALBUM_THRESHOLD = 0.5;
      const candidates: ScoredCandidate[] = [];

      for (const album of items) {
        const artistMatchScore = Math.max(
          ...album.artists.map(a => similarity(a.name, cleanArtist)),
          ...album.artists.map(a => {
            const sArtist = a.name.toLowerCase().trim();
            const iArtist = cleanArtist.toLowerCase().trim();
            return sArtist.includes(iArtist) || iArtist.includes(sArtist) ? 0.85 : 0;
          })
        );

        const albumMatchScore = Math.max(
          similarity(album.name, cleanAlbum),
          similarity(normalizeAlbumName(album.name), normalizeAlbumName(cleanAlbum))
        );

        if (artistMatchScore < ARTIST_THRESHOLD) continue;
        if (albumMatchScore < ALBUM_THRESHOLD) continue;

        let popularity = album.popularity;
        if (popularity === undefined) {
          try {
            const tracks = await getAlbumTracks(album.id, token);
            popularity =
              tracks.reduce((sum, t) => sum + (t.popularity || 0), 0) / (tracks.length || 1);
          } catch {
            popularity = 0;
          }
        }

        const combinedScore =
          artistMatchScore * 0.4 + albumMatchScore * 0.4 + (popularity / 100) * 0.2;

        candidates.push({
          id: album.id,
          name: album.name,
          release_date: album.release_date,
          images: album.images,
          artists: album.artists,
          matchScore: combinedScore,
          popularity,
          album_type: album.album_type,
          total_tracks: album.total_tracks,
          restrictions: album.restrictions,
        });

        if (candidates.length >= 5) break;
      }

      if (candidates.length === 0) return null;

      candidates.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

      return {
        best: candidates[0],
        candidates,
      };
    } catch (err) {
      console.error('Spotify search error:', err);
      return null;
    }
  };

  // Strategy 1: Strict Field Search
  let res = await executeSearch(`album:"${cleanAlbum}" artist:"${cleanArtist}"`);
  if (res && res.candidates.length > 0) return res;

  // Strategy 2: Loose Field Search
  res = await executeSearch(`album:${cleanAlbum} artist:${cleanArtist}`);
  if (res && res.candidates.length > 0) return res;

  // Strategy 3: General Text Search
  res = await executeSearch(`${cleanArtist} ${cleanAlbum}`);
  if (res && res.candidates.length > 0) return res;

  // Strategy 4: Alt Symbols (& vs and)
  if (cleanAlbum.includes('&') || cleanAlbum.includes('and')) {
    const altAlbum = cleanAlbum.replace(/\b(and)\b|&/gi, match =>
      match.toLowerCase() === 'and' ? '&' : 'and'
    );
    res = await executeSearch(`${cleanArtist} ${altAlbum}`);
    if (res && res.candidates.length > 0) return res;
  }

  // Strategy 5: Strip "The " from artist
  if (cleanArtist.toLowerCase().startsWith('the ')) {
    const strippedArtist = cleanArtist.substring(4);
    res = await executeSearch(`${strippedArtist} ${cleanAlbum}`);
    if (res && res.candidates.length > 0) return res;
  }

  return null;
}

export interface CandidateDetails {
  albumId: string;
  tracks: TrackObject[];
  totalDurationMs: number;
  hasExplicit: boolean | null;
  isPlayable: boolean;
}

const candidateDetailsCache = new Map<string, CandidateDetails>();

export function clearCandidateCache(): void {
  candidateDetailsCache.clear();
}

export async function getCandidateDetails(
  albumId: string,
  token: string,
  signal?: AbortSignal
): Promise<CandidateDetails> {
  if (candidateDetailsCache.has(albumId)) {
    return candidateDetailsCache.get(albumId)!;
  }

  const tracks = await getAlbumTracks(albumId, token, signal);
  const totalDurationMs = tracks.reduce((sum, t) => sum + (t.duration_ms || 0), 0);
  const anyExplicit = tracks.some(t => t.explicit === true);
  const hasExplicit = anyExplicit
    ? true
    : tracks.some(t => typeof t.explicit === 'boolean')
    ? false
    : null;
  const isPlayable = !tracks.some(
    t => t.is_playable === false || t.restrictions?.reason === 'market'
  );

  const details: CandidateDetails = {
    albumId,
    tracks,
    totalDurationMs,
    hasExplicit,
    isPlayable,
  };

  candidateDetailsCache.set(albumId, details);
  return details;
}

export async function searchSingleAlbumCandidates(
  query: string,
  token: string,
  signal?: AbortSignal
): Promise<ScoredCandidate[]> {
  const cleanQuery = query.replace(/["\\]/g, '').trim();
  if (!cleanQuery) return [];

  const normalizedQuery = normalizeDashes(cleanQuery);
  const response = await fetchWithRateLimit(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(normalizedQuery)}&type=album&limit=10&market=from_token`,
    { headers: { Authorization: `Bearer ${token}` }, signal }
  );

  if (!response || !response.ok) return [];

  const raw = await response.json();
  const parsed = SpotifySearchAlbumsResponseSchema.parse(raw);
  const items = parsed.albums?.items || [];

  return items.map(album => {
    const albumArtist = album.artists.map(a => a.name).join(' ');
    const artistScore = similarity(albumArtist, cleanQuery);
    const albumScore = similarity(album.name, cleanQuery);
    const combined = Math.max(artistScore, albumScore);

    return {
      id: album.id,
      name: album.name,
      release_date: album.release_date,
      images: album.images,
      artists: album.artists,
      matchScore: combined,
      album_type: album.album_type,
      total_tracks: album.total_tracks,
      restrictions: album.restrictions,
      popularity: album.popularity,
    };
  });
}

export async function createNewPlaylist(
  userId: string,
  name: string,
  token: string,
  options?: {
    description?: string;
    isPublic?: boolean;
  }
): Promise<string> {
  const body = JSON.stringify({
    name,
    description: options?.description || 'Created with Spotify Album to Playlist Tool',
    public: options?.isPublic ?? false,
  });

  // Try /me/playlists first (Spotify 2026 Developer Mode)
  let response = await fetchWithRateLimit('https://api.spotify.com/v1/me/playlists', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body,
  });

  // Fallback to /users/${userId}/playlists if needed
  if (!response || !response.ok) {
    response = await fetchWithRateLimit(`https://api.spotify.com/v1/users/${userId}/playlists`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body,
    });
  }

  if (!response || !response.ok) {
    throw new Error(`Failed to create playlist "${name}"`);
  }

  const data = await response.json();
  return data.id;
}

export async function uploadPlaylistCoverImage(
  playlistId: string,
  base64Jpeg: string,
  token: string
): Promise<boolean> {
  try {
    const cleanBase64 = base64Jpeg.replace(/^data:image\/[a-z]+;base64,/, '');
    const response = await fetchWithRateLimit(
      `https://api.spotify.com/v1/playlists/${playlistId}/images`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'image/jpeg',
        },
        body: cleanBase64,
      },
      1
    );

    if (response && (response.status === 202 || response.ok)) {
      return true;
    }
    console.warn(`Cover upload returned status ${response?.status}`);
    return false;
  } catch (err) {
    console.warn('Cover image upload failed:', err);
    return false;
  }
}

export async function getPlaylistDetails(
  playlistId: string,
  token: string,
  signal?: AbortSignal
): Promise<{ id: string; name: string; snapshot_id?: string; tracks: { total: number } }> {
  const response = await fetchWithRateLimit(
    `https://api.spotify.com/v1/playlists/${playlistId}?fields=id,name,snapshot_id,tracks(total),items(total)`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    }
  );
  if (!response || !response.ok) {
    throw new Error(
      `Failed to fetch playlist details for ${playlistId} (${response?.status || 'Network error'})`
    );
  }
  const json = await response.json();
  const parsed = SpotifyPlaylistDetailsSchema.parse(json);
  const total = parsed.items?.total ?? parsed.tracks?.total ?? 0;
  return {
    id: parsed.id,
    name: parsed.name,
    snapshot_id: parsed.snapshot_id,
    tracks: { total },
  };
}

export interface BatchAddResult {
  success: boolean;
  snapshot_id?: string;
  tracksAdded: number;
  reconciled?: boolean;
  error?: string;
  status?: number;
}

export async function addTracksBatchWithReconciliation(
  playlistId: string,
  trackUris: string[],
  token: string,
  options?: {
    signal?: AbortSignal;
    onRateLimited?: (msg: string) => void;
  }
): Promise<BatchAddResult> {
  if (trackUris.length === 0) {
    return { success: true, tracksAdded: 0 };
  }

  // 1. Get baseline tracks.total before the batch
  let initialTotal: number | null = null;
  try {
    const details = await getPlaylistDetails(playlistId, token, options?.signal);
    initialTotal = details.tracks.total;
  } catch {
    // If baseline details fetch fails, continue without baseline reconciliation
  }

  try {
    const response = await fetchWithRateLimit(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uris: trackUris }),
        signal: options?.signal,
      },
      3,
      options?.onRateLimited
    );

    if (response && response.ok) {
      const data = await response.json().catch(() => ({}));
      const parsed = SpotifySnapshotResponseSchema.safeParse(data);
      return {
        success: true,
        snapshot_id: parsed.success ? parsed.data.snapshot_id : undefined,
        tracksAdded: trackUris.length,
      };
    }

    // Ambiguous response status (5xx or null after network issues)
    // Check if the batch actually landed server-side to prevent duplicates!
    if (initialTotal !== null) {
      try {
        const postCheck = await getPlaylistDetails(playlistId, token, options?.signal);
        if (postCheck.tracks.total >= initialTotal + trackUris.length) {
          return {
            success: true,
            snapshot_id: postCheck.snapshot_id,
            tracksAdded: trackUris.length,
            reconciled: true,
          };
        }
      } catch {
        // Reconciliation check failed
      }
    }

    const status = response?.status;
    const errorBody = response ? await response.text().catch(() => '') : '';
    return {
      success: false,
      status,
      error: `HTTP ${status || 'Network Error'}: ${errorBody || 'Failed to add tracks'}`,
      tracksAdded: 0,
    };
  } catch (err: unknown) {
    // Network error or fetch exception - check reconciliation before failing!
    if (
      initialTotal !== null &&
      !(err instanceof DOMException && err.name === 'AbortError')
    ) {
      try {
        const postCheck = await getPlaylistDetails(playlistId, token, options?.signal);
        if (postCheck.tracks.total >= initialTotal + trackUris.length) {
          return {
            success: true,
            snapshot_id: postCheck.snapshot_id,
            tracksAdded: trackUris.length,
            reconciled: true,
          };
        }
      } catch {
        // Fall through
      }
    }

    const msg = err instanceof Error ? err.message : 'Unknown error during batch addition';
    return {
      success: false,
      error: msg,
      tracksAdded: 0,
    };
  }
}

export async function addTracksToPlaylist(
  playlistId: string,
  trackUris: string[],
  token: string,
  options?: {
    signal?: AbortSignal;
    onProgress?: (batchIndex: number, totalBatches: number, tracksAddedSoFar: number) => void;
    onRateLimited?: (msg: string) => void;
  }
): Promise<{ snapshot_id?: string; totalAdded: number }> {
  const batchSize = 100;
  const totalBatches = Math.ceil(trackUris.length / batchSize);
  let lastSnapshotId: string | undefined;
  let totalAdded = 0;

  for (let i = 0; i < trackUris.length; i += batchSize) {
    const batch = trackUris.slice(i, i + batchSize);
    const batchIndex = Math.floor(i / batchSize);

    const result = await addTracksBatchWithReconciliation(playlistId, batch, token, {
      signal: options?.signal,
      onRateLimited: options?.onRateLimited,
    });

    if (!result.success) {
      throw new Error(
        `Failed adding batch ${batchIndex + 1}/${totalBatches} (${batch.length} tracks) to playlist ${playlistId}: ${result.error}`
      );
    }

    lastSnapshotId = result.snapshot_id;
    totalAdded += result.tracksAdded;
    options?.onProgress?.(batchIndex + 1, totalBatches, totalAdded);
  }

  return { snapshot_id: lastSnapshotId, totalAdded };
}

