import React, { useEffect, useState } from 'react';
import { useAppStore } from './store/useAppStore';
import {
  getStoredValidToken,
  refreshAccessToken,
  exchangeCodeForToken,
  getStoredTokenExpiry,
  restoreSessionSnapshot,
} from './services/spotifyAuth';
import {
  getUserProfile,
  getUserPlaylists,
  getPlaylistTracks,
  getPlaylistDetails,
  searchAlbumWithStrategies,
  getAlbumTracks,
  createNewPlaylist,
  uploadPlaylistCoverImage,
  addTracksBatchWithReconciliation,
} from './services/spotifyApi';
import { asyncPool } from './utils/asyncPool';
import { parseAlbumLine } from './utils/fuzzyMatch';
import { calculatePlaylistTiers } from './utils/tiering';
import {
  MatchedAlbum,
  FailedAlbum,
  TieringOptions,
  PublishBatch,
  PublishSession,
} from './types/app';

import { StatusCenter } from './components/StatusCenter';
import { ManualSearchModal } from './components/ManualSearchModal';
import {
  SPOTIFY_PLAYLIST_TRACK_LIMIT,
  HEADLINE_NOT_FOUND,
  HEADLINE_PLAYLIST_TOO_LARGE,
  formatActionableFeedback,
} from './utils/errorFeedback';
import { SpotifyApiError } from './services/spotifyError';
import { ScoredCandidate } from './types/app';
import { Header } from './components/Header';
import { AuthSection } from './components/AuthSection';
import { PlaylistSelector } from './components/PlaylistSelector';
import { AlbumInput } from './components/AlbumInput';
import { ProgressBanner } from './components/ProgressBanner';
import { ConfirmationList } from './components/ConfirmationList';
import { TieringControls } from './components/TieringControls';
import { TierPreviewCards } from './components/TierPreviewCards';
import { FailureSummary } from './components/FailureSummary';
import { StatusLog } from './components/StatusLog';
import { ToastContainer } from './components/ToastContainer';
import { ReconnectModal } from './components/ReconnectModal';
import { Footer } from './components/Footer';
import { Search, Send, Edit3, Loader2, Play } from 'lucide-react';

export const App: React.FC = () => {
  const {
    accessToken,
    setAccessToken,
    setTokenExpiresAt,
    setStorageType,
    setUserProfile,
    playlists,
    setPlaylists,
    setIsLoadingPlaylists,
    targetPlaylistMode,
    selectedExistingPlaylistId,
    setSelectedPlaylistId,
    newPlaylistName,
    setNewPlaylistName,
    newPlaylistDescription,
    newPlaylistIsPublic,
    newPlaylistCoverImage,
    setDuplicateCheckStatus,
    setDuplicateCheckProgress,
    playlistTrackCache,
    cachePlaylistTracks,
    albumListText,
    setAlbumListText,
    isProcessing,
    setIsProcessing,
    setIsCancelled,
    setProgress,
    resetProgress,
    setDetailedProgress,
    publishSession,
    setPublishSession,
    startPublishSession,
    updatePublishBatch,
    pausePublishSession,
    clearPublishSession,
    addPublishFailure,
    clearPublishFailures,
    matchedAlbums,
    setMatchedAlbums,
    setFailedAlbums,
    existingTrackUris,
    setExistingTrackUris,
    tierOptions,
    setTierOptions,
    addStatusLog,
    addToast,
    removeFailedAlbum,
    setIsSessionExpiredModalOpen,
    resetToSearch,
    setSessionError,
    addEventLog,
  } = useAppStore();

  const [isCommitting, setIsCommitting] = useState(false);
  const [manualSearchState, setManualSearchState] = useState<{
    isOpen: boolean;
    failedIndex?: number;
    query: string;
  }>({ isOpen: false, query: '' });


  // 1. Check for tokens or auth code on mount
  useEffect(() => {
    const handleRestoreSnapshot = () => {
      const snapshot = restoreSessionSnapshot<{
        albumListText?: string;
        matchedAlbums?: MatchedAlbum[];
        selectedPlaylistId?: string;
        newPlaylistName?: string;
        tierOptions?: TieringOptions;
        storageType?: 'local' | 'session';
      }>();

      if (snapshot) {
        if (snapshot.albumListText) setAlbumListText(snapshot.albumListText);
        if (snapshot.matchedAlbums) setMatchedAlbums(snapshot.matchedAlbums);
        if (snapshot.selectedPlaylistId) setSelectedPlaylistId(snapshot.selectedPlaylistId);
        if (snapshot.newPlaylistName) setNewPlaylistName(snapshot.newPlaylistName);
        if (snapshot.tierOptions) setTierOptions(snapshot.tierOptions);
        if (snapshot.storageType) setStorageType(snapshot.storageType);
        addToast('Session restored! Preserved your album list and matches.', 'success');
      }
    };

    const initAuth = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');

      if (code) {
        try {
          addToast('Exchanging authorization code for token...', 'info');
          const token = await exchangeCodeForToken(code);
          setAccessToken(token);
          setTokenExpiresAt(getStoredTokenExpiry());
          handleRestoreSnapshot();
          window.history.replaceState({}, document.title, window.location.pathname);
          return;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Authentication failed';
          addToast(msg, 'error');
        }
      }

      const storedToken = getStoredValidToken();
      if (storedToken) {
        setAccessToken(storedToken);
        setTokenExpiresAt(getStoredTokenExpiry());
      } else {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          setAccessToken(refreshed);
          setTokenExpiresAt(getStoredTokenExpiry());
        }
      }
    };

    initAuth();
  }, [
    setAccessToken,
    setTokenExpiresAt,
    setStorageType,
    setAlbumListText,
    setMatchedAlbums,
    setSelectedPlaylistId,
    setNewPlaylistName,
    setTierOptions,
    addToast,
  ]);

  // 2. Load profile and playlists when token is established
  useEffect(() => {
    if (!accessToken) return;

    const loadData = async () => {
      try {
        const profile = await getUserProfile(accessToken);
        setUserProfile(profile);
      } catch (err) {
        console.error('Failed to load profile:', err);
      }

      try {
        setIsLoadingPlaylists(true);
        const playlists = await getUserPlaylists(accessToken);
        setPlaylists(playlists);
      } catch (err) {
        console.error('Failed to load playlists:', err);
      } finally {
        setIsLoadingPlaylists(false);
      }
    };

    loadData();
  }, [accessToken, setUserProfile, setPlaylists, setIsLoadingPlaylists]);

  // 2b. Reactive target playlist track fetching and duplicate check
  useEffect(() => {
    if (!accessToken || targetPlaylistMode === 'new' || !selectedExistingPlaylistId) {
      setExistingTrackUris(new Set());
      setDuplicateCheckStatus('idle');
      setDuplicateCheckProgress({ current: 0, total: 0 });
      return;
    }

    const playlist = playlists.find(p => p.id === selectedExistingPlaylistId);
    const snapshotId = playlist?.snapshot_id || 'v1';
    const cacheKey = `${selectedExistingPlaylistId}:${snapshotId}`;

    const cached = playlistTrackCache.get(cacheKey);
    if (cached) {
      setExistingTrackUris(cached);
      setDuplicateCheckStatus('success');
      setDuplicateCheckProgress({ current: cached.size, total: cached.size });
      return;
    }

    const abortController = new AbortController();
    setDuplicateCheckStatus('checking');
    setDuplicateCheckProgress({ current: 0, total: playlist?.tracks?.total || 0 });

    getPlaylistTracks(selectedExistingPlaylistId, accessToken, {
      signal: abortController.signal,
      onProgress: (current, total) => {
        setDuplicateCheckProgress({ current, total });
      },
    })
      .then(trackUris => {
        cachePlaylistTracks(cacheKey, trackUris);
        setExistingTrackUris(trackUris);
        setDuplicateCheckStatus('success');
      })
      .catch(err => {
        if (err?.name === 'AbortError' || (err instanceof DOMException && err.name === 'AbortError')) {
          return;
        }
        console.warn('Failed to load playlist tracks:', err);
        setExistingTrackUris(new Set());
        setDuplicateCheckStatus('error');
      });

    return () => {
      abortController.abort();
    };
  }, [
    accessToken,
    targetPlaylistMode,
    selectedExistingPlaylistId,
    playlists,
    playlistTrackCache,
    setExistingTrackUris,
    setDuplicateCheckStatus,
    setDuplicateCheckProgress,
    cachePlaylistTracks,
  ]);

  // 3. Search & Process albums
  const handleProcessAlbums = async () => {
    if (!accessToken) return;

    const lines = albumListText.split('\n').filter((l: string) => l.trim().length > 0);
    if (lines.length === 0) {
      addToast('Please enter at least one album in the editor', 'error');
      return;
    }

    if (targetPlaylistMode === 'new' && !newPlaylistName.trim()) {
      addToast('Please enter a name for the new playlist', 'error');
      return;
    }

    if (targetPlaylistMode === 'existing' && !selectedExistingPlaylistId) {
      addToast('Please select a target playlist', 'error');
      return;
    }

    setIsProcessing(true);
    setIsCancelled(false);
    resetProgress();
    setMatchedAlbums([]);
    setFailedAlbums([]);

    let searchedCount = 0;
    let matchedCount = 0;
    let failedCount = 0;
    const total = lines.length;
    const localMatched: MatchedAlbum[] = [];
    const localFailed: FailedAlbum[] = [];

    setDetailedProgress({
      stage: 'searching',
      searching: { current: 0, total },
      matching: { current: 0, total },
      addingTracks: { current: 0, total: 0 },
      failedCount: 0,
      statusMessage: 'Searching albums on Spotify...',
      startTime: Date.now(),
    });

    const processOne = async (line: string) => {
      if (useAppStore.getState().isCancelled) {
        searchedCount++;
        failedCount++;
        setProgress(searchedCount, total);
        setDetailedProgress({
          searching: { current: searchedCount, total },
          failedCount,
        });
        return {
          status: 'cancelled' as const,
          line,
          artist: '',
          albumName: '',
          reason: 'Cancelled by user',
        };
      }

      const parsed = parseAlbumLine(line);
      if (parsed.error || !parsed.artist || !parsed.albumName) {
        addStatusLog(`⚠️ Skipping invalid line: ${line}`, 'error');
        searchedCount++;
        failedCount++;
        setProgress(searchedCount, total);
        setDetailedProgress({
          searching: { current: searchedCount, total },
          failedCount,
        });
        return {
          status: 'skipped' as const,
          line,
          artist: parsed.artist || '',
          albumName: parsed.albumName || '',
          reason: parsed.error || 'Invalid line format',
        };
      }

      const { artist, albumName } = parsed;

      try {
        const searchResult = await searchAlbumWithStrategies(artist, albumName, accessToken);
        searchedCount++;

        if (!searchResult || searchResult.candidates.length === 0) {
          addStatusLog(`⚠️ Not found: ${artist} - ${albumName}`, 'error');
          addEventLog({
            severity: 'warning',
            itemLabel: `${artist} - ${albumName}`,
            message: HEADLINE_NOT_FOUND,
          });
          failedCount++;
          setProgress(searchedCount, total, `${artist} - ${albumName}`);
          setDetailedProgress({
            searching: { current: searchedCount, total },
            failedCount,
            currentItem: `${artist} - ${albumName}`,
          });
          return {
            status: 'not_found' as const,
            line,
            artist,
            albumName,
            reason: HEADLINE_NOT_FOUND,
          };
        }

        // Matching stage: fetch tracks
        setDetailedProgress({
          stage: 'matching',
          searching: { current: searchedCount, total },
          currentItem: `Fetching tracks for ${artist} - ${searchResult.best.name}...`,
        });

        const best = searchResult.best;
        const tracks = await getAlbumTracks(best.id, accessToken);
        matchedCount++;

        addStatusLog(`✅ Found: ${best.name} - ${artist}`, 'success');
        addEventLog({
          severity: 'success',
          itemLabel: `${artist} - ${best.name}`,
          message: `Matched with ${(best.matchScore ? best.matchScore * 100 : 100).toFixed(0)}% confidence (${tracks.length} tracks).`,
        });
        setProgress(searchedCount, total, `${artist} - ${best.name}`);
        setDetailedProgress({
          searching: { current: searchedCount, total },
          matching: { current: matchedCount, total },
          currentItem: `${artist} - ${best.name}`,
        });

        return {
          status: 'found' as const,
          originalInput: line,
          artist,
          album: best,
          candidates: searchResult.candidates,
          trackUris: tracks.map((t: { uri: string }) => t.uri),
          trackObjects: tracks,
          selected: true,
          confidence: best.matchScore || 0,
          matchSource: 'auto' as const,
        };
      } catch (err: unknown) {
        searchedCount++;
        failedCount++;

        const isSessionLevel =
          err instanceof SpotifyApiError &&
          (err.kind === 'session_expired' ||
            err.kind === 'forbidden_scope' ||
            err.kind === 'forbidden_not_registered' ||
            err.kind === 'rate_limited' ||
            err.kind === 'network');

        if (isSessionLevel) {
          const feedback = formatActionableFeedback(err);
          setSessionError(feedback);
          setIsCancelled(true);
          addEventLog({
            severity: 'error',
            itemLabel: 'Session Alert',
            message: feedback.title,
          });
        }

        const reason = err instanceof Error ? err.message : 'Search failed';
        addStatusLog(`❌ Search Failed: ${artist} - ${albumName} (${reason})`, 'error');
        addEventLog({
          severity: 'error',
          itemLabel: `${artist} - ${albumName}`,
          message: reason,
        });

        setProgress(searchedCount, total, `${artist} - ${albumName}`);
        setDetailedProgress({
          searching: { current: searchedCount, total },
          failedCount,
          currentItem: `${artist} - ${albumName}`,
        });

        return {
          status: 'search_failed' as const,
          line,
          artist,
          albumName,
          reason,
        };
      }
    };

    const results = await asyncPool(
      3,
      lines,
      processOne,
      () => useAppStore.getState().isCancelled
    );

    results.forEach((res: PromiseSettledResult<MatchedAlbum | FailedAlbum>) => {
      if (res.status === 'fulfilled') {
        const val = res.value;
        if (val.status === 'found') {
          localMatched.push(val as MatchedAlbum);
        } else if (
          val.status === 'not_found' ||
          val.status === 'search_failed' ||
          val.status === 'error' ||
          val.status === 'skipped'
        ) {
          localFailed.push(val as FailedAlbum);
        }
      }
    });

    setMatchedAlbums(localMatched);
    setFailedAlbums(localFailed);
    setIsProcessing(false);
    setDetailedProgress({
      stage: 'completed',
      statusMessage: `Search completed: ${localMatched.length} found, ${localFailed.length} failed`,
    });

    if (localMatched.length > 0) {
      addToast(`Found ${localMatched.length} album(s)! Please review matches.`, 'success');
    } else {
      addToast('No tracks were found to add.', 'error');
    }
  };

  // 4. Sequential execution of publish session (halt on first failure for order preservation)
  const runPublishExecution = async (activeSession: PublishSession) => {
    if (!accessToken) return;
    setIsCommitting(true);
    setDetailedProgress({
      stage: 'publishing',
      statusMessage: 'Publishing tracks to Spotify...',
    });

    try {
      const userProfile = await getUserProfile(accessToken);
      const abortController = new AbortController();

      for (let bIndex = 0; bIndex < activeSession.batches.length; bIndex++) {
        const batch = activeSession.batches[bIndex];
        if (batch.status === 'completed') {
          continue; // Skip completed batches when resuming
        }

        const playlistName = `${activeSession.basePlaylistName}${batch.tierSuffix}`;

        // Resolve or create target playlist
        let targetPlaylistId = batch.targetPlaylistId;
        if (!targetPlaylistId) {
          if (batch.tierIndex === 0 && !activeSession.isNewPlaylist) {
            targetPlaylistId = activeSession.targetPlaylistId;
          } else if (activeSession.createdPlaylists[batch.tierIndex]) {
            targetPlaylistId = activeSession.createdPlaylists[batch.tierIndex].id;
          } else {
            addStatusLog(`Creating new playlist: "${playlistName}"...`, 'info');
            targetPlaylistId = await createNewPlaylist(
              userProfile.id,
              playlistName,
              accessToken,
              {
                description: activeSession.newPlaylistOptions?.description,
                isPublic: activeSession.newPlaylistOptions?.isPublic,
              }
            );
            activeSession.createdPlaylists[batch.tierIndex] = {
              id: targetPlaylistId,
              name: playlistName,
            };
          }
          batch.targetPlaylistId = targetPlaylistId;
        }

        // Re-check 10,000 track limit for target playlist before sending batch
        try {
          const details = await getPlaylistDetails(targetPlaylistId, accessToken);
          if (details.tracks.total + batch.trackUris.length > SPOTIFY_PLAYLIST_TRACK_LIMIT) {
            const limitMsg = HEADLINE_PLAYLIST_TOO_LARGE;
            const detailMsg = `Adding ${batch.trackUris.length} tracks would reach ${details.tracks.total + batch.trackUris.length} of ${SPOTIFY_PLAYLIST_TRACK_LIMIT} max tracks.`;
            addPublishFailure({
              id: Math.random().toString(36).slice(2),
              batchId: batch.id,
              tierIndex: batch.tierIndex,
              batchIndex: batch.batchIndex,
              playlistName,
              trackCount: batch.trackUris.length,
              trackNames: batch.trackNames,
              reason: `${limitMsg} (${detailMsg})`,
              timestamp: Date.now(),
            });
            pausePublishSession(limitMsg);
            addToast(limitMsg, 'error');
            addEventLog({
              severity: 'error',
              itemLabel: playlistName,
              message: `${limitMsg} ${detailMsg}`,
            });
            setIsCommitting(false);
            return;
          }
        } catch {
          // If details check fails, continue
        }

        updatePublishBatch(batch.id, { status: 'in_progress', targetPlaylistId });
        setDetailedProgress({
          statusMessage: `Adding batch ${bIndex + 1} of ${activeSession.batches.length} (${batch.trackUris.length} tracks) to "${playlistName}"...`,
        });

        const result = await addTracksBatchWithReconciliation(
          targetPlaylistId,
          batch.trackUris,
          accessToken,
          {
            signal: abortController.signal,
            onRateLimited: msg => addStatusLog(String(msg), 'info'),
          }
        );

        if (result.success) {
          updatePublishBatch(batch.id, { status: 'completed' }, result.snapshot_id);
          addStatusLog(
            `Added batch ${batch.batchIndex + 1} (${batch.trackUris.length} tracks) to "${playlistName}"${result.reconciled ? ' [Reconciled]' : ''}`,
            'success'
          );
          addEventLog({
            severity: 'success',
            itemLabel: playlistName,
            message: `Added batch ${batch.batchIndex + 1} (${batch.trackUris.length} tracks).`,
          });
        } else {
          // Batch failed! Halt sequentially, mark paused, and preserve session state
          const feedback = formatActionableFeedback(result.errorKind || result.error);
          const errorReason = feedback.title;

          if (result.errorKind === 'session_expired' || result.errorKind === 'forbidden_scope') {
            setSessionError(feedback);
          }

          updatePublishBatch(batch.id, { status: 'failed', error: errorReason });
          addPublishFailure({
            id: Math.random().toString(36).slice(2),
            batchId: batch.id,
            tierIndex: batch.tierIndex,
            batchIndex: batch.batchIndex,
            playlistName,
            trackCount: batch.trackUris.length,
            trackNames: batch.trackNames,
            reason: errorReason,
            status: result.status,
            timestamp: Date.now(),
          });
          pausePublishSession(errorReason);
          addToast(errorReason, 'error');
          addStatusLog(`Publishing paused: ${errorReason}`, 'error');
          addEventLog({
            severity: 'error',
            itemLabel: playlistName,
            message: `Batch ${batch.batchIndex + 1} failed: ${errorReason}`,
          });
          setIsCommitting(false);
          return;
        }
      }

      // Best-effort cover image upload if custom cover attached
      if (
        activeSession.isNewPlaylist &&
        activeSession.newPlaylistOptions?.coverImageBase64 &&
        activeSession.newPlaylistOptions.coverStatus === 'pending'
      ) {
        const basePlaylistId = activeSession.createdPlaylists[0]?.id;
        if (basePlaylistId) {
          addStatusLog('Uploading custom playlist cover image...', 'info');
          try {
            const ok = await uploadPlaylistCoverImage(
              basePlaylistId,
              activeSession.newPlaylistOptions.coverImageBase64,
              accessToken
            );
            if (ok) {
              activeSession.newPlaylistOptions.coverStatus = 'uploaded';
              addStatusLog('Custom cover image uploaded successfully.', 'success');
            } else {
              activeSession.newPlaylistOptions.coverStatus = 'failed';
              addStatusLog('Cover image upload was not accepted (non-fatal).', 'error');
            }
          } catch {
            activeSession.newPlaylistOptions.coverStatus = 'failed';
          }
        }
      }

      // All batches completed successfully!
      setDetailedProgress({
        stage: 'completed',
        statusMessage: 'All tracks successfully published to Spotify!',
      });
      addToast(
        `Successfully published ${activeSession.totalTracks} tracks to Spotify!`,
        'success'
      );
      clearPublishSession();
      clearPublishFailures();
      localStorage.removeItem('spotify_album_list');
      useAppStore.getState().setAlbumListText('');
      setTimeout(resetToSearch, 3500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error committing to Spotify';
      pausePublishSession(msg);
      addToast(msg, 'error');
      addStatusLog(`Commit Error: ${msg}`, 'error');
    } finally {
      setIsCommitting(false);
    }
  };

  // 5. Commit and start publish session
  const handleCommit = async () => {
    if (!accessToken) return;

    const selectedAlbums = matchedAlbums.filter((a: MatchedAlbum) => a.selected !== false);
    if (selectedAlbums.length === 0) {
      addToast('Please select at least one album to add', 'error');
      return;
    }

    const isNew = targetPlaylistMode === 'new';
    if (isNew && !newPlaylistName.trim()) {
      addToast('Please enter a name for the new playlist', 'error');
      return;
    }
    if (!isNew && !selectedExistingPlaylistId) {
      addToast('Please select a target playlist', 'error');
      return;
    }

    // Refresh existingTrackUris if target is existing playlist and not yet loaded
    let currentExistingUris = existingTrackUris;
    if (!isNew && currentExistingUris.size === 0 && selectedExistingPlaylistId) {
      try {
        currentExistingUris = await getPlaylistTracks(selectedExistingPlaylistId, accessToken);
        setExistingTrackUris(currentExistingUris);
      } catch {
        // Continue if check fails
      }
    }

    const tiers = calculatePlaylistTiers(selectedAlbums, tierOptions, currentExistingUris);
    if (tiers.length === 0 || tiers.every(t => t.tracks.length === 0)) {
      addToast('No new tracks to add after removing duplicates.', 'error');
      return;
    }

    if (tierOptions.maxPlaylists > 0 && tiers.length > tierOptions.maxPlaylists) {
      addToast(
        `Blocked: Generates ${tiers.length} playlists (Limit: ${tierOptions.maxPlaylists}). Adjust constraints.`,
        'error'
      );
      return;
    }

    if (tierOptions.strategy === 'partitioning' && tierOptions.maxTracks <= 0) {
      addToast('Blocked: "Max Tracks per Playlist" is required for Partitioning.', 'error');
      return;
    }

    // Check Spotify 10,000 track limit upfront
    if (!isNew) {
      const targetPlaylist = useAppStore.getState().playlists.find(p => p.id === selectedExistingPlaylistId);
      const currentCount = targetPlaylist?.tracks?.total || 0;
      const tier0Tracks = tiers[0]?.tracks.length || 0;
      if (currentCount + tier0Tracks > SPOTIFY_PLAYLIST_TRACK_LIMIT) {
        addToast(HEADLINE_PLAYLIST_TOO_LARGE, 'error');
        addEventLog({
          severity: 'error',
          itemLabel: 'Playlist Limit',
          message: `${HEADLINE_PLAYLIST_TOO_LARGE} (Adding ${tier0Tracks} tracks would reach ${currentCount + tier0Tracks} of ${SPOTIFY_PLAYLIST_TRACK_LIMIT}).`,
        });
        return;
      }
    }

    const baseName = isNew
      ? newPlaylistName.trim()
      : useAppStore.getState().playlists.find(p => p.id === selectedExistingPlaylistId)?.name ||
        'My Playlist';

    const targetPlaylistId = isNew ? 'NEW' : selectedExistingPlaylistId;

    // Build 100-track batches
    const batches: PublishBatch[] = [];
    tiers.forEach((tier, tierIndex) => {
      const BATCH_SIZE = 100;
      for (let i = 0; i < tier.tracks.length; i += BATCH_SIZE) {
        const batchTrackUris = tier.tracks.slice(i, i + BATCH_SIZE);
        const trackNames: string[] = [];
        batchTrackUris.forEach(uri => {
          for (const a of selectedAlbums) {
            const found = a.trackObjects?.find(t => t.uri === uri);
            if (found) {
              trackNames.push(`${a.artist} - ${found.name}`);
              break;
            }
          }
        });
        batches.push({
          id: `${tierIndex}-${Math.floor(i / BATCH_SIZE)}`,
          tierIndex,
          tierSuffix: tier.nameSuffix,
          batchIndex: Math.floor(i / BATCH_SIZE),
          trackUris: batchTrackUris,
          trackNames,
          status: 'pending',
        });
      }
    });

    const totalTracks = batches.reduce((sum, b) => sum + b.trackUris.length, 0);
    const session: PublishSession = {
      id: Math.random().toString(36).slice(2),
      basePlaylistName: baseName,
      targetPlaylistId,
      isNewPlaylist: isNew,
      newPlaylistOptions: isNew
        ? {
            name: newPlaylistName.trim(),
            description: newPlaylistDescription.trim(),
            isPublic: newPlaylistIsPublic,
            coverImageBase64: newPlaylistCoverImage?.base64 || null,
            coverStatus: newPlaylistCoverImage ? 'pending' : 'skipped',
          }
        : undefined,
      createdPlaylists: {},
      batches,
      currentBatchIndex: 0,
      totalTracks,
      isPaused: false,
    };

    startPublishSession(session);
    await runPublishExecution(session);
  };

  // 6. Resume publishing from first incomplete batch
  const handleResumePublish = async () => {
    const session = useAppStore.getState().publishSession;
    if (!session || !accessToken) return;

    const validToken = getStoredValidToken() || (await refreshAccessToken());
    if (!validToken) {
      useAppStore.getState().setIsSessionExpiredModalOpen(true);
      return;
    }

    addToast('Resuming publish session...', 'info');
    addStatusLog('Resuming publishing from first incomplete batch...', 'info');
    clearPublishFailures();

    const unpausedSession: PublishSession = {
      ...session,
      isPaused: false,
      pauseReason: undefined,
    };
    setPublishSession(unpausedSession);
    await runPublishExecution(unpausedSession);
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleSelectFromManualSearch = async (candidate: ScoredCandidate) => {
    if (!accessToken) return;

    try {
      const tracks = await getAlbumTracks(candidate.id, accessToken);
      const artistName = candidate.artists.map(a => a.name).join(', ');
      const newMatch: MatchedAlbum = {
        status: 'found',
        originalInput:
          manualSearchState.query || `${artistName} - ${candidate.name}`,
        artist: artistName,
        album: candidate,
        candidates: [candidate],
        trackUris: tracks.map((t: { uri: string }) => t.uri),
        trackObjects: tracks,
        confidence: 1,
        matchSource: 'manual',
        selected: true,
      };

      setMatchedAlbums([...useAppStore.getState().matchedAlbums, newMatch]);

      if (manualSearchState.failedIndex !== undefined) {
        removeFailedAlbum(manualSearchState.failedIndex);
      }

      setManualSearchState({ isOpen: false, query: '' });
      addToast(`Added: ${candidate.name}!`, 'success');
      addEventLog({
        severity: 'success',
        itemLabel: `${artistName} - ${candidate.name}`,
        message: `Manually added (${tracks.length} tracks).`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to add manual candidate';
      addToast(msg, 'error');
    }
  };

  return (
    <div className="min-h-screen bg-[#121212] text-white flex flex-col items-center justify-between p-4 sm:p-6 md:p-8 font-sans transition-colors">
      <div className="w-full max-w-3xl flex-1 flex flex-col items-center">
        <Header />

        <main className="w-full mt-4 space-y-6">
          {!accessToken ? (
            <AuthSection />
          ) : (
            <>
              {/* Wizard Step 1: Input & Target */}
              <div className="space-y-4 bg-[#181818] border border-white/10 rounded-2xl p-4 sm:p-6 shadow-xl">
                <PlaylistSelector />
                <AlbumInput />

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={handleProcessAlbums}
                    disabled={isProcessing}
                    className="flex-1 py-3.5 px-6 rounded-full bg-spotify-green hover:bg-spotify-green-hover text-black font-bold text-sm shadow-md shadow-spotify-green/20 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 transition-all"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Searching & Processing...</span>
                      </>
                    ) : (
                      <>
                        <Search size={16} />
                        <span>Search & Preview Albums</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Status Center (Persistent) */}
              <StatusCenter
                onFilterWarnings={() => scrollToSection('confirmation-list-section')}
                onFilterErrors={() => scrollToSection('failure-summary-section')}
                onFilterDuplicates={() => scrollToSection('confirmation-list-section')}
                onReconnect={() => setIsSessionExpiredModalOpen(true)}
                onResumePublish={handleResumePublish}
              />

              {/* Progress Banner */}
              <ProgressBanner
                onResumePublish={handleResumePublish}
                onCancelPublish={clearPublishSession}
              />

              {/* Review & Confirmation Step */}
              {matchedAlbums.length > 0 && (
                <div
                  id="confirmation-list-section"
                  className="space-y-6 bg-[#181818] border border-white/10 rounded-2xl p-4 sm:p-6 shadow-xl animate-in fade-in duration-300"
                >
                  <ConfirmationList />
                  <TieringControls />
                  <TierPreviewCards />

                  <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                    {publishSession?.isPaused ? (
                      <button
                        onClick={handleResumePublish}
                        disabled={isCommitting}
                        className="w-full sm:flex-1 py-3.5 px-6 rounded-full bg-spotify-green hover:bg-spotify-green-hover text-black font-bold text-sm shadow-md shadow-spotify-green/20 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
                      >
                        {isCommitting ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            <span>Resuming Publishing...</span>
                          </>
                        ) : (
                          <>
                            <Play size={16} fill="currentColor" />
                            <span>Resume Publishing to Spotify</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={handleCommit}
                        disabled={isCommitting}
                        className="w-full sm:flex-1 py-3.5 px-6 rounded-full bg-spotify-green hover:bg-spotify-green-hover text-black font-bold text-sm shadow-md shadow-spotify-green/20 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
                      >
                        {isCommitting ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            <span>Publishing to Spotify...</span>
                          </>
                        ) : (
                          <>
                            <Send size={16} />
                            <span>Add Selected to Playlist</span>
                          </>
                        )}
                      </button>
                    )}
                    <button
                      onClick={resetToSearch}
                      className="w-full sm:w-auto py-3 px-5 rounded-full bg-white/10 hover:bg-white/15 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-all"
                    >
                      <Edit3 size={14} />
                      <span>Edit List</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Failed Items Resolution */}
              <div id="failure-summary-section">
                <FailureSummary
                  onResumePublish={handleResumePublish}
                  onOpenManualSearch={(failedIndex, query) => {
                    setManualSearchState({ isOpen: true, failedIndex, query });
                  }}
                />
              </div>

              {/* Live Status Console */}
              <StatusLog />
            </>
          )}
        </main>
      </div>

      <Footer />
      <ToastContainer />
      <ReconnectModal />
      {manualSearchState.isOpen && (
        <ManualSearchModal
          isOpen={manualSearchState.isOpen}
          onClose={() => setManualSearchState({ isOpen: false, query: '' })}
          initialQuery={manualSearchState.query}
          token={accessToken || ''}
          onSelectNewCandidate={handleSelectFromManualSearch}
        />
      )}
    </div>
  );
};
