import React, { useEffect, useState } from 'react';
import { useAppStore } from './store/useAppStore';
import {
  getStoredValidToken,
  refreshAccessToken,
  exchangeCodeForToken,
} from './services/spotifyAuth';
import {
  getUserProfile,
  getUserPlaylists,
  getPlaylistTracks,
  searchAlbumWithStrategies,
  getAlbumTracks,
  createNewPlaylist,
  addTracksToPlaylist,
} from './services/spotifyApi';
import { asyncPool } from './utils/asyncPool';
import { parseAlbumLine } from './utils/fuzzyMatch';
import { calculatePlaylistTiers } from './utils/tiering';
import { MatchedAlbum, FailedAlbum } from './types/app';

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
import { Footer } from './components/Footer';
import { Search, Send, Edit3, Loader2 } from 'lucide-react';

export const App: React.FC = () => {
  const {
    accessToken,
    setAccessToken,
    setUserProfile,
    setPlaylists,
    setIsLoadingPlaylists,
    selectedPlaylistId,
    newPlaylistName,
    albumListText,
    isProcessing,
    setIsProcessing,
    setIsCancelled,
    setProgress,
    resetProgress,
    matchedAlbums,
    setMatchedAlbums,
    setFailedAlbums,
    existingTrackUris,
    setExistingTrackUris,
    tierOptions,
    addStatusLog,
    addToast,
    resetToSearch,
  } = useAppStore();

  const [isCommitting, setIsCommitting] = useState(false);

  // 1. Check for tokens or auth code on mount
  useEffect(() => {
    const initAuth = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');

      if (code) {
        try {
          addToast('Exchanging authorization code for token...', 'info');
          const token = await exchangeCodeForToken(code);
          setAccessToken(token);
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
      } else {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          setAccessToken(refreshed);
        }
      }
    };

    initAuth();
  }, [setAccessToken, addToast]);

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

  // 3. Search & Process albums
  const handleProcessAlbums = async () => {
    if (!accessToken) return;

    const lines = albumListText.split('\n').filter((l: string) => l.trim().length > 0);
    if (lines.length === 0) {
      addToast('Please enter at least one album in the editor', 'error');
      return;
    }

    if (!selectedPlaylistId) {
      addToast('Please select a target playlist', 'error');
      return;
    }

    if (selectedPlaylistId === 'NEW' && !newPlaylistName.trim()) {
      addToast('Please enter a name for the new playlist', 'error');
      return;
    }

    // Check existing tracks in selected playlist to detect duplicates
    if (selectedPlaylistId !== 'NEW') {
      addStatusLog('Checking existing tracks in target playlist...', 'info');
      const existing = await getPlaylistTracks(selectedPlaylistId, accessToken);
      setExistingTrackUris(existing);
    } else {
      setExistingTrackUris(new Set());
    }

    setIsProcessing(true);
    setIsCancelled(false);
    resetProgress();
    setMatchedAlbums([]);
    setFailedAlbums([]);

    let processedCount = 0;
    const total = lines.length;
    const localMatched: MatchedAlbum[] = [];
    const localFailed: FailedAlbum[] = [];

    const processOne = async (line: string) => {
      if (useAppStore.getState().isCancelled) {
        processedCount++;
        setProgress(processedCount, total);
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
        processedCount++;
        setProgress(processedCount, total);
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

        if (!searchResult || searchResult.candidates.length === 0) {
          addStatusLog(`❌ Not found: ${artist} - ${albumName}`, 'error');
          processedCount++;
          setProgress(processedCount, total, `${artist} - ${albumName}`);
          return {
            status: 'not_found' as const,
            line,
            artist,
            albumName,
            reason: 'Not found on Spotify',
          };
        }

        const best = searchResult.best;
        const tracks = await getAlbumTracks(best.id, accessToken);

        addStatusLog(`✅ Found: ${best.name} - ${artist}`, 'success');
        processedCount++;
        setProgress(processedCount, total, `${artist} - ${best.name}`);

        return {
          status: 'found' as const,
          artist,
          album: best,
          candidates: searchResult.candidates,
          trackUris: tracks.map((t: { uri: string }) => t.uri),
          trackObjects: tracks,
          selected: true,
        };
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : 'API error';
        addStatusLog(`❌ Error: ${artist} - ${albumName} (${reason})`, 'error');
        processedCount++;
        setProgress(processedCount, total, `${artist} - ${albumName}`);
        return {
          status: 'error' as const,
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

    if (localMatched.length > 0) {
      addToast(`Found ${localMatched.length} album(s)! Please review matches.`, 'success');
    } else {
      addToast('No tracks were found to add.', 'error');
    }
  };

  // 4. Commit and create playlists
  const handleCommit = async () => {
    if (!accessToken) return;

    const selectedAlbums = matchedAlbums.filter((a: MatchedAlbum) => a.selected !== false);
    if (selectedAlbums.length === 0) {
      addToast('Please select at least one album to add', 'error');
      return;
    }

    const tiers = calculatePlaylistTiers(selectedAlbums, tierOptions, existingTrackUris);
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

    const baseName =
      selectedPlaylistId === 'NEW'
        ? newPlaylistName.trim() || 'New Playlist'
        : useAppStore.getState().playlists.find(p => p.id === selectedPlaylistId)?.name ||
          'My Playlist';

    setIsCommitting(true);
    addStatusLog(`🎵 Creating ${tiers.length} playlist(s)...`, 'info');

    try {
      const userProfile = await getUserProfile(accessToken);
      const createdList: { name: string; count: number }[] = [];

      for (let i = 0; i < tiers.length; i++) {
        const tier = tiers[i];
        const playlistName = `${baseName}${tier.nameSuffix}`;

        let targetId: string | null = null;
        if (i === 0 && selectedPlaylistId !== 'NEW') {
          targetId = selectedPlaylistId;
          addStatusLog(
            `Adding ${tier.tracks.length} tracks to existing playlist "${baseName}"...`,
            'info'
          );
        } else {
          addStatusLog(`Creating new playlist: "${playlistName}"...`, 'info');
          targetId = await createNewPlaylist(userProfile.id, playlistName, accessToken);
        }

        if (targetId && tier.tracks.length > 0) {
          await addTracksToPlaylist(targetId, tier.tracks, accessToken);
          createdList.push({ name: playlistName, count: tier.tracks.length });
        }
      }

      const totalTracks = createdList.reduce((sum, p) => sum + p.count, 0);
      addToast(
        `🎉 Successfully created ${createdList.length} playlist(s) with ${totalTracks} tracks!`,
        'success'
      );

      createdList.forEach(p => {
        addStatusLog(`   ✅ "${p.name}" - ${p.count} tracks`, 'info');
      });

      // Clear input
      localStorage.removeItem('spotify_album_list');
      useAppStore.getState().setAlbumListText('');
      setTimeout(resetToSearch, 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error committing to Spotify';
      addToast(msg, 'error');
      addStatusLog(`Commit Error: ${msg}`, 'error');
    } finally {
      setIsCommitting(false);
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

              {/* Progress Banner */}
              <ProgressBanner />

              {/* Review & Confirmation Step */}
              {matchedAlbums.length > 0 && (
                <div className="space-y-6 bg-[#181818] border border-white/10 rounded-2xl p-4 sm:p-6 shadow-xl animate-in fade-in duration-300">
                  <ConfirmationList />
                  <TieringControls />
                  <TierPreviewCards />

                  <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
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
              <FailureSummary />

              {/* Live Status Console */}
              <StatusLog />
            </>
          )}
        </main>
      </div>

      <Footer />
      <ToastContainer />
    </div>
  );
};
