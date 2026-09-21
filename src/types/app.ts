export type TierStrategy = 'halving' | 'partitioning' | 'top_n' | 'time_bounded';

export interface TieringOptions {
  strategy: TierStrategy;
  param: number; // e.g. Top N, or target minutes
  maxPlaylists: number;
  maxTracks: number;
  mode: 'single' | 'multi'; // For top_n
}

export interface TrackObject {
  id: string;
  name: string;
  uri: string;
  duration_ms: number;
  popularity?: number;
  track_number?: number;
  explicit?: boolean;
  is_playable?: boolean;
  restrictions?: { reason?: string };
}

export interface SimplifiedAlbum {
  id: string;
  name: string;
  release_date?: string;
  images: { url: string; height?: number | null; width?: number | null }[];
  artists: { id: string; name: string }[];
  matchScore?: number;
  popularity?: number;
  album_type?: 'album' | 'single' | 'compilation';
  total_tracks?: number;
  restrictions?: { reason?: string };
}

export type ScoredCandidate = SimplifiedAlbum & {
  matchScore?: number;
};

export interface MatchedAlbum {
  status: 'found';
  originalInput: string;
  artist: string;
  album: SimplifiedAlbum;
  candidates: ScoredCandidate[];
  trackUris: string[];
  trackObjects: TrackObject[];
  selected?: boolean;
  confidence: number;
  matchSource?: 'auto' | 'manual';
  originalAutoMatch?: {
    album: SimplifiedAlbum;
    candidates: ScoredCandidate[];
    trackUris: string[];
    trackObjects: TrackObject[];
    confidence: number;
  };
}

export interface FailedAlbum {
  status: 'not_found' | 'search_failed' | 'error' | 'skipped' | 'cancelled';
  line: string;
  artist: string;
  albumName: string;
  reason: string;
  partialMatches?: SimplifiedAlbum[];
}

export interface GeneratedTier {
  tracks: string[];
  nameSuffix: string;
}

export interface UserProfile {
  id: string;
  display_name: string;
  images?: { url: string }[];
}

export interface SimplifiedPlaylist {
  id: string;
  name: string;
  images?: { url: string }[];
  tracks: { total: number };
  owner?: { id: string; display_name?: string | null };
  public?: boolean | null;
  collaborative?: boolean | null;
  snapshot_id?: string;
  description?: string | null;
}

export type TargetPlaylistMode = 'new' | 'existing';

export interface NewPlaylistOptions {
  name: string;
  description: string;
  isPublic: boolean;
  coverImageBase64?: string | null;
  coverStatus?: 'pending' | 'uploaded' | 'failed' | 'skipped';
}

export interface StatusLogMessage {
  id: string;
  text: string;
  type: 'info' | 'success' | 'error';
  timestamp: number;
}

export interface ToastMessage {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
  duration?: number;
}

export type ProgressStage = 'idle' | 'searching' | 'matching' | 'publishing' | 'paused' | 'completed' | 'failed';

export interface DetailedProgress {
  stage: ProgressStage;
  searching: { current: number; total: number };
  matching: { current: number; total: number };
  addingTracks: { current: number; total: number };
  failedCount: number;
  currentItem?: string;
  startTime: number | null;
  statusMessage?: string;
}

export interface PublishBatch {
  id: string;
  tierIndex: number;
  tierSuffix: string;
  batchIndex: number;
  trackUris: string[];
  trackNames?: string[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  error?: string;
  targetPlaylistId?: string;
}

export interface PublishSession {
  id: string;
  basePlaylistName: string;
  targetPlaylistId: string;
  isNewPlaylist: boolean;
  newPlaylistOptions?: NewPlaylistOptions;
  createdPlaylists: Record<number, { id: string; name: string }>;
  batches: PublishBatch[];
  currentBatchIndex: number;
  totalTracks: number;
  lastSnapshotId?: string;
  isPaused: boolean;
  pauseReason?: string;
  overflowPlaylistCreated?: boolean;
}

export interface PublishFailure {
  id: string;
  batchId: string;
  tierIndex: number;
  batchIndex: number;
  playlistName: string;
  trackCount: number;
  trackNames?: string[];
  reason: string;
  status?: number;
  timestamp: number;
}

export interface StatusMetrics {
  processing: {
    status: 'idle' | 'processing' | 'completed';
    current: number;
    total: number;
    text: string;
  };
  warnings: {
    total: number;
    breakdown: {
      marketRestricted: number;
      lowConfidence: number;
      duplicateInputLine: number;
    };
  };
  errors: {
    total: number;
    breakdown: {
      notFound: number;
      searchFailed: number;
      skippedInvalid: number;
      batchFailures: number;
    };
  };
  duplicates: {
    count: number;
    isPostPublish: boolean;
    label: string; // 'Duplicates to skip' or 'Duplicates skipped'
    text: string;
  };
  tracksReady: {
    total: number;
    added?: number;
    remaining?: number;
    text: string;
  };
}

export interface EventLogItem {
  id: string;
  timestamp: number;
  severity: 'info' | 'warning' | 'error' | 'success';
  itemLabel?: string;
  message: string;
  actionLabel?: string;
  actionPayload?: unknown;
}

export interface SessionLevelError {
  kind: string;
  title: string;
  detail: string;
  actionLabel?: string;
  actionType?: 'reconnect' | 'reauthorize_scope' | 'resume' | 'dismiss';
}

