import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore, selectStatusMetrics } from '../store/useAppStore';
import { calculatePlaylistTiers } from '../utils/tiering';
import { MatchedAlbum, FailedAlbum, ScoredCandidate, TrackObject, PublishSession } from '../types/app';
import { HEADLINE_NOT_FOUND } from '../utils/errorFeedback';

const mockCandidate = (id: string, name: string, artist = 'Artist'): ScoredCandidate => ({
  id,
  name,
  artists: [{ id: `art_${artist}`, name: artist }],
  album_type: 'album',
  total_tracks: 3,
  release_date: '2020-01-01',
  images: [],
  matchScore: 0.95,
});

const mockTrack = (id: string, name: string, isPlayable = true): TrackObject => ({
  id,
  name,
  uri: `spotify:track:${id}`,
  duration_ms: 200000,
  is_playable: isPlayable,
});

describe('Status Metrics Selector', () => {
  beforeEach(() => {
    useAppStore.getState().resetToSearch();
    useAppStore.getState().setAlbumListText('');
    useAppStore.getState().setMatchedAlbums([]);
    useAppStore.getState().setFailedAlbums([]);
    useAppStore.getState().setExistingTrackUris(new Set());
  });

  it('reports 0 metrics in initial state', () => {
    const metrics = selectStatusMetrics(useAppStore.getState());
    expect(metrics.processing.current).toBe(0);
    expect(metrics.processing.total).toBe(0);
    expect(metrics.warnings.total).toBe(0);
    expect(metrics.errors.total).toBe(0);
    expect(metrics.duplicates.count).toBe(0);
    expect(metrics.tracksReady.total).toBe(0);
  });

  it('accurately derives processing count and status during search', () => {
    useAppStore.getState().setAlbumListText('Artist 1 - Album 1\nArtist 2 - Album 2\nArtist 3 - Album 3');
    useAppStore.getState().setIsProcessing(true);
    useAppStore.getState().setProgress(2, 3);
    useAppStore.getState().setDetailedProgress({
      stage: 'searching',
      searching: { current: 2, total: 3 },
    });

    const metrics = selectStatusMetrics(useAppStore.getState());
    expect(metrics.processing.status).toBe('processing');
    expect(metrics.processing.current).toBe(2);
    expect(metrics.processing.total).toBe(3);
    expect(metrics.processing.text).toBe('Processing: 2 / 3 albums');
  });

  it('accurately derives warnings without double-counting', () => {
    const candidate1 = mockCandidate('alb_1', 'Album 1');
    const candidate2 = mockCandidate('alb_1', 'Album 1 (Duplicate input)');
    const candidate3 = mockCandidate('alb_2', 'Album 2');

    // 1. Market restricted track
    const tracksWithRestriction = [
      mockTrack('t1', 'Track 1', true),
      mockTrack('t2', 'Track 2', false), // Restricted
    ];

    const album1: MatchedAlbum = {
      status: 'found',
      originalInput: 'Artist - Album 1',
      artist: 'Artist',
      album: candidate1,
      candidates: [candidate1],
      trackUris: tracksWithRestriction.map(t => t.uri),
      trackObjects: tracksWithRestriction,
      confidence: 0.9,
      matchSource: 'auto',
      selected: true,
    };

    // 2. Duplicate album line matching the same album id 'alb_1'
    const album2: MatchedAlbum = {
      status: 'found',
      originalInput: 'Artist - Album 1 (line 2)',
      artist: 'Artist',
      album: candidate2,
      candidates: [candidate2],
      trackUris: ['spotify:track:t1'],
      trackObjects: [mockTrack('t1', 'Track 1')],
      confidence: 0.9,
      matchSource: 'auto',
      selected: true,
    };

    // 3. Low confidence match (< 0.5)
    const album3: MatchedAlbum = {
      status: 'found',
      originalInput: 'Artist - Album 2',
      artist: 'Artist',
      album: candidate3,
      candidates: [candidate3],
      trackUris: ['spotify:track:t3'],
      trackObjects: [mockTrack('t3', 'Track 3')],
      confidence: 0.35,
      matchSource: 'auto',
      selected: true,
    };

    useAppStore.getState().setAlbumListText('Artist - Album 1\nArtist - Album 1 (line 2)\nArtist - Album 2');
    useAppStore.getState().setMatchedAlbums([album1, album2, album3]);

    const metrics = selectStatusMetrics(useAppStore.getState());
    expect(metrics.warnings.breakdown.marketRestricted).toBe(1);
    expect(metrics.warnings.breakdown.duplicateInputLine).toBe(2); // album1 and album2 share alb_1
    expect(metrics.warnings.breakdown.lowConfidence).toBe(1);
    expect(metrics.warnings.total).toBe(4);
  });

  it('accurately derives errors breakdown including batch failures', () => {
    const failed: FailedAlbum[] = [
      { line: 'Bad - Line', artist: 'Bad', albumName: 'Line', status: 'not_found', reason: HEADLINE_NOT_FOUND },
      { line: 'Net - Fail', artist: 'Net', albumName: 'Fail', status: 'search_failed', reason: 'Timeout' },
      { line: 'InvalidLine', artist: '', albumName: '', status: 'skipped', reason: 'Invalid format' },
    ];

    useAppStore.getState().setAlbumListText('Bad - Line\nNet - Fail\nInvalidLine');
    useAppStore.getState().setFailedAlbums(failed);
    useAppStore.getState().addPublishFailure({
      id: 'pf_1',
      batchId: '0-0',
      tierIndex: 0,
      batchIndex: 0,
      playlistName: 'Target Playlist',
      trackCount: 50,
      trackNames: ['Track 1'],
      reason: 'HTTP 500 Server Error',
      status: 500,
      timestamp: Date.now(),
    });

    const metrics = selectStatusMetrics(useAppStore.getState());
    expect(metrics.errors.breakdown.notFound).toBe(1);
    expect(metrics.errors.breakdown.searchFailed).toBe(1);
    expect(metrics.errors.breakdown.skippedInvalid).toBe(1);
    expect(metrics.errors.breakdown.batchFailures).toBe(1);
    expect(metrics.errors.total).toBe(4);
  });

  it('guarantees tracks ready matches calculatePlaylistTiers with zero double counting', () => {
    const cand1 = mockCandidate('a1', 'Alb 1');
    const cand2 = mockCandidate('a2', 'Alb 2');

    const album1: MatchedAlbum = {
      status: 'found',
      originalInput: 'Artist - Alb 1',
      artist: 'Artist',
      album: cand1,
      candidates: [cand1],
      trackUris: ['spotify:track:1', 'spotify:track:2', 'spotify:track:dup'],
      trackObjects: [mockTrack('1', 'T1'), mockTrack('2', 'T2'), mockTrack('dup', 'Tdup')],
      selected: true,
      confidence: 1,
    };

    const album2: MatchedAlbum = {
      status: 'found',
      originalInput: 'Artist - Alb 2',
      artist: 'Artist',
      album: cand2,
      candidates: [cand2],
      trackUris: ['spotify:track:dup', 'spotify:track:3', 'spotify:track:existing'],
      trackObjects: [mockTrack('dup', 'Tdup'), mockTrack('3', 'T3'), mockTrack('existing', 'Texisting')],
      selected: true,
      confidence: 1,
    };

    useAppStore.getState().setAlbumListText('Artist - Alb 1\nArtist - Alb 2');
    useAppStore.getState().setMatchedAlbums([album1, album2]);
    // Simulate target playlist already containing 'spotify:track:existing'
    useAppStore.getState().setExistingTrackUris(new Set(['spotify:track:existing']));

    const storeState = useAppStore.getState();
    const metrics = selectStatusMetrics(storeState);

    // Duplicates: dup (cross-album) + existing (in playlist) = 2 duplicates
    expect(metrics.duplicates.count).toBe(2);
    expect(metrics.duplicates.label).toBe('Duplicates to skip');

    // Verify mathematical identity with calculatePlaylistTiers
    const tiers = calculatePlaylistTiers(
      [album1, album2],
      storeState.tierOptions,
      new Set(['spotify:track:existing'])
    );
    const expectedTracksFromTiers = tiers.reduce((s, t) => s + t.tracks.length, 0);
    expect(metrics.tracksReady.total).toBe(expectedTracksFromTiers);
  });

  it('switches duplicates label to "Duplicates skipped" after publishing completes batches', () => {
    const cand = mockCandidate('a1', 'Alb 1');
    const album: MatchedAlbum = {
      status: 'found',
      originalInput: 'A - B',
      artist: 'A',
      album: cand,
      candidates: [cand],
      trackUris: ['spotify:track:1', 'spotify:track:1'],
      trackObjects: [mockTrack('1', 'T1'), mockTrack('1', 'T1')],
      selected: true,
      confidence: 1,
    };

    useAppStore.getState().setMatchedAlbums([album]);
    const prePublish = selectStatusMetrics(useAppStore.getState());
    expect(prePublish.duplicates.label).toBe('Duplicates to skip');

    // Simulate active publish session with at least one completed batch
    const session: PublishSession = {
      id: 'sess_1',
      basePlaylistName: 'Test',
      targetPlaylistId: 'p1',
      isNewPlaylist: false,
      createdPlaylists: {},
      batches: [
        { id: 'b1', tierIndex: 0, tierSuffix: '', batchIndex: 0, trackUris: ['spotify:track:1'], trackNames: ['T1'], status: 'completed' },
      ],
      currentBatchIndex: 0,
      totalTracks: 1,
      isPaused: false,
    };
    useAppStore.getState().setPublishSession(session);

    const postPublish = selectStatusMetrics(useAppStore.getState());
    expect(postPublish.duplicates.label).toBe('Duplicates skipped');
  });
});
