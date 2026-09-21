import React, { useEffect, useRef, useState } from 'react';
import { MatchedAlbum, ScoredCandidate } from '../types/app';
import { searchSingleAlbumCandidates } from '../services/spotifyApi';
import { X, Search, Loader2, Disc, AlertTriangle, AlertCircle } from 'lucide-react';

interface ManualSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  albumIndex: number;
  matchedAlbum: MatchedAlbum;
  allMatchedAlbums: MatchedAlbum[];
  token: string;
  onSelectReplacement: (albumIndex: number, candidate: ScoredCandidate) => Promise<void>;
}

export const ManualSearchModal: React.FC<ManualSearchModalProps> = ({
  isOpen,
  onClose,
  albumIndex,
  matchedAlbum,
  allMatchedAlbums,
  token,
  onSelectReplacement,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<ScoredCandidate[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize query from matchedAlbum on open
  useEffect(() => {
    if (isOpen) {
      setQuery(`${matchedAlbum.artist} ${matchedAlbum.album.name}`.trim());
      setResults([]);
      setHasSearched(false);
      setErrorMessage(null);
    }
  }, [isOpen, matchedAlbum]);

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

  if (!isOpen) return null;

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = query.trim();
    if (!clean) return;

    // Abort previous in-flight search
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setIsSearching(true);
    setErrorMessage(null);

    try {
      const found = await searchSingleAlbumCandidates(
        clean,
        token,
        abortControllerRef.current.signal
      );
      setResults(found);
      setHasSearched(true);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : 'Search request failed';
      setErrorMessage(msg);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelect = async (candidate: ScoredCandidate) => {
    if (replacingId !== null) return;
    setReplacingId(candidate.id);
    setErrorMessage(null);

    try {
      await onSelectReplacement(albumIndex, candidate);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to replace album match';
      setErrorMessage(msg);
    } finally {
      setReplacingId(null);
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
      aria-labelledby="manual-search-title"
      ref={modalRef}
      tabIndex={-1}
    >
      <div className="w-full max-w-2xl bg-[#1e1e1e] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between">
          <div>
            <h2 id="manual-search-title" className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <Search size={18} className="text-spotify-green" />
              <span>Manual Match Override</span>
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

        {/* Search Input Form */}
        <form onSubmit={handleSearch} className="p-4 sm:p-5 border-b border-white/10 flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="e.g. Radiohead OK Computer Remastered"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-black/40 border border-white/15 text-white placeholder-spotify-light-gray text-xs sm:text-sm focus:outline-none focus:border-spotify-green"
              autoFocus
            />
            <Search size={15} className="absolute left-3 top-3 text-spotify-light-gray" />
          </div>
          <button
            type="submit"
            disabled={isSearching || !query.trim()}
            className="px-4 py-2.5 rounded-xl bg-spotify-green hover:bg-spotify-green-hover text-black font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-md shadow-spotify-green/20 disabled:opacity-50 transition-all shrink-0"
          >
            {isSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            <span>Search</span>
          </button>
        </form>

        {/* Error notification */}
        {errorMessage && (
          <div className="mx-4 sm:mx-5 mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0 text-red-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Results List */}
        <div className="p-4 sm:p-5 space-y-3 overflow-y-auto flex-1 divide-y divide-white/5">
          {isSearching && (
            <div className="py-12 text-center text-spotify-light-gray text-xs flex flex-col items-center gap-2">
              <Loader2 size={24} className="animate-spin text-spotify-green" />
              <span>Searching Spotify for "{query}"...</span>
            </div>
          )}

          {!isSearching && hasSearched && results.length === 0 && (
            <div className="py-12 text-center text-spotify-light-gray text-xs">
              No albums found matching "{query}". Try adjusting your keywords.
            </div>
          )}

          {!isSearching && !hasSearched && (
            <div className="py-12 text-center text-spotify-light-gray text-xs flex flex-col items-center gap-1.5">
              <Disc size={28} className="text-white/20" />
              <span>Modify the search keywords above and click Search to find matches on Spotify.</span>
            </div>
          )}

          {!isSearching &&
            results.map((candidate, idx) => {
              const isCurrentlyMatched = candidate.id === matchedAlbum.album.id;
              const isReplacingThis = replacingId === candidate.id;
              const matchedOnOtherLine = allMatchedAlbums.some(
                (m, i) => i !== albumIndex && m.album.id === candidate.id
              );
              const releaseYear = candidate.release_date
                ? candidate.release_date.split('-')[0]
                : 'Unknown';

              const coverUrl =
                candidate.images && candidate.images.length > 0
                  ? candidate.images[candidate.images.length - 1].url
                  : 'https://via.placeholder.com/64';

              return (
                <div
                  key={`${candidate.id}-${idx}`}
                  className={`pt-3 first:pt-0 p-3 rounded-xl transition-all ${
                    isCurrentlyMatched
                      ? 'bg-spotify-green/[0.07] border border-spotify-green/30'
                      : 'bg-white/[0.02] hover:bg-white/[0.04] border border-white/5'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <img
                        src={coverUrl}
                        alt={`Cover art for ${candidate.name}`}
                        className="w-13 h-13 rounded-lg object-cover shadow shrink-0"
                        loading="lazy"
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-white truncate" title={candidate.name}>
                            {candidate.name}
                          </h3>
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

                        {matchedOnOtherLine && (
                          <div className="text-amber-400 flex items-center gap-1 font-medium text-[11px] mt-1">
                            <AlertTriangle size={11} /> Already matched on another line
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="self-end sm:self-center shrink-0">
                      <button
                        onClick={() => handleSelect(candidate)}
                        disabled={replacingId !== null || isCurrentlyMatched}
                        className={`px-3 py-1.5 rounded-full font-medium text-xs flex items-center gap-1.5 transition-all ${
                          isCurrentlyMatched
                            ? 'bg-white/5 text-spotify-light-gray border border-white/10 opacity-60'
                            : 'bg-spotify-green text-black font-bold hover:bg-spotify-green-hover'
                        }`}
                      >
                        {isReplacingThis ? (
                          <>
                            <Loader2 size={12} className="animate-spin" />
                            <span>Applying...</span>
                          </>
                        ) : isCurrentlyMatched ? (
                          <span>Current Match</span>
                        ) : (
                          <span>Select Match</span>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-black/20 flex items-center justify-between">
          <span className="text-xs text-spotify-light-gray">
            {results.length > 0 ? `${results.length} result(s) returned` : 'Manual query override'}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 text-white font-medium text-xs transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
