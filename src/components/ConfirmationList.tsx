import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { getAlbumTracks } from '../services/spotifyApi';
import {
  formatDuration,
  getConfidenceLevel,
  getPlayabilityWarning,
  hasExplicitTracks,
} from '../utils/matchReview';
import { ScoredCandidate } from '../types/app';
import { CandidateComparisonModal } from './CandidateComparisonModal';
import { ManualSearchModal } from './ManualSearchModal';
import {
  GripVertical,
  LayoutList,
  LayoutGrid,
  Check,
  Edit3,
  RotateCcw,
  Layers,
  AlertTriangle,
  Clock,
  Music,
} from 'lucide-react';

export const ConfirmationList: React.FC = () => {
  const {
    matchedAlbums,
    existingTrackUris,
    isGridView,
    setIsGridView,
    reorderMatchedAlbums,
    updateMatchedAlbum,
    toggleAlbumSelection,
    clearPublishSession,
    accessToken,
    addToast,
  } = useAppStore();

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'needs_review' | 'high'>('all');

  // Modal states
  const [comparisonModalIndex, setComparisonModalIndex] = useState<number | null>(null);
  const [manualSearchModalIndex, setManualSearchModalIndex] = useState<number | null>(null);

  if (matchedAlbums.length === 0) return null;

  // Filter counts
  const needsReviewCount = matchedAlbums.filter(
    m => m.matchSource !== 'manual' && getConfidenceLevel(m.confidence) !== 'high'
  ).length;

  const highConfidenceCount = matchedAlbums.filter(
    m => m.matchSource === 'manual' || getConfidenceLevel(m.confidence) === 'high'
  ).length;

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

  const handleSelectCandidate = async (albumIndex: number, candidate: ScoredCandidate) => {
    if (!accessToken) return;
    const albumItem = matchedAlbums[albumIndex];
    if (!albumItem) return;

    // Save auto-match for undo capability if not already saved
    const originalAutoMatch = albumItem.originalAutoMatch || {
      album: albumItem.album,
      candidates: albumItem.candidates,
      trackUris: albumItem.trackUris,
      trackObjects: albumItem.trackObjects,
      confidence: albumItem.confidence,
    };

    addToast(`Loading "${candidate.name}" tracks...`, 'info');
    const tracks = await getAlbumTracks(candidate.id, accessToken);

    updateMatchedAlbum(albumIndex, {
      album: candidate,
      trackUris: tracks.map(t => t.uri),
      trackObjects: tracks,
      confidence: candidate.matchScore ?? albumItem.confidence,
      originalAutoMatch,
    });

    clearPublishSession();
    addToast(`Switched to: ${candidate.name}`, 'success');
  };

  const handleSelectReplacement = async (albumIndex: number, candidate: ScoredCandidate) => {
    if (!accessToken) return;
    const albumItem = matchedAlbums[albumIndex];
    if (!albumItem) return;

    const originalAutoMatch = albumItem.originalAutoMatch || {
      album: albumItem.album,
      candidates: albumItem.candidates,
      trackUris: albumItem.trackUris,
      trackObjects: albumItem.trackObjects,
      confidence: albumItem.confidence,
    };

    addToast(`Loading tracks for "${candidate.name}"...`, 'info');
    const tracks = await getAlbumTracks(candidate.id, accessToken);

    updateMatchedAlbum(albumIndex, {
      artist: candidate.artists.map(a => a.name).join(', '),
      album: candidate,
      trackUris: tracks.map(t => t.uri),
      trackObjects: tracks,
      matchSource: 'manual',
      confidence: 1,
      originalAutoMatch,
    });

    clearPublishSession();
    addToast(`Updated match to: ${candidate.name}`, 'success');
  };

  const handleRevertAuto = (albumIndex: number) => {
    const albumItem = matchedAlbums[albumIndex];
    if (!albumItem || !albumItem.originalAutoMatch) return;

    const auto = albumItem.originalAutoMatch;
    updateMatchedAlbum(albumIndex, {
      album: auto.album,
      candidates: auto.candidates,
      trackUris: auto.trackUris,
      trackObjects: auto.trackObjects,
      confidence: auto.confidence,
      matchSource: 'auto',
      originalAutoMatch: undefined,
    });

    clearPublishSession();
    addToast(`Reverted to original match: ${auto.album.name}`, 'info');
  };

  return (
    <div className="w-full space-y-4 pt-4 border-t border-white/10">
      {/* Header with Title, Filter Pills, and View Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            Confirm Matches
            <span className="text-xs px-2 py-0.5 rounded-full bg-spotify-green/20 text-spotify-green font-semibold">
              {matchedAlbums.length}
            </span>
          </h2>
          <p className="text-xs text-spotify-light-gray mt-0.5">
            Review best matches, compare editions, or edit queries. Drag handles to reorder playlist sequence.
          </p>
        </div>

        {/* View Switcher & Filter Pills */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
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
      </div>

      {/* Review Filter Bar */}
      <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
        <button
          onClick={() => setActiveFilter('all')}
          className={`px-3 py-1.5 rounded-lg border transition-all ${
            activeFilter === 'all'
              ? 'bg-white/20 text-white border-white/20 font-semibold'
              : 'bg-white/5 text-spotify-light-gray hover:text-white border-white/10'
          }`}
        >
          All ({matchedAlbums.length})
        </button>
        <button
          onClick={() => setActiveFilter('needs_review')}
          className={`px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${
            activeFilter === 'needs_review'
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/30 font-semibold'
              : 'bg-white/5 text-spotify-light-gray hover:text-amber-300 border-white/10'
          }`}
        >
          <span>Needs Review ({needsReviewCount})</span>
        </button>
        <button
          onClick={() => setActiveFilter('high')}
          className={`px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${
            activeFilter === 'high'
              ? 'bg-spotify-green/20 text-spotify-green border-spotify-green/30 font-semibold'
              : 'bg-white/5 text-spotify-light-gray hover:text-spotify-green border-white/10'
          }`}
        >
          <span>High Confidence ({highConfidenceCount})</span>
        </button>
      </div>

      {/* Album List / Grid */}
      <div
        className={
          isGridView
            ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'
            : 'space-y-3'
        }
      >
        {matchedAlbums.map((item, index) => {
          const confidenceLevel = getConfidenceLevel(item.confidence);
          const isManual = item.matchSource === 'manual';

          // Apply active filter
          if (activeFilter === 'needs_review' && (isManual || confidenceLevel === 'high')) {
            return null;
          }
          if (activeFilter === 'high' && (!isManual && confidenceLevel !== 'high')) {
            return null;
          }

          const isSelected = item.selected !== false;
          const scorePercent = Math.round(item.confidence * 100);

          // Card confidence styling
          let borderClass = 'border-amber-500/30 bg-amber-500/[0.02]';
          let badgeClass = 'text-amber-400 bg-amber-500/10 border-amber-500/20';
          let confidenceLabel = `Medium (${scorePercent}%)`;

          if (isManual) {
            borderClass = 'border-purple-500/40 bg-purple-500/[0.02]';
            badgeClass = 'text-purple-300 bg-purple-500/15 border-purple-500/30';
            confidenceLabel = 'Manually Selected';
          } else if (confidenceLevel === 'high') {
            borderClass = 'border-spotify-green/30 bg-spotify-green/[0.02]';
            badgeClass = 'text-spotify-green bg-spotify-green/10 border-spotify-green/20';
            confidenceLabel = `High (${scorePercent}%)`;
          } else if (confidenceLevel === 'low') {
            borderClass = 'border-red-500/40 bg-red-500/[0.02]';
            badgeClass = 'text-red-400 bg-red-500/10 border-red-500/20';
            confidenceLabel = `Low (${scorePercent}%)`;
          }

          // Duplicate checks against playlist
          const duplicates = item.trackUris.filter(uri => existingTrackUris.has(uri));
          const allIsDup = duplicates.length === item.trackUris.length && item.trackUris.length > 0;
          const someIsDup = duplicates.length > 0 && !allIsDup;

          // Cross-line duplicate check (another line matched the exact same album)
          const matchedOnAnotherLine = matchedAlbums.some(
            (other, idx) => idx !== index && other.album.id === item.album.id
          );

          // Rich metadata derivations
          const totalDurationMs = item.trackObjects?.reduce(
            (sum, t) => sum + (t.duration_ms || 0),
            0
          );
          const durationStr = totalDurationMs > 0 ? formatDuration(totalDurationMs) : '';
          const explicitFlag = hasExplicitTracks(item.trackObjects);
          const playabilityWarning = getPlayabilityWarning(item.trackObjects);
          const releaseYear = item.album.release_date
            ? item.album.release_date.split('-')[0]
            : '';
          const trackCount = item.trackObjects?.length || item.album.total_tracks || item.trackUris.length;

          const coverUrl =
            item.album.images && item.album.images.length > 0
              ? item.album.images[item.album.images.length - 1].url
              : 'https://via.placeholder.com/64';

          const candidateCount = item.candidates?.length || 1;

          return (
            <div
              key={`${item.album.id}-${index}`}
              draggable
              onDragStart={e => handleDragStart(e, index)}
              onDragOver={handleDragOver}
              onDrop={e => handleDrop(e, index)}
              className={`group relative flex flex-col p-3.5 rounded-2xl border transition-all select-none ${borderClass} ${
                !isSelected ? 'opacity-40 grayscale-[40%]' : ''
              } ${draggedIndex === index ? 'opacity-20 scale-[0.98]' : 'hover:bg-white/[0.03]'}`}
            >
              {/* Top Sub-Bar: Original Input & Confidence Indicator */}
              <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-white/5 text-[11px]">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-spotify-light-gray font-medium shrink-0">Input:</span>
                  <span
                    className="font-mono text-white/90 truncate bg-black/40 px-2 py-0.5 rounded border border-white/5"
                    title={item.originalInput}
                  >
                    {item.originalInput}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={`px-2 py-0.5 rounded-full font-bold border text-[10px] flex items-center gap-1 ${badgeClass}`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    <span>{confidenceLabel}</span>
                  </span>
                  {item.originalAutoMatch && (
                    <button
                      onClick={() => handleRevertAuto(index)}
                      className="text-[10px] text-spotify-light-gray hover:text-white flex items-center gap-0.5 underline transition-colors"
                      title="Undo override and revert to original automatic match"
                    >
                      <RotateCcw size={10} />
                      <span>Revert</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Main Content Area */}
              <div className="flex items-start gap-3">
                {/* Drag Handle & Checkbox */}
                <div className="flex items-center gap-2 pt-1 shrink-0">
                  <div
                    className="cursor-grab active:cursor-grabbing text-spotify-light-gray/40 group-hover:text-spotify-light-gray transition-colors"
                    title="Drag to reorder tracks"
                  >
                    <GripVertical size={16} />
                  </div>
                  <button
                    onClick={() => toggleAlbumSelection(index)}
                    aria-label={`Toggle selection for ${item.album.name}`}
                    className={`w-5 h-5 rounded flex items-center justify-center border transition-all ${
                      isSelected
                        ? 'bg-spotify-green border-spotify-green text-black'
                        : 'border-white/30 hover:border-white'
                    }`}
                  >
                    {isSelected && <Check size={14} strokeWidth={3} />}
                  </button>
                </div>

                {/* Album Cover Art */}
                <img
                  src={coverUrl}
                  alt={`Album cover for ${item.album.name}`}
                  className="w-16 h-16 rounded-xl object-cover shadow-md shrink-0"
                  loading="lazy"
                />

                {/* Album Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="text-sm font-bold text-white truncate" title={item.album.name}>
                      {item.album.name}
                    </h3>
                    {item.album.album_type && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-white/10 text-spotify-light-gray uppercase tracking-wider">
                        {item.album.album_type}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-spotify-light-gray truncate mt-0.5">
                    {item.album.artists.map(a => a.name).join(', ')}
                  </p>

                  {/* Metadata Row: Year, Track count, Duration, Explicit, Region */}
                  <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-spotify-light-gray">
                    {releaseYear && <span>{releaseYear}</span>}
                    {trackCount > 0 && (
                      <span className="flex items-center gap-0.5">
                        <Music size={11} className="text-spotify-light-gray/70" />
                        <span>{trackCount} tracks</span>
                      </span>
                    )}
                    {durationStr && (
                      <span className="flex items-center gap-0.5 font-mono text-white/80">
                        <Clock size={11} className="text-spotify-light-gray/70" />
                        <span>{durationStr}</span>
                      </span>
                    )}
                    {explicitFlag && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
                        Contains explicit tracks
                      </span>
                    )}
                  </div>

                  {/* Warnings Row */}
                  {playabilityWarning && (
                    <div className="text-amber-400 text-[11px] flex items-center gap-1 mt-1 font-medium">
                      <AlertTriangle size={12} />
                      <span>{playabilityWarning}</span>
                    </div>
                  )}
                  {matchedOnAnotherLine && (
                    <div className="text-amber-400 text-[11px] flex items-center gap-1 mt-1 font-medium">
                      <AlertTriangle size={12} />
                      <span>Also matched on another line</span>
                    </div>
                  )}
                  {allIsDup && (
                    <p className="text-[11px] text-amber-400 font-medium mt-1">
                      ⚠️ Entire album already in target playlist
                    </p>
                  )}
                  {someIsDup && (
                    <p className="text-[11px] text-amber-400 font-medium mt-1">
                      ⚠️ {duplicates.length} tracks already in target playlist
                    </p>
                  )}
                </div>
              </div>

              {/* Bottom Action Controls: Alternative matches & Manual override */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 mt-2.5 border-t border-white/5 text-xs">
                <div className="flex items-center gap-2">
                  {candidateCount > 1 ? (
                    <button
                      onClick={() => setComparisonModalIndex(index)}
                      className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium text-[11px] flex items-center gap-1.5 transition-colors"
                    >
                      <Layers size={13} className="text-spotify-green" />
                      <span>{candidateCount} candidate editions</span>
                    </button>
                  ) : (
                    <span className="text-[11px] text-spotify-light-gray/60 italic">
                      1 match found
                    </span>
                  )}
                </div>

                <button
                  onClick={() => setManualSearchModalIndex(index)}
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-spotify-light-gray hover:text-white font-medium text-[11px] flex items-center gap-1.5 transition-colors"
                >
                  <Edit3 size={12} />
                  <span>Search Again / Edit Query</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Candidate Comparison Modal */}
      {comparisonModalIndex !== null && matchedAlbums[comparisonModalIndex] && (
        <CandidateComparisonModal
          isOpen={true}
          onClose={() => setComparisonModalIndex(null)}
          albumIndex={comparisonModalIndex}
          matchedAlbum={matchedAlbums[comparisonModalIndex]}
          allMatchedAlbums={matchedAlbums}
          token={accessToken || ''}
          onSelectCandidate={handleSelectCandidate}
        />
      )}

      {/* Manual Search & Override Modal */}
      {manualSearchModalIndex !== null && matchedAlbums[manualSearchModalIndex] && (
        <ManualSearchModal
          isOpen={true}
          onClose={() => setManualSearchModalIndex(null)}
          albumIndex={manualSearchModalIndex}
          matchedAlbum={matchedAlbums[manualSearchModalIndex]}
          allMatchedAlbums={matchedAlbums}
          token={accessToken || ''}
          onSelectReplacement={handleSelectReplacement}
        />
      )}
    </div>
  );
};
