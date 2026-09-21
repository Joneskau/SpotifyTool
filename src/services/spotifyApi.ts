import {
  SpotifyUserSchema,
  SpotifyPlaylistSimplifiedSchema,
  SpotifySearchAlbumsResponseSchema,
  SpotifyTrackFullSchema,
  SpotifyTrackSimplifiedSchema,
  SpotifyPagingResponseSchema,
} from '../schemas/spotifySchemas';
import {
  UserProfile,
  SimplifiedPlaylist,
  SimplifiedAlbum,
  TrackObject,
} from '../types/app';
import { similarity, normalizeAlbumName, normalizeDashes } from '../utils/fuzzyMatch';
import { refreshAccessToken } from './spotifyAuth';
import { useAppStore } from '../store/useAppStore';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function fetchWithRateLimit(
  url: string,
  options: RequestInit = {},
  retries = 3,
  onRateLimited?: (msg: string) => void
): Promise<Response | null> {
  try {
    const response = await fetch(url, options);

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 + 1000 : 2000;

      if (retries > 0) {
        onRateLimited?.(`⏳ Rate limited. Waiting ${waitTime / 1000}s...`);
        await delay(waitTime);
        return fetchWithRateLimit(url, options, retries - 1, onRateLimited);
      }

      onRateLimited?.('❌ Rate limit exceeded. Please try again later.');
      return null;
    }

    if (response.status === 401) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        const newHeaders = new Headers(options.headers || {});
        newHeaders.set('Authorization', `Bearer ${newToken}`);
        return fetchWithRateLimit(url, { ...options, headers: newHeaders }, retries, onRateLimited);
      }
      // Graceful handling: Open reconnect modal preserving work
      useAppStore.getState().setIsSessionExpiredModalOpen(true);
      return null;
    }

    return response;
  } catch (error) {
    if (retries > 0) {
      await delay(1000);
      return fetchWithRateLimit(url, options, retries - 1, onRateLimited);
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
        images: p.images || [],
        tracks: { total: p.tracks.total },
      }))
    );
    nextUrl = paging.next;
  }

  return playlists;
}

export async function getPlaylistTracks(playlistId: string, token: string): Promise<Set<string>> {
  const trackUris = new Set<string>();
  let nextUrl: string | null | undefined = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?fields=next,items(track(uri))&limit=100`;

  try {
    while (nextUrl) {
      const response = await fetchWithRateLimit(nextUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response || !response.ok) break;
      const data = await response.json();

      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item: { track?: { uri?: string } }) => {
          if (item?.track?.uri) {
            trackUris.add(item.track.uri);
          }
        });
      }
      nextUrl = data.next;
    }
  } catch (error) {
    console.warn('Error fetching playlist tracks for deduplication:', error);
  }

  return trackUris;
}

export async function getAlbumTracks(albumId: string, token: string): Promise<TrackObject[]> {
  const allTrackIds: string[] = [];
  let nextUrl: string | null | undefined = `https://api.spotify.com/v1/albums/${albumId}/tracks?limit=50`;

  while (nextUrl) {
    const response = await fetchWithRateLimit(nextUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response || !response.ok) {
      throw new Error('Failed to fetch album tracks');
    }
    const data = await response.json();
    const paging = SpotifyPagingResponseSchema(SpotifyTrackSimplifiedSchema).parse(data);

    allTrackIds.push(...paging.items.map(t => t.id));
    nextUrl = paging.next;
  }

  // Get full track objects in batches of 50 to access popularity
  const allTracks: TrackObject[] = [];
  for (let i = 0; i < allTrackIds.length; i += 50) {
    const batchIds = allTrackIds.slice(i, i + 50).join(',');
    const tracksResponse = await fetchWithRateLimit(`https://api.spotify.com/v1/tracks?ids=${batchIds}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
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
  best: SimplifiedAlbum;
  candidates: SimplifiedAlbum[];
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
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(normalizedQuery)}&type=album&limit=10`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response || !response.ok) return null;

      const raw = await response.json();
      const parsed = SpotifySearchAlbumsResponseSchema.parse(raw);
      const items = parsed.albums?.items || [];
      if (items.length === 0) return null;

      const ARTIST_THRESHOLD = 0.7;
      const ALBUM_THRESHOLD = 0.5;
      const candidates: SimplifiedAlbum[] = [];

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

export async function createNewPlaylist(
  userId: string,
  name: string,
  token: string
): Promise<string> {
  const response = await fetchWithRateLimit(`https://api.spotify.com/v1/users/${userId}/playlists`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      description: 'Created with Spotify Album to Playlist Tool',
      public: false,
    }),
  });

  if (!response || !response.ok) {
    throw new Error(`Failed to create playlist "${name}"`);
  }

  const data = await response.json();
  return data.id;
}

export async function addTracksToPlaylist(
  playlistId: string,
  trackUris: string[],
  token: string
): Promise<void> {
  const batchSize = 100;
  for (let i = 0; i < trackUris.length; i += batchSize) {
    const batch = trackUris.slice(i, i + batchSize);
    const response = await fetchWithRateLimit(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uris: batch }),
      }
    );
    if (!response || !response.ok) {
      throw new Error(`Failed adding batch of tracks to playlist ${playlistId}`);
    }
  }
}
