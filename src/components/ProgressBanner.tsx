import React from 'react';
import { useAppStore } from '../store/useAppStore';

export const ProgressBanner: React.FC = () => {
  const { progress, isProcessing, isCancelled, setIsCancelled } = useAppStore();

  if (!isProcessing && progress.current === 0) return null;

  const percentage =
    progress.total > 0 ? Math.min(100, Math.round((progress.current / progress.total) * 100)) : 0;

  // Calculate ETA
  let etaText = '';
  if (progress.startTime && progress.current > 0 && progress.current < progress.total) {
    const elapsed = Date.now() - progress.startTime;
    const avgPerItem = elapsed / progress.current;
    const remainingMs = (progress.total - progress.current) * avgPerItem;

    if (remainingMs > 60000) {
      etaText = `~${Math.ceil(remainingMs / 60000)} min remaining`;
    } else if (remainingMs > 1000) {
      etaText = `~${Math.ceil(remainingMs / 1000)}s remaining`;
    } else {
      etaText = 'Almost done...';
    }
  }

  return (
    <div className="w-full bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between text-xs font-medium text-white">
        <span className="truncate max-w-[70%]">
          {progress.currentItem
            ? `Processing ${progress.current} of ${progress.total}: ${progress.currentItem}`
            : `Processing ${progress.current} of ${progress.total} albums...`}
        </span>
        <span className="text-spotify-green font-bold">{percentage}%</span>
      </div>

      <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full bg-spotify-green rounded-full transition-all duration-300 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[11px] text-spotify-light-gray">
        <span>{etaText}</span>
        {isProcessing && !isCancelled && (
          <button
            onClick={() => setIsCancelled(true)}
            className="px-2.5 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 font-medium transition-colors"
          >
            Cancel
          </button>
        )}
        {isCancelled && <span className="text-red-400 font-medium">Stopping...</span>}
      </div>
    </div>
  );
};
