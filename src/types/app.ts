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
}

export interface SimplifiedAlbum {
  id: string;
  name: string;
  release_date?: string;
  images: { url: string; height?: number | null; width?: number | null }[];
  artists: { id: string; name: string }[];
  matchScore?: number;
  popularity?: number;
}

export interface MatchedAlbum {
  status: 'found';
  artist: string;
  album: SimplifiedAlbum;
  candidates: SimplifiedAlbum[];
  trackUris: string[];
  trackObjects: TrackObject[];
  selected?: boolean;
}

export interface FailedAlbum {
  status: 'not_found' | 'error' | 'skipped' | 'cancelled';
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
