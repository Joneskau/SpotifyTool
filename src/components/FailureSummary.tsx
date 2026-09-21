import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { searchAlbumWithStrategies, getAlbumTracks } from '../services/spotifyApi';
import { AlertCircle, RotateCcw, X, Copy, Check } from 'lucide-react';

export const FailureSummary: React.FC = () => {
  const {
    failedAlbums,
    removeFailedAlbum,
    clearFailedAlbums,
    setMatchedAlbums,
    matchedAlbums,
    setAlbumListText,
    accessToken,
    addToast,
    addStatusLog,
  } = useAppStore();

  const [queries, setQueries] = useState<{ [index: number]: string }>({});
  const [retryingIndex, setRetryingIndex] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  if (failedAlbums.length === 0) return null;

  const handleQueryChange = (index: number, val: string) => {
    setQueries(prev => ({ ...prev, [index]: val }));
  };

  const handleRetrySingle = async (index: number) => {
    if (!accessToken) return;
    const failedItem = failedAlbums[index];
    const query = queries[index] !== undefined ? queries[index] : `${failedItem.artist} - ${failedItem.albumName}`;

    const parts = query.split(' - ');
    if (parts.length < 2) {
      addToast('Use format: Artist - Album', 'error');
      return;
    }

    const artist = parts[0].trim();
    const albumName = parts.slice(1).join(' - ').trim();

    setRetryingIndex(index);
    try {
      const result = await searchAlbumWithStrategies(artist, albumName, accessToken);
      if (!result || result.candidates.length === 0) {
        addToast(`Still not found: "${artist} - ${albumName}"`, 'error');
        return;
      }

      const best = result.best;
      const tracks = await getAlbumTracks(best.id, accessToken);

      setMatchedAlbums([
        ...matchedAlbums,
        {
          status: 'found',
          artist,
          album: best,
          candidates: result.candidates,
          trackUris: tracks.map(t => t.uri),
          trackObjects: tracks,
        },
      ]);

      removeFailedAlbum(index);
      addToast(`Found: ${best.name}!`, 'success');
      addStatusLog(`Found on retry: ${best.name} - ${artist}`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Retry failed';
      addToast(msg, 'error');
    } finally {
      setRetryingIndex(null);
    }
  };

  const handleSelectSuggestion = async (index: number, candidateIndex: number) => {
    if (!accessToken) return;
    const failedItem = failedAlbums[index];
    if (!failedItem.partialMatches) return;
    const selected = failedItem.partialMatches[candidateIndex];
    if (!selected) return;

    try {
      addToast(`Loading ${selected.name}...`, 'info');
      const tracks = await getAlbumTracks(selected.id, accessToken);
      setMatchedAlbums([
        ...matchedAlbums,
        {
          status: 'found',
          artist: failedItem.artist,
          album: selected,
          candidates: failedItem.partialMatches,
          trackUris: tracks.map(t => t.uri),
          trackObjects: tracks,
        },
      ]);
      removeFailedAlbum(index);
      addToast(`Added: ${selected.name}!`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to add suggestion';
      addToast(msg, 'error');
    }
  };

  const handleCopy = () => {
    const text = failedAlbums
      .map((f, i) => queries[i] || `${f.artist} - ${f.albumName}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    addToast('Copied failed albums to clipboard', 'info');
  };

  const handleRetryAll = () => {
    const updatedLines = failedAlbums
      .map((f, i) => (queries[i] || `${f.artist} - ${f.albumName}`).trim())
      .filter(l => l.includes(' - '));

    setAlbumListText(updatedLines.join('\n'));
    clearFailedAlbums();
    // Re-trigger via parent or store
    addToast('Updated album list with failed items. Click Search to re-run.', 'info');
  };

  return (
    <div className="w-full rounded-xl bg-red-500/10 border border-red-500/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-red-400 flex items-center gap-2">
          <AlertCircle size={16} />
          <span>{failedAlbums.length} Album(s) Not Found</span>
        </h3>
        <span className="text-xs text-spotify-light-gray">
          Edit query and retry, pick a suggestion, or remove.
        </span>
      </div>

      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
        {failedAlbums.map((failed, index) => {
          const currentQuery =
            queries[index] !== undefined
              ? queries[index]
              : `${failed.artist} - ${failed.albumName}`;

          return (
            <div
              key={index}
              className="p-2.5 rounded-lg bg-black/30 border border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs"
            >
              <input
                type="text"
                value={currentQuery}
                onChange={e => handleQueryChange(index, e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleRetrySingle(index);
                }}
                disabled={retryingIndex === index}
                className="w-full sm:flex-1 p-2 bg-white/5 border border-white/10 rounded text-white focus:outline-none focus:border-spotify-green font-mono"
              />

              <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                {failed.partialMatches && failed.partialMatches.length > 0 && (
                  <select
                    onChange={e =>
                      handleSelectSuggestion(index, parseInt(e.target.value, 10))
                    }
                    className="p-1.5 bg-white/10 border border-white/10 rounded text-spotify-light-gray text-[11px] focus:text-white"
                  >
                    <option value="">💡 Suggestions...</option>
                    {failed.partialMatches.map((m, i) => (
                      <option key={m.id} value={i} className="bg-[#242424] text-white">
                        {m.name}
                      </option>
                    ))}
                  </select>
                )}

                <button
                  onClick={() => handleRetrySingle(index)}
                  disabled={retryingIndex === index}
                  className="px-2.5 py-1.5 rounded bg-white/10 hover:bg-white/20 text-white font-medium flex items-center gap-1 transition-colors"
                >
                  <RotateCcw
                    size={12}
                    className={retryingIndex === index ? 'animate-spin' : ''}
                  />
                  <span>Retry</span>
                </button>

                <button
                  onClick={() => removeFailedAlbum(index)}
                  className="p-1.5 rounded bg-white/5 hover:bg-red-500/20 text-spotify-light-gray hover:text-red-400 transition-colors"
                  title="Remove from failed list"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-red-500/20">
        <button
          onClick={handleRetryAll}
          className="flex-1 py-2 px-3 rounded-lg bg-red-500/80 hover:bg-red-500 text-white font-semibold text-xs transition-colors"
        >
          🔄 Send All to Editor ({failedAlbums.length})
        </button>
        <button
          onClick={clearFailedAlbums}
          className="py-2 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs transition-colors"
        >
          Clear All
        </button>
        <button
          onClick={handleCopy}
          className="py-2 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs flex items-center gap-1.5 transition-colors"
        >
          {copied ? <Check size={13} className="text-spotify-green" /> : <Copy size={13} />}
          <span>Copy</span>
        </button>
      </div>
    </div>
  );
};
