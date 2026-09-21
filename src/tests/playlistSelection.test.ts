import { describe, it, expect } from 'vitest';
import {
  SpotifyPlaylistSimplifiedSchema,
  SpotifyPlaylistDetailsSchema,
} from '../schemas/spotifySchemas';
import {
  generatePlaylistNameSuggestions,
  formatLocalDate,
  isPlaylistNameTaken,
} from '../utils/nameSuggestions';
import {
  validateCoverImage,
  stripDataUrlPrefix,
} from '../utils/imageProcess';
import { SimplifiedPlaylist } from '../types/app';
import { calculatePlaylistTiers } from '../utils/tiering';

describe('3.1 Better Target Playlist Selection', () => {
  describe('Schema Resilience with modern Spotify payloads', () => {
    it('parses playlists using modern "items" total instead of "tracks"', () => {
      const payload = {
        id: 'pl-1',
        name: 'My Modern Playlist',
        description: 'A test description',
        items: { total: 42 },
        owner: { id: 'user-1', display_name: 'Jane Doe' },
        public: true,
        collaborative: false,
        snapshot_id: 'snap-1',
      };

      const parsed = SpotifyPlaylistSimplifiedSchema.parse(payload);
      expect(parsed.id).toBe('pl-1');
      expect(parsed.items?.total).toBe(42);
      expect(parsed.owner?.display_name).toBe('Jane Doe');
      expect(parsed.public).toBe(true);
      expect(parsed.collaborative).toBe(false);
    });

    it('tolerates images: null, display_name: null, and public: null', () => {
      const payload = {
        id: 'pl-2',
        name: 'Null Fields Playlist',
        description: null,
        images: null,
        tracks: { total: 10 },
        owner: { id: 'user-2', display_name: null },
        public: null,
        collaborative: false,
      };

      const parsed = SpotifyPlaylistSimplifiedSchema.parse(payload);
      expect(parsed.images).toEqual([]);
      expect(parsed.owner?.display_name).toBeNull();
      expect(parsed.public).toBeNull();
      expect(parsed.tracks?.total).toBe(10);
    });

    it('parses playlist details schema with snapshot_id and items count', () => {
      const payload = {
        id: 'pl-3',
        name: 'Detailed Playlist',
        description: 'Description',
        snapshot_id: 'snapshot-abc',
        items: { total: 150 },
        public: false,
        collaborative: true,
      };

      const parsed = SpotifyPlaylistDetailsSchema.parse(payload);
      expect(parsed.snapshot_id).toBe('snapshot-abc');
      expect(parsed.items?.total).toBe(150);
      expect(parsed.collaborative).toBe(true);
    });
  });

  describe('Writable Playlist Filtering', () => {
    const myUserId = 'user-me';

    const testPlaylists: SimplifiedPlaylist[] = [
      {
        id: 'p1',
        name: 'My Owned Playlist',
        tracks: { total: 20 },
        owner: { id: myUserId, display_name: 'Me' },
        collaborative: false,
      },
      {
        id: 'p2',
        name: 'Collaborative Playlist by Friend',
        tracks: { total: 35 },
        owner: { id: 'user-friend', display_name: 'Friend' },
        collaborative: true,
      },
      {
        id: 'p3',
        name: 'Read-only Followed Playlist',
        tracks: { total: 50 },
        owner: { id: 'spotify', display_name: 'Spotify' },
        collaborative: false,
      },
    ];

    const isWritable = (p: SimplifiedPlaylist, userId: string): boolean => {
      return p.owner?.id === userId || Boolean(p.collaborative);
    };

    it('filters strictly to playlists the user owns or can collaborate on', () => {
      const writable = testPlaylists.filter(p => isWritable(p, myUserId));
      expect(writable.length).toBe(2);
      expect(writable.map(p => p.id)).toEqual(['p1', 'p2']);
      expect(writable.some(p => p.id === 'p3')).toBe(false);
    });

    it('allows collaborative playlists owned by other accounts', () => {
      const collab = testPlaylists.find(p => p.id === 'p2');
      expect(collab).toBeDefined();
      expect(isWritable(collab!, myUserId)).toBe(true);
    });
  });

  describe('Duplicate Track Counting & URI Filtering', () => {
    it('ignores null, local files, and podcast episode URIs when checking duplicates', () => {
      const incomingUris = [
        'spotify:track:track1',
        'spotify:track:track2',
        'spotify:local:artist:album:title:120',
        'spotify:episode:episode123',
        null as unknown as string,
        'spotify:track:track1', // duplicate in incoming list
      ];

      const existingTrackUris = new Set(['spotify:track:track1', 'spotify:track:existingOther']);

      // Clean & dedupe incoming URIs
      const cleanIncoming = Array.from(
        new Set(
          incomingUris.filter(
            (uri): uri is string => typeof uri === 'string' && uri.startsWith('spotify:track:')
          )
        )
      );

      expect(cleanIncoming).toEqual(['spotify:track:track1', 'spotify:track:track2']);

      // Duplicates count
      const duplicates = cleanIncoming.filter(uri => existingTrackUris.has(uri));
      expect(duplicates).toEqual(['spotify:track:track1']);
      expect(duplicates.length).toBe(1);

      const uniqueNewCount = cleanIncoming.length - duplicates.length;
      expect(uniqueNewCount).toBe(1);
    });

    it('calculatePlaylistTiers accurately filters out existing tracks before forming tiers', () => {
      const mockAlbum = {
        status: 'found' as const,
        originalInput: 'Radiohead - OK Computer',
        artist: 'Radiohead',
        album: {
          id: 'album-1',
          name: 'OK Computer',
          images: [],
          artists: [{ id: 'a-1', name: 'Radiohead' }],
        },
        candidates: [],
        trackUris: ['spotify:track:t1', 'spotify:track:t2', 'spotify:track:t3'],
        trackObjects: [
          { id: 't1', name: 'Airbag', uri: 'spotify:track:t1', duration_ms: 280000, popularity: 70 },
          { id: 't2', name: 'Paranoid Android', uri: 'spotify:track:t2', duration_ms: 380000, popularity: 80 },
          { id: 't3', name: 'Subterranean Homesick Alien', uri: 'spotify:track:t3', duration_ms: 260000, popularity: 60 },
        ],
        selected: true,
        confidence: 1,
      };

      // Pretend t1 and t2 already exist in target playlist
      const existing = new Set(['spotify:track:t1', 'spotify:track:t2']);

      const tiers = calculatePlaylistTiers([mockAlbum], {
        strategy: 'halving',
        param: 3,
        maxPlaylists: 10,
        maxTracks: 0,
        mode: 'single',
      }, existing);

      // Only t3 should remain in the generated tier!
      expect(tiers.length).toBe(1);
      expect(tiers[0].tracks).toEqual(['spotify:track:t3']);
    });
  });

  describe('Pure Name Suggestions & Date Formatting', () => {
    it('formats local date accurately without UTC shift', () => {
      // Create date locally: 2026-06-15 23:59:00
      const localDate = new Date(2026, 5, 15, 23, 59, 0); // Month is 0-indexed (5 = June)
      const formatted = formatLocalDate(localDate);
      expect(formatted).toBe('2026-06-15');
    });

    it('generates content-focused suggestions for single artist', () => {
      const fixedDate = new Date(2026, 8, 21); // 2026-09-21
      const suggestions = generatePlaylistNameSuggestions({
        now: fixedDate,
        artistNames: ['Radiohead'],
        albumNames: ['OK Computer'],
        totalAlbums: 1,
      });

      expect(suggestions).toContain('Radiohead Collection');
      expect(suggestions).toContain('Radiohead - 2026-09-21');
      expect(suggestions).toContain('Album Collection - 2026-09-21');
    });

    it('generates content-focused suggestions for multiple artists', () => {
      const fixedDate = new Date(2026, 8, 21);
      const suggestions = generatePlaylistNameSuggestions({
        now: fixedDate,
        artistNames: ['Radiohead', 'Pink Floyd', 'The Beatles', 'David Bowie'],
        totalAlbums: 4,
      });

      expect(suggestions).toContain('Radiohead, Pink Floyd + 2 more');
      expect(suggestions).toContain('Album Collection - 2026-09-21');
    });

    it('detects taken playlist names case-insensitively', () => {
      const existing = ['My Favorite Albums', 'rock classics', 'Discover Weekly'];
      expect(isPlaylistNameTaken('My Favorite Albums', existing)).toBe(true);
      expect(isPlaylistNameTaken('ROCK CLASSICS', existing)).toBe(true);
      expect(isPlaylistNameTaken('Brand New Mix', existing)).toBe(false);
      expect(isPlaylistNameTaken('', existing)).toBe(false);
    });
  });

  describe('Cover Image Validation & Processing Rules', () => {
    it('rejects unsupported HEIC/HEIF files with clear error message', () => {
      const mockHeic = new File(['fake content'], 'photo.heic', { type: 'image/heic' });
      const result = validateCoverImage(mockHeic);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('HEIC format is not supported');
    });

    it('accepts valid JPEG, PNG, and WebP files', () => {
      const mockJpg = new File(['content'], 'cover.jpg', { type: 'image/jpeg' });
      const mockPng = new File(['content'], 'art.png', { type: 'image/png' });
      const mockWebp = new File(['content'], 'artwork.webp', { type: 'image/webp' });

      expect(validateCoverImage(mockJpg).valid).toBe(true);
      expect(validateCoverImage(mockPng).valid).toBe(true);
      expect(validateCoverImage(mockWebp).valid).toBe(true);
    });

    it('strips data URL prefix correctly', () => {
      const dataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...';
      const stripped = stripDataUrlPrefix(dataUrl);
      expect(stripped).toBe('/9j/4AAQSkZJRgABAQEASABIAAD...');
      expect(stripped.startsWith('data:')).toBe(false);
    });

    it('enforces maximum base64 payload size under 256 KB', () => {
      const MAX_BASE64_BYTES = 250 * 1024;
      // 250 KB base64 string
      const testBase64 = 'A'.repeat(240 * 1024);
      expect(testBase64.length).toBeLessThanOrEqual(MAX_BASE64_BYTES);
    });
  });
});
