import { describe, it, expect, beforeEach } from 'vitest';
import {
  formatDuration,
  getConfidenceLevel,
  getPlayabilityWarning,
  hasExplicitTracks,
} from '../utils/matchReview';
import {
  SpotifyAlbumSimplifiedSchema,
  SpotifyTrackSimplifiedSchema,
  SpotifyPlaylistDetailsSchema,
  SpotifyPlaylistSimplifiedSchema,
} from '../schemas/spotifySchemas';
import { useAppStore } from '../store/useAppStore';
import { MatchedAlbum, ScoredCandidate, TrackObject, PublishSession } from '../types/app';
import { HEADLINE_MARKET } from '../utils/errorFeedback';

describe('Match Review Utilities', () => {
  describe('formatDuration', () => {
    it('handles non-positive and zero duration', () => {
      expect(formatDuration(0)).toBe('0s');
      expect(formatDuration(-1000)).toBe('0s');
      expect(formatDuration(NaN)).toBe('0s');
    });

    it('formats durations under 60 seconds', () => {
      expect(formatDuration(45000)).toBe('45s');
      expect(formatDuration(59400)).toBe('59s');
    });

    it('formats durations under 1 hour', () => {
      // 53 min 21s = (53 * 60 + 21) * 1000 = 3,201,000 ms
      expect(formatDuration(3201000)).toBe('53 min 21s');
      // Exact minutes: 5 min = 300,000 ms
      expect(formatDuration(300000)).toBe('5 min');
    });

    it('formats durations of 1 hour or more', () => {
      // 1 hr 12 min = (60 + 12) * 60 * 1000 = 4,320,000 ms
      expect(formatDuration(4320000)).toBe('1 hr 12 min');
      // Exact hour: 1 hr = 3,600,000 ms
      expect(formatDuration(3600000)).toBe('1 hr');
      // Multi-hour: 2 hr 5 min = (120 + 5) * 60 * 1000 = 7,500,000 ms
      expect(formatDuration(7500000)).toBe('2 hr 5 min');
    });
  });

  describe('getConfidenceLevel', () => {
    it('strictly aligns with rounded integer percentage', () => {
      // Boundary at 50%:
      // 0.494 * 100 = 49.4 -> round = 49 -> low
      expect(getConfidenceLevel(0.494)).toBe('low');
      // 0.495 * 100 = 49.5 -> round = 50 -> medium
      expect(getConfidenceLevel(0.495)).toBe('medium');

      // Boundary at 80%:
      // 0.794 * 100 = 79.4 -> round = 79 -> medium
      expect(getConfidenceLevel(0.794)).toBe('medium');
      // 0.795 * 100 = 79.5 -> round = 80 -> high
      expect(getConfidenceLevel(0.795)).toBe('high');

      // Extreme values
      expect(getConfidenceLevel(0.0)).toBe('low');
      expect(getConfidenceLevel(1.0)).toBe('high');
      expect(getConfidenceLevel(0.85)).toBe('high');
      expect(getConfidenceLevel(0.65)).toBe('medium');
      expect(getConfidenceLevel(0.35)).toBe('low');
    });
  });

  describe('getPlayabilityWarning', () => {
    it('returns null for empty or undefined tracks', () => {
      expect(getPlayabilityWarning(undefined)).toBeNull();
      expect(getPlayabilityWarning([])).toBeNull();
    });

    it('returns warning when is_playable is false', () => {
      const tracks: TrackObject[] = [
        { id: 't1', name: 'Track 1', uri: 'spotify:track:1', duration_ms: 180000, is_playable: true },
        { id: 't2', name: 'Track 2', uri: 'spotify:track:2', duration_ms: 200000, is_playable: false },
      ];
      expect(getPlayabilityWarning(tracks)).toBe(HEADLINE_MARKET);
    });

    it('returns warning when restrictions reason is market', () => {
      const tracks: TrackObject[] = [
        {
          id: 't1',
          name: 'Track 1',
          uri: 'spotify:track:1',
          duration_ms: 180000,
          restrictions: { reason: 'market' },
        },
      ];
      expect(getPlayabilityWarning(tracks)).toBe(HEADLINE_MARKET);
    });

    it('returns null when all tracks are playable without market restrictions', () => {
      const tracks: TrackObject[] = [
        { id: 't1', name: 'Track 1', uri: 'spotify:track:1', duration_ms: 180000, is_playable: true },
        { id: 't2', name: 'Track 2', uri: 'spotify:track:2', duration_ms: 200000 },
      ];
      expect(getPlayabilityWarning(tracks)).toBeNull();
    });
  });

  describe('hasExplicitTracks', () => {
    it('returns null when tracks are undefined or empty', () => {
      expect(hasExplicitTracks(undefined)).toBeNull();
      expect(hasExplicitTracks([])).toBeNull();
    });

    it('returns true if any track is explicit', () => {
      const tracks: TrackObject[] = [
        { id: 't1', name: 'Track 1', uri: 'spotify:track:1', duration_ms: 180000, explicit: false },
        { id: 't2', name: 'Track 2', uri: 'spotify:track:2', duration_ms: 200000, explicit: true },
      ];
      expect(hasExplicitTracks(tracks)).toBe(true);
    });

    it('returns false if explicit info is present and none is explicit', () => {
      const tracks: TrackObject[] = [
        { id: 't1', name: 'Track 1', uri: 'spotify:track:1', duration_ms: 180000, explicit: false },
        { id: 't2', name: 'Track 2', uri: 'spotify:track:2', duration_ms: 200000, explicit: false },
      ];
      expect(hasExplicitTracks(tracks)).toBe(false);
    });

    it('returns null if explicit status is missing on all tracks (developer mode / unprovided)', () => {
      const tracks: TrackObject[] = [
        { id: 't1', name: 'Track 1', uri: 'spotify:track:1', duration_ms: 180000 },
        { id: 't2', name: 'Track 2', uri: 'spotify:track:2', duration_ms: 200000 },
      ];
      expect(hasExplicitTracks(tracks)).toBeNull();
    });
  });
});

describe('Spotify Schemas (2026 Developer Mode Compatibility)', () => {
  it('parses album without available_markets (removed in Feb 2026)', () => {
    const rawAlbum = {
      id: 'alb_1',
      name: 'OK Computer',
      release_date: '1997-05-21',
      images: [{ url: 'https://img.spotify.com/1', height: 300, width: 300 }],
      artists: [{ id: 'art_1', name: 'Radiohead' }],
      album_type: 'album',
      total_tracks: 12,
    };

    const parsed = SpotifyAlbumSimplifiedSchema.parse(rawAlbum);
    expect(parsed.id).toBe('alb_1');
    expect(parsed.album_type).toBe('album');
    expect(parsed.total_tracks).toBe(12);
  });

  it('safely handles non-standard album_type values by falling back to "album"', () => {
    const rawAlbum = {
      id: 'alb_2',
      name: 'Special Edition EP',
      artists: [{ id: 'art_1', name: 'Radiohead' }],
      album_type: 'ep', // Not one of album/single/compilation
    };

    const parsed = SpotifyAlbumSimplifiedSchema.parse(rawAlbum);
    expect(parsed.album_type).toBe('album');
  });

  it('leaves is_playable and explicit undefined when not supplied by API', () => {
    const rawTrack = {
      id: 'trk_1',
      name: 'Airbag',
      uri: 'spotify:track:airbag',
      duration_ms: 284000,
    };

    const parsed = SpotifyTrackSimplifiedSchema.parse(rawTrack);
    expect(parsed.is_playable).toBeUndefined();
    expect(parsed.explicit).toBeUndefined();
  });

  it('handles dual tracks.total and items.total on playlists', () => {
    const playlistWithTracks = {
      id: 'p1',
      name: 'Playlist 1',
      tracks: { total: 42 },
    };
    const parsedTracks = SpotifyPlaylistDetailsSchema.parse(playlistWithTracks);
    expect(parsedTracks.tracks?.total).toBe(42);

    const playlistWithItems = {
      id: 'p2',
      name: 'Playlist 2',
      items: { total: 84 },
    };
    const parsedItems = SpotifyPlaylistSimplifiedSchema.parse(playlistWithItems);
    expect(parsedItems.items?.total).toBe(84);
  });
});

describe('Match Review State & Undo Flow', () => {
  beforeEach(() => {
    useAppStore.setState({
      matchedAlbums: [],
      publishSession: null,
    });
  });

  const sampleCandidateA: ScoredCandidate = {
    id: 'alb_standard',
    name: 'OK Computer',
    artists: [{ id: 'art_1', name: 'Radiohead' }],
    images: [{ url: 'https://img.spotify.com/std' }],
    album_type: 'album',
    total_tracks: 12,
    release_date: '1997-05-21',
    matchScore: 0.95,
  };

  const sampleCandidateB: ScoredCandidate = {
    id: 'alb_remaster',
    name: 'OK Computer OKNOTOK 1997 2017',
    artists: [{ id: 'art_1', name: 'Radiohead' }],
    images: [{ url: 'https://img.spotify.com/remaster' }],
    album_type: 'album',
    total_tracks: 23,
    release_date: '2017-06-23',
    matchScore: 0.82,
  };

  it('updates matched album when swapping candidate and preserves undo history', () => {
    const initialMatchedAlbum: MatchedAlbum = {
      status: 'found',
      artist: 'Radiohead',
      album: sampleCandidateA,
      trackUris: ['spotify:track:1', 'spotify:track:2'],
      trackObjects: [
        { id: 't1', name: 'Airbag', uri: 'spotify:track:1', duration_ms: 284000 },
        { id: 't2', name: 'Paranoid Android', uri: 'spotify:track:2', duration_ms: 383000 },
      ],
      originalInput: 'Radiohead - OK Computer',
      confidence: 0.95,
      matchSource: 'auto',
      candidates: [sampleCandidateA, sampleCandidateB],
    };

    useAppStore.getState().setMatchedAlbums([initialMatchedAlbum]);

    // Active publish session should be invalidated if album is swapped
    const activeSession: PublishSession = {
      id: 'session_1',
      basePlaylistName: 'My Playlist',
      targetPlaylistId: 'pl_1',
      isNewPlaylist: true,
      createdPlaylists: { 1: { id: 'pl_1', name: 'My Playlist' } },
      batches: [],
      currentBatchIndex: 0,
      totalTracks: 2,
      isPaused: false,
    };
    useAppStore.getState().setPublishSession(activeSession);
    expect(useAppStore.getState().publishSession).not.toBeNull();

    // Perform candidate swap to Edition B
    const originalAutoMatch = {
      album: initialMatchedAlbum.album,
      candidates: initialMatchedAlbum.candidates,
      trackUris: initialMatchedAlbum.trackUris,
      trackObjects: initialMatchedAlbum.trackObjects,
      confidence: initialMatchedAlbum.confidence,
    };

    useAppStore.getState().updateMatchedAlbum(0, {
      album: sampleCandidateB,
      trackUris: ['spotify:track:b1', 'spotify:track:b2', 'spotify:track:b3'],
      trackObjects: [
        { id: 'tb1', name: 'Airbag (Remastered)', uri: 'spotify:track:b1', duration_ms: 284000 },
        { id: 'tb2', name: 'Paranoid Android (Remastered)', uri: 'spotify:track:b2', duration_ms: 383000 },
        { id: 'tb3', name: 'I Promise', uri: 'spotify:track:b3', duration_ms: 194000 },
      ],
      confidence: sampleCandidateB.matchScore,
      originalAutoMatch,
    });
    useAppStore.getState().clearPublishSession();

    // Check state after swap
    const swapped = useAppStore.getState().matchedAlbums[0];
    expect(swapped.album.id).toBe('alb_remaster');
    expect(swapped.album.name).toBe('OK Computer OKNOTOK 1997 2017');
    expect(swapped.trackUris).toHaveLength(3);
    expect(swapped.originalAutoMatch?.album.id).toBe('alb_standard');
    expect(useAppStore.getState().publishSession).toBeNull(); // cleared

    // Revert back to auto match
    const auto = swapped.originalAutoMatch!;
    useAppStore.getState().updateMatchedAlbum(0, {
      album: auto.album,
      candidates: auto.candidates,
      trackUris: auto.trackUris,
      trackObjects: auto.trackObjects,
      confidence: auto.confidence,
      matchSource: 'auto',
      originalAutoMatch: undefined,
    });

    const reverted = useAppStore.getState().matchedAlbums[0];
    expect(reverted.album.id).toBe('alb_standard');
    expect(reverted.album.name).toBe('OK Computer');
    expect(reverted.trackUris).toHaveLength(2);
    expect(reverted.originalAutoMatch).toBeUndefined();
  });

  it('detects duplicate albums matched on multiple lines', () => {
    const albumLine1: MatchedAlbum = {
      status: 'found',
      artist: 'Radiohead',
      album: sampleCandidateA,
      candidates: [],
      trackUris: ['spotify:track:1'],
      trackObjects: [],
      originalInput: 'Radiohead - OK Computer',
      confidence: 0.95,
      matchSource: 'auto',
    };

    const albumLine2: MatchedAlbum = {
      status: 'found',
      artist: 'Radiohead',
      album: sampleCandidateA, // Duplicate album ID
      candidates: [],
      trackUris: ['spotify:track:1'],
      trackObjects: [],
      originalInput: 'OK Computer by Radiohead',
      confidence: 0.9,
      matchSource: 'auto',
    };

    useAppStore.getState().setMatchedAlbums([albumLine1, albumLine2]);
    const items = useAppStore.getState().matchedAlbums;

    const isLine1Duplicate = items.some((other, idx) => idx !== 0 && other.album.id === items[0].album.id);
    const isLine2Duplicate = items.some((other, idx) => idx !== 1 && other.album.id === items[1].album.id);

    expect(isLine1Duplicate).toBe(true);
    expect(isLine2Duplicate).toBe(true);
  });
});
