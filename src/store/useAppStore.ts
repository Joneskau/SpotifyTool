import { create } from 'zustand';
import {
  UserProfile,
  SimplifiedPlaylist,
  MatchedAlbum,
  FailedAlbum,
  TieringOptions,
  StatusLogMessage,
  ToastMessage,
  DetailedProgress,
  PublishBatch,
  PublishSession,
  PublishFailure,
  TargetPlaylistMode,
  StatusMetrics,
  EventLogItem,
} from '../types/app';
import { ActionableFeedback } from '../utils/errorFeedback';
import { calculatePlaylistTiers } from '../utils/tiering';
import { getPlayabilityWarning } from '../utils/matchReview';

const INITIAL_DETAILED_PROGRESS: DetailedProgress = {
  stage: 'idle',
  searching: { current: 0, total: 0 },
  matching: { current: 0, total: 0 },
  addingTracks: { current: 0, total: 0 },
  failedCount: 0,
  currentItem: '',
  startTime: null,
  statusMessage: '',
};

const getInitialPublishSession = (): PublishSession | null => {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem('spotify_publish_session');
    if (!raw) return null;
    return JSON.parse(raw) as PublishSession;
  } catch {
    return null;
  }
};

const persistPublishSession = (session: PublishSession | null) => {
  try {
    if (typeof localStorage === 'undefined') return;
    if (session) {
      localStorage.setItem('spotify_publish_session', JSON.stringify(session));
    } else {
      localStorage.removeItem('spotify_publish_session');
    }
  } catch (err) {
    console.warn('Failed to persist publish session:', err);
  }
};

interface AppState {
  // Auth & Profile
  accessToken: string | null;
  userProfile: UserProfile | null;
  tokenExpiresAt: number | null;
  storageType: 'local' | 'session';
  isSessionExpiredModalOpen: boolean;
  setAccessToken: (token: string | null) => void;
  setUserProfile: (profile: UserProfile | null) => void;
  setTokenExpiresAt: (expiresAt: number | null) => void;
  setStorageType: (type: 'local' | 'session') => void;
  setIsSessionExpiredModalOpen: (open: boolean) => void;

  // Playlists
  playlists: SimplifiedPlaylist[];
  targetPlaylistMode: TargetPlaylistMode;
  selectedPlaylistId: string;
  selectedExistingPlaylistId: string;
  newPlaylistName: string;
  newPlaylistDescription: string;
  newPlaylistIsPublic: boolean;
  newPlaylistCoverImage: { base64: string; dataUrl: string } | null;
  isLoadingPlaylists: boolean;
  duplicateCheckStatus: 'idle' | 'checking' | 'success' | 'error';
  duplicateCheckProgress: { current: number; total: number };
  playlistTrackCache: Map<string, Set<string>>;

  setPlaylists: (playlists: SimplifiedPlaylist[]) => void;
  setTargetPlaylistMode: (mode: TargetPlaylistMode) => void;
  setSelectedPlaylistId: (id: string) => void;
  setSelectedExistingPlaylistId: (id: string) => void;
  setNewPlaylistName: (name: string) => void;
  setNewPlaylistDescription: (description: string) => void;
  setNewPlaylistIsPublic: (isPublic: boolean) => void;
  setNewPlaylistCoverImage: (cover: { base64: string; dataUrl: string } | null) => void;
  setIsLoadingPlaylists: (loading: boolean) => void;
  setDuplicateCheckStatus: (status: 'idle' | 'checking' | 'success' | 'error') => void;
  setDuplicateCheckProgress: (progress: { current: number; total: number }) => void;
  cachePlaylistTracks: (key: string, tracks: Set<string>) => void;

  // Album Input
  albumListText: string;
  setAlbumListText: (text: string) => void;

  // Processing & Progress
  isProcessing: boolean;
  isCancelled: boolean;
  progress: {
    current: number;
    total: number;
    currentItem: string;
    startTime: number | null;
  };
  detailedProgress: DetailedProgress;
  setIsProcessing: (processing: boolean) => void;
  setIsCancelled: (cancelled: boolean) => void;
  setProgress: (current: number, total: number, currentItem?: string) => void;
  setDetailedProgress: (partial: Partial<DetailedProgress>) => void;
  resetProgress: () => void;
  resetDetailedProgress: () => void;

  // Resumable Publish Session
  publishSession: PublishSession | null;
  publishFailures: PublishFailure[];
  setPublishSession: (session: PublishSession | null) => void;
  startPublishSession: (session: PublishSession) => void;
  updatePublishBatch: (
    batchId: string,
    update: Partial<PublishBatch>,
    snapshotId?: string
  ) => void;
  pausePublishSession: (reason: string) => void;
  clearPublishSession: () => void;
  addPublishFailure: (failure: PublishFailure) => void;
  clearPublishFailures: () => void;

  // Review & Confirmation
  matchedAlbums: MatchedAlbum[];
  failedAlbums: FailedAlbum[];
  existingTrackUris: Set<string>;
  isGridView: boolean;
  setMatchedAlbums: (albums: MatchedAlbum[]) => void;
  updateMatchedAlbum: (index: number, updated: Partial<MatchedAlbum>) => void;
  reorderMatchedAlbums: (fromIndex: number, toIndex: number) => void;
  toggleAlbumSelection: (index: number) => void;
  setFailedAlbums: (failed: FailedAlbum[]) => void;
  removeFailedAlbum: (index: number) => void;
  clearFailedAlbums: () => void;
  setExistingTrackUris: (uris: Set<string>) => void;
  setIsGridView: (grid: boolean) => void;

  // Tiering
  tierOptions: TieringOptions;
  setTierOptions: (options: Partial<TieringOptions>) => void;

  // Status & Notifications
  statusLogs: StatusLogMessage[];
  toasts: ToastMessage[];
  sessionError: ActionableFeedback | null;
  eventLogs: EventLogItem[];
  setSessionError: (error: ActionableFeedback | null) => void;
  addEventLog: (log: Omit<EventLogItem, 'id' | 'timestamp'>) => void;
  clearEventLogs: () => void;
  addStatusLog: (text: string, type: 'info' | 'success' | 'error') => void;
  clearStatusLogs: () => void;
  addToast: (message: string, type?: 'info' | 'success' | 'error', duration?: number) => void;
  removeToast: (id: string) => void;

  // Flow resets
  resetToSearch: () => void;
}


export const useAppStore = create<AppState>((set, get) => ({
  // Auth
  accessToken: null,
  userProfile: null,
  tokenExpiresAt: null,
  storageType:
    (typeof localStorage !== 'undefined'
      ? (localStorage.getItem('spotify_storage_type') as 'local' | 'session')
      : 'local') || 'local',
  isSessionExpiredModalOpen: false,
  setAccessToken: token => set({ accessToken: token }),
  setUserProfile: profile => set({ userProfile: profile }),
  setTokenExpiresAt: expiresAt => set({ tokenExpiresAt: expiresAt }),
  setStorageType: type => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('spotify_storage_type', type);
    }
    set({ storageType: type });
  },
  setIsSessionExpiredModalOpen: open => set({ isSessionExpiredModalOpen: open }),

  // Playlists
  playlists: [],
  targetPlaylistMode:
    typeof localStorage !== 'undefined' && localStorage.getItem('spotify_last_playlist') === 'NEW'
      ? 'new'
      : typeof localStorage !== 'undefined' && localStorage.getItem('spotify_last_playlist')
      ? 'existing'
      : 'new',
  selectedPlaylistId:
    (typeof localStorage !== 'undefined'
      ? localStorage.getItem('spotify_last_playlist')
      : 'NEW') || 'NEW',
  selectedExistingPlaylistId:
    (typeof localStorage !== 'undefined' && localStorage.getItem('spotify_last_playlist') !== 'NEW'
      ? localStorage.getItem('spotify_last_playlist')
      : '') || '',
  newPlaylistName: '',
  newPlaylistDescription: '',
  newPlaylistIsPublic: false,
  newPlaylistCoverImage: null,
  isLoadingPlaylists: false,
  duplicateCheckStatus: 'idle',
  duplicateCheckProgress: { current: 0, total: 0 },
  playlistTrackCache: new Map(),

  setPlaylists: playlists => set({ playlists }),
  setTargetPlaylistMode: mode => {
    const id = mode === 'new' ? 'NEW' : get().selectedExistingPlaylistId;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('spotify_last_playlist', id);
    }
    set({
      targetPlaylistMode: mode,
      selectedPlaylistId: id,
    });
  },
  setSelectedPlaylistId: id => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('spotify_last_playlist', id);
    }
    if (id === 'NEW') {
      set({
        selectedPlaylistId: 'NEW',
        targetPlaylistMode: 'new',
      });
    } else {
      set({
        selectedPlaylistId: id,
        selectedExistingPlaylistId: id,
        targetPlaylistMode: 'existing',
      });
    }
  },
  setSelectedExistingPlaylistId: id => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('spotify_last_playlist', id);
    }
    set({
      selectedExistingPlaylistId: id,
      selectedPlaylistId: id,
      targetPlaylistMode: 'existing',
    });
  },
  setNewPlaylistName: name => set({ newPlaylistName: name }),
  setNewPlaylistDescription: description => set({ newPlaylistDescription: description }),
  setNewPlaylistIsPublic: isPublic => set({ newPlaylistIsPublic: isPublic }),
  setNewPlaylistCoverImage: cover => set({ newPlaylistCoverImage: cover }),
  setIsLoadingPlaylists: loading => set({ isLoadingPlaylists: loading }),
  setDuplicateCheckStatus: status => set({ duplicateCheckStatus: status }),
  setDuplicateCheckProgress: progress => set({ duplicateCheckProgress: progress }),
  cachePlaylistTracks: (key, tracks) =>
    set(state => {
      const nextCache = new Map(state.playlistTrackCache);
      nextCache.set(key, tracks);
      return { playlistTrackCache: nextCache };
    }),

  // Album Input
  albumListText:
    (typeof localStorage !== 'undefined'
      ? localStorage.getItem('spotify_album_list')
      : '') || '',
  setAlbumListText: text => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('spotify_album_list', text);
    }
    set({ albumListText: text });
  },

  // Processing & Progress
  isProcessing: false,
  isCancelled: false,
  progress: {
    current: 0,
    total: 0,
    currentItem: '',
    startTime: null,
  },
  detailedProgress: INITIAL_DETAILED_PROGRESS,
  setIsProcessing: processing =>
    set({
      isProcessing: processing,
      progress: processing
        ? { current: 0, total: 0, currentItem: '', startTime: Date.now() }
        : get().progress,
      detailedProgress: processing
        ? {
            ...INITIAL_DETAILED_PROGRESS,
            stage: 'searching',
            startTime: Date.now(),
          }
        : get().detailedProgress,
    }),
  setIsCancelled: cancelled => set({ isCancelled: cancelled }),
  setProgress: (current, total, currentItem = '') =>
    set(state => ({
      progress: {
        ...state.progress,
        current,
        total,
        currentItem,
        startTime: state.progress.startTime || Date.now(),
      },
    })),
  setDetailedProgress: partial =>
    set(state => ({
      detailedProgress: {
        ...state.detailedProgress,
        ...partial,
      },
    })),
  resetProgress: () =>
    set({
      progress: { current: 0, total: 0, currentItem: '', startTime: null },
    }),
  resetDetailedProgress: () =>
    set({
      detailedProgress: { ...INITIAL_DETAILED_PROGRESS, startTime: Date.now() },
    }),

  // Resumable Publish Session
  publishSession: getInitialPublishSession(),
  publishFailures: [],
  setPublishSession: session => {
    persistPublishSession(session);
    set({ publishSession: session });
  },
  startPublishSession: session => {
    persistPublishSession(session);
    set(state => ({
      publishSession: session,
      publishFailures: [],
      detailedProgress: {
        ...state.detailedProgress,
        stage: 'publishing',
        addingTracks: {
          current: 0,
          total: session.totalTracks,
        },
        statusMessage: 'Starting publishing...',
      },
    }));
  },
  updatePublishBatch: (batchId, update, snapshotId) => {
    set(state => {
      if (!state.publishSession) return state;
      const batches = state.publishSession.batches.map(b =>
        b.id === batchId ? { ...b, ...update } : b
      );
      const updatedSession: PublishSession = {
        ...state.publishSession,
        batches,
        lastSnapshotId: snapshotId || state.publishSession.lastSnapshotId,
      };
      persistPublishSession(updatedSession);

      // Derive tracks added directly from completed batches
      const tracksAdded = batches
        .filter(b => b.status === 'completed')
        .reduce((sum, b) => sum + b.trackUris.length, 0);

      const nextDetailed: DetailedProgress = {
        ...state.detailedProgress,
        addingTracks: {
          current: tracksAdded,
          total: updatedSession.totalTracks,
        },
      };

      return {
        publishSession: updatedSession,
        detailedProgress: nextDetailed,
      };
    });
  },
  pausePublishSession: reason => {
    set(state => {
      if (!state.publishSession) return state;
      const updatedSession: PublishSession = {
        ...state.publishSession,
        isPaused: true,
        pauseReason: reason,
      };
      persistPublishSession(updatedSession);
      return {
        publishSession: updatedSession,
        detailedProgress: {
          ...state.detailedProgress,
          stage: 'paused',
          statusMessage: reason,
        },
      };
    });
  },
  clearPublishSession: () => {
    persistPublishSession(null);
    set({
      publishSession: null,
      publishFailures: [],
      detailedProgress: { ...INITIAL_DETAILED_PROGRESS },
    });
  },
  addPublishFailure: failure => {
    set(state => ({
      publishFailures: [...state.publishFailures, failure],
      detailedProgress: {
        ...state.detailedProgress,
        failedCount: state.detailedProgress.failedCount + 1,
      },
    }));
  },
  clearPublishFailures: () => set({ publishFailures: [] }),


  // Review & Confirmation
  matchedAlbums: [],
  failedAlbums: [],
  existingTrackUris: new Set(),
  isGridView: false,
  setMatchedAlbums: albums => set({ matchedAlbums: albums }),
  updateMatchedAlbum: (index, updated) =>
    set(state => {
      const next = [...state.matchedAlbums];
      if (next[index]) {
        next[index] = { ...next[index], ...updated };
      }
      return { matchedAlbums: next };
    }),
  reorderMatchedAlbums: (fromIndex, toIndex) =>
    set(state => {
      const list = [...state.matchedAlbums];
      const [moved] = list.splice(fromIndex, 1);
      list.splice(toIndex, 0, moved);
      return { matchedAlbums: list };
    }),
  toggleAlbumSelection: index =>
    set(state => {
      const list = [...state.matchedAlbums];
      if (list[index]) {
        list[index] = {
          ...list[index],
          selected: list[index].selected === undefined ? false : !list[index].selected,
        };
      }
      return { matchedAlbums: list };
    }),
  setFailedAlbums: failed => set({ failedAlbums: failed }),
  removeFailedAlbum: index =>
    set(state => {
      const list = [...state.failedAlbums];
      list.splice(index, 1);
      return { failedAlbums: list };
    }),
  clearFailedAlbums: () => set({ failedAlbums: [] }),
  setExistingTrackUris: uris => set({ existingTrackUris: uris }),
  setIsGridView: isGridView => set({ isGridView }),

  // Tiering Options
  tierOptions: {
    strategy: 'halving',
    param: 3,
    maxPlaylists: 10,
    maxTracks: 0,
    mode: 'single',
  },
  setTierOptions: options =>
    set(state => ({
      tierOptions: { ...state.tierOptions, ...options },
    })),

  // Status & Logs
  statusLogs: [],
  toasts: [],
  sessionError: null,
  eventLogs: [],
  setSessionError: error => set({ sessionError: error }),
  addEventLog: log => {
    const item: EventLogItem = {
      id: Math.random().toString(36).slice(2),
      timestamp: Date.now(),
      ...log,
    };
    set(state => ({
      eventLogs: [item, ...state.eventLogs.slice(0, 99)], // keep last 100 events
    }));
  },
  clearEventLogs: () => set({ eventLogs: [] }),
  addStatusLog: (text, type) =>
    set(state => ({
      statusLogs: [
        ...state.statusLogs,
        { id: Math.random().toString(36).slice(2), text, type, timestamp: Date.now() },
      ],
    })),
  clearStatusLogs: () => set({ statusLogs: [] }),
  addToast: (message, type = 'info', duration = 5000) => {
    const id = Math.random().toString(36).slice(2);
    set(state => ({
      toasts: [...state.toasts, { id, message, type, duration }],
    }));
    setTimeout(() => {
      get().removeToast(id);
    }, duration);
  },
  removeToast: id =>
    set(state => ({
      toasts: state.toasts.filter(t => t.id !== id),
    })),

  // Reset
  resetToSearch: () => {
    persistPublishSession(null);
    set({
      matchedAlbums: [],
      failedAlbums: [],
      isProcessing: false,
      isCancelled: false,
      publishSession: null,
      publishFailures: [],
      detailedProgress: { ...INITIAL_DETAILED_PROGRESS },
      sessionError: null,
    });
  },
}));

/**
 * Single source of truth selector for all Status Center metrics.
 * Mathematical guarantee: tracksReady exactly equals calculatePlaylistTiers track output.
 */
export function selectStatusMetrics(state: AppState): StatusMetrics {
  const totalAlbums = state.albumListText
    .split('\n')
    .filter(line => line.trim().length > 0).length;

  let processingStatus: 'idle' | 'processing' | 'completed' = 'idle';
  let processedCount = 0;

  if (
    state.isProcessing ||
    state.detailedProgress.stage === 'searching' ||
    state.detailedProgress.stage === 'matching'
  ) {
    processingStatus = 'processing';
    processedCount = state.detailedProgress.searching.current || state.progress.current || 0;
  } else if (state.matchedAlbums.length > 0 || state.failedAlbums.length > 0) {
    processingStatus = 'completed';
    processedCount = state.matchedAlbums.length + state.failedAlbums.length;
  } else {
    processingStatus = 'idle';
    processedCount = 0;
  }

  const albumWord = totalAlbums === 1 ? 'album' : 'albums';
  let processingText = `Ready: 0 / ${totalAlbums} ${albumWord}`;
  if (processingStatus === 'processing') {
    processingText = `Processing: ${processedCount} / ${totalAlbums} ${albumWord}`;
  } else if (processingStatus === 'completed') {
    processingText = `Processed: ${processedCount} / ${totalAlbums} ${albumWord}`;
  }

  // Warnings breakdown (no double-counting with duplicate tracks)
  let marketRestricted = 0;
  let lowConfidence = 0;
  let duplicateInputLine = 0;

  state.matchedAlbums.forEach((item, idx) => {
    if (getPlayabilityWarning(item.trackObjects) !== null) {
      marketRestricted++;
    }
    if ((item.confidence ?? 0) < 0.5 && item.matchSource !== 'manual') {
      lowConfidence++;
    }
    const isDupLine = state.matchedAlbums.some(
      (other, oIdx) => oIdx !== idx && other.album?.id === item.album?.id
    );
    if (isDupLine) {
      duplicateInputLine++;
    }
  });

  const totalWarnings = marketRestricted + lowConfidence + duplicateInputLine;

  // Errors breakdown
  let notFound = 0;
  let searchFailed = 0;
  let skippedInvalid = 0;

  state.failedAlbums.forEach(f => {
    if (f.status === 'not_found') notFound++;
    else if (f.status === 'search_failed' || f.status === 'error') searchFailed++;
    else if (f.status === 'skipped') skippedInvalid++;
  });

  const batchFailures = state.publishFailures.length;
  const totalErrors = notFound + searchFailed + skippedInvalid + batchFailures;

  // Duplicates & Tracks Ready
  const selectedAlbums = state.matchedAlbums.filter(a => a.selected !== false);
  const totalTrackInstances = selectedAlbums.reduce(
    (sum, a) => sum + (a.trackUris?.length || 0),
    0
  );

  const uniqueTracksToPlan = new Set<string>();
  selectedAlbums.forEach(a => {
    a.trackUris?.forEach(uri => {
      if (!state.existingTrackUris.has(uri)) {
        uniqueTracksToPlan.add(uri);
      }
    });
  });

  const duplicatesCount = Math.max(0, totalTrackInstances - uniqueTracksToPlan.size);
  const isPostPublish = Boolean(
    state.publishSession &&
      state.publishSession.batches.some(b => b.status === 'completed')
  );
  const duplicatesLabel = isPostPublish ? 'Duplicates skipped' : 'Duplicates to skip';

  // Calculate tiers for exact track ready count (same algorithm as publishing)
  const tiers = calculatePlaylistTiers(
    selectedAlbums,
    state.tierOptions,
    state.existingTrackUris
  );
  const totalTracksReady = tiers.reduce((sum, t) => sum + t.tracks.length, 0);

  let addedTracks: number | undefined;
  let remainingTracks: number | undefined;

  if (state.publishSession) {
    const completedBatches = state.publishSession.batches.filter(b => b.status === 'completed');
    addedTracks = completedBatches.reduce((sum, b) => sum + b.trackUris.length, 0);
    remainingTracks = Math.max(0, totalTracksReady - addedTracks);
  }

  return {
    processing: {
      status: processingStatus,
      current: processedCount,
      total: totalAlbums,
      text: processingText,
    },
    warnings: {
      total: totalWarnings,
      breakdown: {
        marketRestricted,
        lowConfidence,
        duplicateInputLine,
      },
    },
    errors: {
      total: totalErrors,
      breakdown: {
        notFound,
        searchFailed,
        skippedInvalid,
        batchFailures,
      },
    },
    duplicates: {
      count: duplicatesCount,
      isPostPublish,
      label: duplicatesLabel,
      text: `${duplicatesLabel}: ${duplicatesCount}`,
    },
    tracksReady: {
      total: totalTracksReady,
      added: addedTracks,
      remaining: remainingTracks,
      text: `Tracks ready: ${totalTracksReady}`,
    },
  };
}
