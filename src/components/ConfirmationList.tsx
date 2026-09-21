import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { getAlbumTracks } from '../services/spotifyApi';
import { GripVertical, LayoutList, LayoutGrid, Check } from 'lucide-react';

export const ConfirmationList: React.FC = () => {
  const {
    matchedAlbums,
    existingTrackUris,
    isGridView,
    setIsGridView,
    reorderMatchedAlbums,
    updateMatchedAlbum,
    toggleAlbumSelection,
    accessToken,
    addToast,
  } = useAppStore();

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  if (matchedAlbums.length === 0) return null;

  const handleVersionChange = async (albumIndex: number, candidateIndex: number) => {
    if (!accessToken) return;
    const albumItem = matchedAlbums[albumIndex];
    const candidate = albumItem.candidates[candidateIndex];
    if (!candidate) return;

    try {
      addToast(`Switching to: ${candidate.name}...`, 'info');
      const tracks = await getAlbumTracks(candidate.id, accessToken);
      updateMatchedAlbum(albumIndex, {
        album: candidate,
        trackUris: tracks.map(t => t.uri),
        trackObjects: tracks,
      });
      addToast(`Switched to: ${candidate.name}`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error switching version';
      addToast(msg, 'error');
    }
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== targetIndex) {
      reorderMatchedAlbums(draggedIndex, targetIndex);
    }
    setDraggedIndex(null);
  };

  return (
    <div className="w-full space-y-4 pt-4 border-t border-white/10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            Confirm Matches
            <span className="text-xs px-2 py-0.5 rounded-full bg-spotify-green/20 text-spotify-green font-semibold">
              {matchedAlbums.length}
            </span>
          </h2>
          <p className="text-xs text-spotify-light-gray mt-0.5">
            Drag to reorder. Border color indicates search match confidence.
          </p>
        </div>

        {/* View Switcher */}
        <div className="flex items-center gap-1 bg-white/5 p-1 rounded-lg border border-white/10">
          <button
            onClick={() => setIsGridView(false)}
            className={`p-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${
              !isGridView ? 'bg-white/20 text-white shadow-sm' : 'text-spotify-light-gray hover:text-white'
            }`}
            title="List View"
          >
            <LayoutList size={14} />
            <span className="hidden sm:inline">List</span>
          </button>
          <button
            onClick={() => setIsGridView(true)}
            className={`p-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${
              isGridView ? 'bg-white/20 text-white shadow-sm' : 'text-spotify-light-gray hover:text-white'
            }`}
            title="Grid View"
          >
            <LayoutGrid size={14} />
            <span className="hidden sm:inline">Grid</span>
          </button>
        </div>
      </div>

      {/* Album List / Grid */}
      <div
        className={
          isGridView
            ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'
            : 'space-y-2'
        }
      >
        {matchedAlbums.map((item, index) => {
          const isSelected = item.selected !== false;
          const score = item.album.matchScore || 0;
          const scorePercent = Math.round(score * 100);

          // Confidence color
          let borderClass = 'border-amber-500/40 bg-amber-500/[0.02]';
          let badgeClass = 'text-amber-400 bg-amber-500/10 border-amber-500/20';

          if (score >= 0.8) {
            borderClass = 'border-spotify-green/40 bg-spotify-green/[0.02]';
            badgeClass = 'text-spotify-green bg-spotify-green/10 border-spotify-green/20';
          } else if (score < 0.5) {
            borderClass = 'border-red-500/40 bg-red-500/[0.02]';
            badgeClass = 'text-red-400 bg-red-500/10 border-red-500/20';
          }

          // Duplicate checks
          const duplicates = item.trackUris.filter(uri => existingTrackUris.has(uri));
          const allIsDup = duplicates.length === item.trackUris.length && item.trackUris.length > 0;
          const someIsDup = duplicates.length > 0 && !allIsDup;

          const coverUrl =
            item.album.images && item.album.images.length > 0
              ? item.album.images[item.album.images.length - 1].url
              : 'https://via.placeholder.com/60';

          return (
            <div
              key={`${item.album.id}-${index}`}
              draggable
              onDragStart={e => handleDragStart(e, index)}
              onDragOver={handleDragOver}
              onDrop={e => handleDrop(e, index)}
              className={`group relative flex items-center gap-3 p-3 rounded-xl border transition-all select-none ${borderClass} ${
                !isSelected ? 'opacity-40 grayscale-[40%]' : ''
              } ${draggedIndex === index ? 'opacity-20 scale-[0.98]' : 'hover:bg-white/[0.04]'}`}
            >
              <div
                className="cursor-grab active:cursor-grabbing text-spotify-light-gray/40 group-hover:text-spotify-light-gray"
                title="Drag to reorder"
              >
                <GripVertical size={16} />
              </div>

              {/* Selection Checkbox */}
              <button
                onClick={() => toggleAlbumSelection(index)}
                aria-label={`Toggle selection for ${item.album.name}`}
                className={`w-5 h-5 rounded flex items-center justify-center border transition-all shrink-0 ${
                  isSelected
                    ? 'bg-spotify-green border-spotify-green text-black'
                    : 'border-white/30 hover:border-white'
                }`}
              >
                {isSelected && <Check size={14} strokeWidth={3} />}
              </button>

              <img
                src={coverUrl}
                alt={item.album.name}
                className="w-12 h-12 rounded-lg object-cover shadow-sm shrink-0"
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-white truncate" title={item.album.name}>
                    {item.album.name}
                  </h3>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-bold border shrink-0 ${badgeClass}`}
                    title={`Confidence Score: ${scorePercent}%`}
                  >
                    {scorePercent}%
                  </span>
                </div>

                <p className="text-xs text-spotify-light-gray truncate">
                  {item.album.artists.map(a => a.name).join(', ')}
                </p>

                {allIsDup && (
                  <p className="text-[11px] text-amber-400 font-medium mt-0.5">
                    ⚠️ Entire album already in playlist
                  </p>
                )}
                {someIsDup && (
                  <p className="text-[11px] text-amber-400 font-medium mt-0.5">
                    ⚠️ {duplicates.length} tracks already in playlist
                  </p>
                )}

                {/* Alternate candidate dropdown */}
                {item.candidates && item.candidates.length > 1 && (
                  <select
                    aria-label="Select alternative album version"
                    onChange={e => handleVersionChange(index, parseInt(e.target.value, 10))}
                    className="mt-1.5 text-[11px] bg-white/10 hover:bg-white/15 border border-white/10 rounded px-2 py-1 text-spotify-light-gray focus:text-white focus:outline-none max-w-full"
                  >
                    {item.candidates.map((c, i) => {
                      const year = c.release_date ? c.release_date.split('-')[0] : '';
                      const isCurrent = c.id === item.album.id;
                      return (
                        <option key={c.id} value={i} className="bg-[#242424] text-white">
                          {c.name.substring(0, 32)} {year ? `(${year})` : ''} {isCurrent ? '✓' : ''}
                        </option>
                      );
                    })}
                  </select>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
