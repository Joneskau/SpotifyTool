import { create } from 'zustand';
import {
  UserProfile,
  SimplifiedPlaylist,
  MatchedAlbum,
  FailedAlbum,
  TieringOptions,
  StatusLogMessage,
  ToastMessage,
} from '../types/app';

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
  selectedPlaylistId: string;
  newPlaylistName: string;
  isLoadingPlaylists: boolean;
  setPlaylists: (playlists: SimplifiedPlaylist[]) => void;
  setSelectedPlaylistId: (id: string) => void;
  setNewPlaylistName: (name: string) => void;
  setIsLoadingPlaylists: (loading: boolean) => void;

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
  setIsProcessing: (processing: boolean) => void;
  setIsCancelled: (cancelled: boolean) => void;
  setProgress: (current: number, total: number, currentItem?: string) => void;
  resetProgress: () => void;

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
  storageType: (localStorage.getItem('spotify_storage_type') as 'local' | 'session') || 'local',
  isSessionExpiredModalOpen: false,
  setAccessToken: token => set({ accessToken: token }),
  setUserProfile: profile => set({ userProfile: profile }),
  setTokenExpiresAt: expiresAt => set({ tokenExpiresAt: expiresAt }),
  setStorageType: type => {
    localStorage.setItem('spotify_storage_type', type);
    set({ storageType: type });
  },
  setIsSessionExpiredModalOpen: open => set({ isSessionExpiredModalOpen: open }),

  // Playlists
  playlists: [],
  selectedPlaylistId: localStorage.getItem('spotify_last_playlist') || '',
  newPlaylistName: '',
  isLoadingPlaylists: false,
  setPlaylists: playlists => set({ playlists }),
  setSelectedPlaylistId: id => {
    localStorage.setItem('spotify_last_playlist', id);
    set({ selectedPlaylistId: id });
  },
  setNewPlaylistName: name => set({ newPlaylistName: name }),
  setIsLoadingPlaylists: loading => set({ isLoadingPlaylists: loading }),

  // Album Input
  albumListText: localStorage.getItem('spotify_album_list') || '',
  setAlbumListText: text => {
    localStorage.setItem('spotify_album_list', text);
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
  setIsProcessing: processing =>
    set({
      isProcessing: processing,
      progress: processing
        ? { current: 0, total: 0, currentItem: '', startTime: Date.now() }
        : get().progress,
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
  resetProgress: () =>
    set({
      progress: { current: 0, total: 0, currentItem: '', startTime: null },
    }),

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
  resetToSearch: () =>
    set({
      matchedAlbums: [],
      failedAlbums: [],
      isProcessing: false,
      isCancelled: false,
    }),
}));
