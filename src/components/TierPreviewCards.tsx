import React, { useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { calculatePlaylistTiers, formatDuration } from '../utils/tiering';
import { BarChart3, AlertTriangle } from 'lucide-react';

export const TierPreviewCards: React.FC = () => {
  const {
    matchedAlbums,
    playlists,
    selectedPlaylistId,
    newPlaylistName,
    tierOptions,
    existingTrackUris,
  } = useAppStore();

  const selectedAlbums = useMemo(() => {
    return matchedAlbums.filter(a => a.selected !== false);
  }, [matchedAlbums]);

  // Base playlist name
  const baseName = useMemo(() => {
    if (selectedPlaylistId === 'NEW') {
      return newPlaylistName.trim() || 'New Playlist';
    }
    const found = playlists.find(p => p.id === selectedPlaylistId);
    return found ? found.name : 'My Playlist';
  }, [selectedPlaylistId, newPlaylistName, playlists]);

  // Track map for duration
  const trackMap = useMemo(() => {
    const map = new Map<string, number>();
    selectedAlbums.forEach(album => {
      album.trackObjects.forEach(t => {
        map.set(t.uri, t.duration_ms || 0);
      });
    });
    return map;
  }, [selectedAlbums]);

  const tiers = useMemo(() => {
    if (selectedAlbums.length === 0) return [];
    return calculatePlaylistTiers(selectedAlbums, tierOptions, existingTrackUris);
  }, [selectedAlbums, tierOptions, existingTrackUris]);

  if (selectedAlbums.length === 0) return null;

  const totalTracks = tiers.reduce((sum, t) => sum + t.tracks.length, 0);
  const exceedsMax =
    tierOptions.maxPlaylists > 0 && tiers.length > tierOptions.maxPlaylists;
  const isPartitioningMissingTracks =
    tierOptions.strategy === 'partitioning' && tierOptions.maxTracks <= 0;

  return (
    <div className="w-full bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 text-white font-semibold text-sm">
        <BarChart3 size={16} className="text-spotify-green" />
        <span>Playlist Preview</span>
      </div>

      {isPartitioningMissingTracks && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
          Please specify &ldquo;Max Tracks / Playlist&rdquo; to preview partitioning.
        </div>
      )}

      {exceedsMax && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          <AlertTriangle size={15} className="shrink-0" />
          <span>
            Constraint: Generates {tiers.length} playlists, but Max Playlists limit is{' '}
            {tierOptions.maxPlaylists}. Adjust your settings.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto pr-1">
        {tiers.map((tier, idx) => {
          const isPrimary = idx === 0;
          const tierName = `${baseName}${tier.nameSuffix}`;
          const durationMs = tier.tracks.reduce(
            (sum, uri) => sum + (trackMap.get(uri) || 0),
            0
          );

          return (
            <div
              key={idx}
              className={`p-3 rounded-lg border transition-all ${
                isPrimary
                  ? 'bg-spotify-green/10 border-spotify-green/30'
                  : 'bg-white/5 border-white/5'
              }`}
            >
              <div
                className="text-xs font-semibold text-white truncate flex items-center gap-1.5"
                title={tierName}
              >
                <span>{isPrimary ? '✨' : '📄'}</span>
                <span className="truncate">{tierName}</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-spotify-light-gray">
                <span className="text-spotify-green font-semibold">
                  {tier.tracks.length} tracks
                </span>
                <span>•</span>
                <span>{formatDuration(durationMs)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {tiers.length > 0 && (
        <div className="pt-2 border-t border-white/5 text-center text-xs text-spotify-light-gray">
          <strong>{tiers.length}</strong> playlist{tiers.length > 1 ? 's' : ''} will be created
          with <strong className="text-spotify-green">{totalTracks}</strong> total tracks
        </div>
      )}
    </div>
  );
};
