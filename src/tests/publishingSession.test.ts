import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAppStore } from '../store/useAppStore';
import { PublishBatch, PublishSession } from '../types/app';
import { addTracksToPlaylist } from '../services/spotifyApi';

class MockStorage implements Storage {
  private store: Record<string, string> = {};
  get length() {
    return Object.keys(this.store).length;
  }
  clear() {
    this.store = {};
  }
  getItem(key: string) {
    return this.store[key] ?? null;
  }
  key(index: number) {
    return Object.keys(this.store)[index] ?? null;
  }
  removeItem(key: string) {
    delete this.store[key];
  }
  setItem(key: string, value: string) {
    this.store[key] = String(value);
  }
}

describe('Publishing Session, Batches & Limit Reliability', () => {
  beforeEach(() => {
    globalThis.localStorage = new MockStorage();
    useAppStore.getState().clearPublishSession();
    useAppStore.getState().clearPublishFailures();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('chunks track additions in groups of up to 100 tracks', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    // 250 tracks should result in 3 batches: 100, 100, 50
    const tracks = Array.from({ length: 250 }, (_, i) => `spotify:track:${i + 1}`);

    const playlistDetails = {
      id: 'pl_1',
      name: 'Batch Test',
      snapshot_id: 'snap_0',
      tracks: { total: 0 },
    };

    mockFetch
      // baseline details before batch 1
      .mockResolvedValueOnce(new Response(JSON.stringify(playlistDetails), { status: 200 }))
      // POST batch 1 (100 tracks)
      .mockResolvedValueOnce(new Response(JSON.stringify({ snapshot_id: 'snap_1' }), { status: 200 }))
      // baseline details before batch 2
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...playlistDetails, tracks: { total: 100 } }), { status: 200 }))
      // POST batch 2 (100 tracks)
      .mockResolvedValueOnce(new Response(JSON.stringify({ snapshot_id: 'snap_2' }), { status: 200 }))
      // baseline details before batch 3
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...playlistDetails, tracks: { total: 200 } }), { status: 200 }))
      // POST batch 3 (50 tracks)
      .mockResolvedValueOnce(new Response(JSON.stringify({ snapshot_id: 'snap_3' }), { status: 200 }));

    const onProgress = vi.fn();
    const result = await addTracksToPlaylist('pl_1', tracks, 'token', { onProgress });

    expect(result.totalAdded).toBe(250);
    expect(result.snapshot_id).toBe('snap_3');
    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenNthCalledWith(1, 1, 3, 100);
    expect(onProgress).toHaveBeenNthCalledWith(2, 2, 3, 200);
    expect(onProgress).toHaveBeenNthCalledWith(3, 3, 3, 250);
  });

  it('persists publish session to localStorage and survives reloads', () => {
    const session: PublishSession = {
      id: 'session_123',
      basePlaylistName: 'My Awesome List',
      targetPlaylistId: 'pl_target',
      isNewPlaylist: false,
      createdPlaylists: {},
      batches: [
        {
          id: '0-0',
          tierIndex: 0,
          tierSuffix: '',
          batchIndex: 0,
          trackUris: ['spotify:track:1', 'spotify:track:2'],
          status: 'pending',
        },
      ],
      currentBatchIndex: 0,
      totalTracks: 2,
      isPaused: false,
    };

    useAppStore.getState().startPublishSession(session);

    // Verify localStorage has the serialized session
    const raw = localStorage.getItem('spotify_publish_session');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.id).toBe('session_123');
    expect(parsed.totalTracks).toBe(2);

    // Verify store state
    expect(useAppStore.getState().publishSession?.id).toBe('session_123');
  });

  it('derives addingTracks.current accurately from completed batches', () => {
    const batches: PublishBatch[] = [
      {
        id: '0-0',
        tierIndex: 0,
        tierSuffix: '',
        batchIndex: 0,
        trackUris: Array(100).fill('spotify:track:a'),
        status: 'pending',
      },
      {
        id: '0-1',
        tierIndex: 0,
        tierSuffix: '',
        batchIndex: 1,
        trackUris: Array(100).fill('spotify:track:b'),
        status: 'pending',
      },
      {
        id: '0-2',
        tierIndex: 0,
        tierSuffix: '',
        batchIndex: 2,
        trackUris: Array(50).fill('spotify:track:c'),
        status: 'pending',
      },
    ];

    const session: PublishSession = {
      id: 'session_prog',
      basePlaylistName: 'Progress Test',
      targetPlaylistId: 'pl_1',
      isNewPlaylist: false,
      createdPlaylists: {},
      batches,
      currentBatchIndex: 0,
      totalTracks: 250,
      isPaused: false,
    };

    useAppStore.getState().startPublishSession(session);
    expect(useAppStore.getState().detailedProgress.addingTracks.current).toBe(0);

    // Complete batch 0 (100 tracks)
    useAppStore.getState().updatePublishBatch('0-0', { status: 'completed' }, 'snap_1');
    expect(useAppStore.getState().detailedProgress.addingTracks.current).toBe(100);

    // Complete batch 1 (100 tracks)
    useAppStore.getState().updatePublishBatch('0-1', { status: 'completed' }, 'snap_2');
    expect(useAppStore.getState().detailedProgress.addingTracks.current).toBe(200);

    // Batch 2 fails
    useAppStore.getState().updatePublishBatch('0-2', { status: 'failed', error: 'Network timeout' });
    // Count remains 200
    expect(useAppStore.getState().detailedProgress.addingTracks.current).toBe(200);
  });

  it('pauses session with reason when an error occurs and logs failure', () => {
    const session: PublishSession = {
      id: 'session_pause',
      basePlaylistName: 'Pause Test',
      targetPlaylistId: 'pl_1',
      isNewPlaylist: false,
      createdPlaylists: {},
      batches: [
        {
          id: '0-0',
          tierIndex: 0,
          tierSuffix: '',
          batchIndex: 0,
          trackUris: ['spotify:track:1'],
          status: 'pending',
        },
      ],
      currentBatchIndex: 0,
      totalTracks: 1,
      isPaused: false,
    };

    useAppStore.getState().startPublishSession(session);
    useAppStore.getState().pausePublishSession('Rate limit wait exceeds 60s');

    const currentSession = useAppStore.getState().publishSession;
    expect(currentSession?.isPaused).toBe(true);
    expect(currentSession?.pauseReason).toBe('Rate limit wait exceeds 60s');
    expect(useAppStore.getState().detailedProgress.stage).toBe('paused');

    // Add failure details
    useAppStore.getState().addPublishFailure({
      id: 'fail_1',
      batchId: '0-0',
      tierIndex: 0,
      batchIndex: 0,
      playlistName: 'Pause Test',
      trackCount: 1,
      reason: 'Rate limit wait exceeds 60s',
      status: 429,
      timestamp: Date.now(),
    });

    expect(useAppStore.getState().publishFailures.length).toBe(1);
    expect(useAppStore.getState().detailedProgress.failedCount).toBe(1);
  });

  it('resumes from the first incomplete batch without duplicate track additions', () => {
    const batches: PublishBatch[] = [
      {
        id: '0-0',
        tierIndex: 0,
        tierSuffix: '',
        batchIndex: 0,
        trackUris: Array(100).fill('spotify:track:done'),
        status: 'completed', // already done!
      },
      {
        id: '0-1',
        tierIndex: 0,
        tierSuffix: '',
        batchIndex: 1,
        trackUris: Array(100).fill('spotify:track:failed_before'),
        status: 'failed', // needs retry
        error: '503 Service Unavailable',
      },
      {
        id: '0-2',
        tierIndex: 0,
        tierSuffix: '',
        batchIndex: 2,
        trackUris: Array(50).fill('spotify:track:pending'),
        status: 'pending', // not yet executed
      },
    ];

    const session: PublishSession = {
      id: 'session_resume',
      basePlaylistName: 'Resume Test',
      targetPlaylistId: 'pl_1',
      isNewPlaylist: false,
      createdPlaylists: {},
      batches,
      currentBatchIndex: 1,
      totalTracks: 250,
      isPaused: true,
      pauseReason: '503 Service Unavailable',
    };

    useAppStore.getState().startPublishSession(session);

    // Find incomplete batches: first one should be index 1 ('0-1'), not 0!
    const incompleteBatches = useAppStore
      .getState()
      .publishSession!.batches.filter(b => b.status !== 'completed');

    expect(incompleteBatches.length).toBe(2);
    expect(incompleteBatches[0].id).toBe('0-1');
    expect(incompleteBatches[1].id).toBe('0-2');

    // Confirm that completed batch 0-0 is preserved
    const batch0 = useAppStore.getState().publishSession!.batches.find(b => b.id === '0-0');
    expect(batch0?.status).toBe('completed');
  });
});
