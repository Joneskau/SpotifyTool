import React, { useEffect, useRef, useState } from 'react';
import { MatchedAlbum, ScoredCandidate } from '../types/app';
import { getCandidateDetails, CandidateDetails } from '../services/spotifyApi';
import { formatDuration, getPlayabilityWarning, hasExplicitTracks } from '../utils/matchReview';
import { X, Check, Loader2, AlertTriangle, Disc, AlertCircle } from 'lucide-react';

interface CandidateComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  albumIndex: number;
  matchedAlbum: MatchedAlbum;
  allMatchedAlbums: MatchedAlbum[];
  token: string;
  onSelectCandidate: (albumIndex: number, candidate: ScoredCandidate) => Promise<void>;
}

export const CandidateComparisonModal: React.FC<CandidateComparisonModalProps> = ({
  isOpen,
  onClose,
  albumIndex,
  matchedAlbum,
  allMatchedAlbums,
  token,
  onSelectCandidate,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  const [loadingDetails, setLoadingDetails] = useState<Record<string, boolean>>({});
  const [candidateMetadata, setCandidateMetadata] = useState<Record<string, CandidateDetails>>({});
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [swapError, setSwapError] = useState<string | null>(null);

  // Focus trap & Escape key listener
  useEffect(() => {
    if (!isOpen) return;

    previousActiveElement.current = document.activeElement as HTMLElement;
    modalRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          lastElement.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          firstElement.focus();
          e.preventDefault();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousActiveElement.current?.focus();
    };
  }, [isOpen, onClose]);

  // Lazy-load duration, explicit, and playability metadata for candidates
  useEffect(() => {
    if (!isOpen || !matchedAlbum.candidates || matchedAlbum.candidates.length === 0) return;

    const controller = new AbortController();

    matchedAlbum.candidates.forEach(async candidate => {
      // If already cached in state or candidate is the active album whose tracks we already have
      if (candidateMetadata[candidate.id]) return;

      if (candidate.id === matchedAlbum.album.id && matchedAlbum.trackObjects) {
        const totalDurationMs = matchedAlbum.trackObjects.reduce(
          (sum, t) => sum + (t.duration_ms || 0),
          0
        );
        setCandidateMetadata(prev => ({
          ...prev,
          [candidate.id]: {
            albumId: candidate.id,
            tracks: matchedAlbum.trackObjects,
            totalDurationMs,
            hasExplicit: hasExplicitTracks(matchedAlbum.trackObjects),
            isPlayable: !getPlayabilityWarning(matchedAlbum.trackObjects),
          },
        }));
        return;
      }

      setLoadingDetails(prev => ({ ...prev, [candidate.id]: true }));
      try {
        const details = await getCandidateDetails(candidate.id, token, controller.signal);
        if (!controller.signal.aborted) {
          setCandidateMetadata(prev => ({ ...prev, [candidate.id]: details }));
        }
      } catch {
        // Fall through gracefully if candidate details fail
      } finally {
        if (!controller.signal.aborted) {
          setLoadingDetails(prev => ({ ...prev, [candidate.id]: false }));
        }
      }
    });

    return () => {
      controller.abort();
    };
  }, [isOpen, matchedAlbum, token, candidateMetadata]);

  if (!isOpen) return null;

  const handleSelect = async (candidate: ScoredCandidate) => {
    if (candidate.id === matchedAlbum.album.id || switchingId !== null) return;
    setSwitchingId(candidate.id);
    setSwapError(null);

    try {
      await onSelectCandidate(albumIndex, candidate);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to switch album edition';
      setSwapError(msg);
    } finally {
      setSwitchingId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="comparison-title"
      ref={modalRef}
      tabIndex={-1}
    >
      <div className="w-full max-w-2xl bg-[#1e1e1e] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between">
          <div>
            <h2 id="comparison-title" className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <Disc size={18} className="text-spotify-green" />
              <span>Compare Candidate Editions</span>
            </h2>
            <p className="text-xs text-spotify-light-gray mt-0.5">
              Original input: <span className="font-mono text-white/90">"{matchedAlbum.originalInput}"</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-spotify-light-gray hover:text-white transition-colors"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Error notification if swap fails */}
        {swapError && (
          <div className="mx-4 sm:mx-5 mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0 text-red-400" />
            <span>{swapError}</span>
          </div>
        )}

        {/* Candidate List */}
        <div className="p-4 sm:p-5 space-y-3 overflow-y-auto divide-y divide-white/5">
          {matchedAlbum.candidates.map((candidate, idx) => {
            const isCurrent = candidate.id === matchedAlbum.album.id;
            const meta = candidateMetadata[candidate.id];
            const isLoading = loadingDetails[candidate.id];
            const isSwitchingThis = switchingId === candidate.id;

            // Check if this album is already matched on another line in the catalog
            const matchedOnOtherLine = allMatchedAlbums.some(
              (m, i) => i !== albumIndex && m.album.id === candidate.id
            );

            const scorePercent = Math.round((candidate.matchScore || 0) * 100);
            const releaseYear = candidate.release_date
              ? candidate.release_date.split('-')[0]
              : 'Unknown Year';

            const coverUrl =
              candidate.images && candidate.images.length > 0
                ? candidate.images[candidate.images.length - 1].url
                : 'https://via.placeholder.com/64';

            return (
              <div
                key={`${candidate.id}-${idx}`}
                className={`pt-3 first:pt-0 p-3 rounded-xl transition-all ${
                  isCurrent
                    ? 'bg-spotify-green/[0.07] border border-spotify-green/30'
                    : 'bg-white/[0.02] hover:bg-white/[0.04] border border-white/5'
                }`}
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <img
                      src={coverUrl}
                      alt={`Cover art for ${candidate.name}`}
                      className="w-14 h-14 rounded-lg object-cover shadow shrink-0"
                      loading="lazy"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-white truncate" title={candidate.name}>
                          {candidate.name}
                        </h3>
                        {candidate.matchScore !== undefined && (
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded font-bold border shrink-0 ${
                              scorePercent >= 80
                                ? 'bg-spotify-green/10 text-spotify-green border-spotify-green/20'
                                : scorePercent >= 50
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                : 'bg-red-500/10 text-red-400 border-red-500/20'
                            }`}
                          >
                            {scorePercent}% match
                          </span>
                        )}
                        {candidate.album_type && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded font-medium bg-white/10 text-spotify-light-gray capitalize">
                            {candidate.album_type}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-spotify-light-gray truncate mt-0.5">
                        {candidate.artists.map(a => a.name).join(', ')} • {releaseYear}
                        {candidate.total_tracks ? ` • ${candidate.total_tracks} tracks` : ''}
                      </p>

                      {/* Lazy loaded details (duration, explicit, playability) */}
                      <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px]">
                        {isLoading ? (
                          <span className="text-spotify-light-gray flex items-center gap-1">
                            <Loader2 size={10} className="animate-spin" /> Loading edition details...
                          </span>
                        ) : meta ? (
                          <>
                            {meta.totalDurationMs > 0 && (
                              <span className="text-white/80 font-mono">
                                {formatDuration(meta.totalDurationMs)}
                              </span>
                            )}
                            {meta.hasExplicit && (
                              <span className="px-1.5 py-0.2 rounded font-semibold text-[9px] bg-red-500/20 text-red-400 border border-red-500/30">
                                Contains explicit tracks
                              </span>
                            )}
                            {!meta.isPlayable && (
                              <span className="text-amber-400 flex items-center gap-1 font-medium">
                                <AlertTriangle size={11} /> Unavailable in your region
                              </span>
                            )}
                          </>
                        ) : null}

                        {matchedOnOtherLine && (
                          <span className="text-amber-400 flex items-center gap-1 font-medium">
                            <AlertTriangle size={11} /> Already matched on another line
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action button */}
                  <div className="self-end sm:self-center shrink-0">
                    {isCurrent ? (
                      <span className="px-3 py-1.5 rounded-full bg-spotify-green/20 text-spotify-green font-bold text-xs flex items-center gap-1 border border-spotify-green/30">
                        <Check size={13} strokeWidth={3} />
                        <span>Active Edition</span>
                      </span>
                    ) : (
                      <button
                        onClick={() => handleSelect(candidate)}
                        disabled={switchingId !== null}
                        className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-spotify-green hover:text-black text-white font-medium text-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
                      >
                        {isSwitchingThis ? (
                          <>
                            <Loader2 size={12} className="animate-spin" />
                            <span>Switching...</span>
                          </>
                        ) : (
                          <span>Select this edition</span>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-black/20 flex items-center justify-between">
          <span className="text-xs text-spotify-light-gray">
            {matchedAlbum.candidates.length} candidate edition(s) available
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 text-white font-medium text-xs transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
