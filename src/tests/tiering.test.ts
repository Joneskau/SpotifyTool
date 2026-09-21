import { describe, it, expect } from 'vitest';
import { calculatePlaylistTiers, formatDuration } from '../utils/tiering';
import { MatchedAlbum, TieringOptions } from '../types/app';

const mockAlbums: MatchedAlbum[] = [
  {
    status: 'found',
    artist: 'Radiohead',
    album: {
      id: 'alb1',
      name: 'OK Computer',
      images: [{ url: 'https://example.com/ok.jpg' }],
      artists: [{ id: 'art1', name: 'Radiohead' }],
    },
    candidates: [],
    trackUris: ['spotify:track:1', 'spotify:track:2', 'spotify:track:3', 'spotify:track:4'],
    trackObjects: [
      { id: '1', name: 'Airbag', uri: 'spotify:track:1', duration_ms: 284000, popularity: 60 },
      { id: '2', name: 'Paranoid Android', uri: 'spotify:track:2', duration_ms: 383000, popularity: 90 },
      { id: '3', name: 'Subterranean', uri: 'spotify:track:3', duration_ms: 267000, popularity: 50 },
      { id: '4', name: 'Karma Police', uri: 'spotify:track:4', duration_ms: 261000, popularity: 85 },
    ],
  },
  {
    status: 'found',
    artist: 'Daft Punk',
    album: {
      id: 'alb2',
      name: 'Discovery',
      images: [{ url: 'https://example.com/disc.jpg' }],
      artists: [{ id: 'art2', name: 'Daft Punk' }],
    },
    candidates: [],
    trackUris: ['spotify:track:5', 'spotify:track:6', 'spotify:track:7', 'spotify:track:8'],
    trackObjects: [
      { id: '5', name: 'One More Time', uri: 'spotify:track:5', duration_ms: 320000, popularity: 95 },
      { id: '6', name: 'Aerodynamic', uri: 'spotify:track:6', duration_ms: 207000, popularity: 75 },
      { id: '7', name: 'Digital Love', uri: 'spotify:track:7', duration_ms: 298000, popularity: 80 },
      { id: '8', name: 'Harder Better Faster Stronger', uri: 'spotify:track:8', duration_ms: 224000, popularity: 88 },
    ],
  },
];

describe('tiering utils', () => {
  it('formats duration correctly', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(180000)).toBe('3m');
    expect(formatDuration(3660000)).toBe('1h 1m');
  });

  describe('calculatePlaylistTiers - Top N Strategy', () => {
    it('selects top N tracks per album in single mode', () => {
      const options: TieringOptions = {
        strategy: 'top_n',
        param: 2,
        maxPlaylists: 10,
        maxTracks: 0,
        mode: 'single',
      };

      const tiers = calculatePlaylistTiers(mockAlbums, options);
      expect(tiers.length).toBe(1);
      // Top 2 from Radiohead: Paranoid Android (90), Karma Police (85)
      // Top 2 from Daft Punk: One More Time (95), Harder Better Faster Stronger (88)
      expect(tiers[0].tracks.length).toBe(4);
      expect(tiers[0].tracks).toContain('spotify:track:5');
      expect(tiers[0].tracks).toContain('spotify:track:2');
    });

    it('creates multi-tier playlists in multi mode', () => {
      const options: TieringOptions = {
        strategy: 'top_n',
        param: 2,
        maxPlaylists: 10,
        maxTracks: 0,
        mode: 'multi',
      };

      const tiers = calculatePlaylistTiers(mockAlbums, options);
      expect(tiers.length).toBe(2);
      expect(tiers[0].nameSuffix).toBe('');
      expect(tiers[1].nameSuffix).toBe(' - Tier 2');
      expect(tiers[0].tracks.length).toBe(4);
      expect(tiers[1].tracks.length).toBe(4);
    });
  });

  describe('calculatePlaylistTiers - Partitioning Strategy', () => {
    it('partitions tracks into sequential playlists according to maxTracks', () => {
      const options: TieringOptions = {
        strategy: 'partitioning',
        param: 0,
        maxPlaylists: 10,
        maxTracks: 3,
        mode: 'single',
      };

      const tiers = calculatePlaylistTiers(mockAlbums, options);
      expect(tiers.length).toBe(3); // 8 tracks / 3 per playlist = 3 parts (3 + 3 + 2)
      expect(tiers[0].tracks.length).toBe(3);
      expect(tiers[1].tracks.length).toBe(3);
      expect(tiers[2].tracks.length).toBe(2);
      expect(tiers[0].nameSuffix).toBe(' - Part 1');
    });

    it('returns empty array if maxTracks <= 0', () => {
      const options: TieringOptions = {
        strategy: 'partitioning',
        param: 0,
        maxPlaylists: 10,
        maxTracks: 0,
        mode: 'single',
      };

      expect(calculatePlaylistTiers(mockAlbums, options)).toEqual([]);
    });
  });

  describe('calculatePlaylistTiers - Deduplication', () => {
    it('filters out tracks that are already in existingTrackUris', () => {
      const existing = new Set(['spotify:track:5', 'spotify:track:2']);
      const options: TieringOptions = {
        strategy: 'top_n',
        param: 4,
        maxPlaylists: 10,
        maxTracks: 0,
        mode: 'single',
      };

      const tiers = calculatePlaylistTiers(mockAlbums, options, existing);
      expect(tiers[0].tracks).not.toContain('spotify:track:5');
      expect(tiers[0].tracks).not.toContain('spotify:track:2');
      expect(tiers[0].tracks.length).toBe(6);
    });
  });
});
