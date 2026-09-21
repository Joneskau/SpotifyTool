import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { Play, Pause, XCircle, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

interface ProgressBannerProps {
  onResumePublish?: () => void;
  onCancelPublish?: () => void;
}

export const ProgressBanner: React.FC<ProgressBannerProps> = ({
  onResumePublish,
  onCancelPublish,
}) => {
  const {
    progress,
    detailedProgress,
    isProcessing,
    isCancelled,
    setIsCancelled,
    publishSession,
    clearPublishSession,
  } = useAppStore();

  const isPublishPaused = publishSession?.isPaused || detailedProgress.stage === 'paused';
  const isPublishActive = detailedProgress.stage === 'publishing';
  const isSearchActive = isProcessing || detailedProgress.stage === 'searching' || detailedProgress.stage === 'matching';

  // Do not display if completely idle and nothing in flight
  if (
    !isProcessing &&
    !isPublishPaused &&
    !isPublishActive &&
    detailedProgress.stage === 'idle' &&
    progress.current === 0
  ) {
    return null;
  }

  // Calculate percentage
  let percentage = 0;
  if (isPublishActive || isPublishPaused) {
    const total = detailedProgress.addingTracks.total || publishSession?.totalTracks || 0;
    const current = detailedProgress.addingTracks.current || 0;
    percentage = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  } else if (detailedProgress.searching.total > 0) {
    percentage = Math.min(
      100,
      Math.round((detailedProgress.searching.current / detailedProgress.searching.total) * 100)
    );
  } else if (progress.total > 0) {
    percentage = Math.min(100, Math.round((progress.current / progress.total) * 100));
  }

  // Calculate ETA
  let etaText = '';
  const startTime = detailedProgress.startTime || progress.startTime;
  const currentCount = isPublishActive
    ? detailedProgress.addingTracks.current
    : detailedProgress.searching.current || progress.current;
  const totalCount = isPublishActive
    ? detailedProgress.addingTracks.total || publishSession?.totalTracks || 0
    : detailedProgress.searching.total || progress.total;

  if (startTime && currentCount > 0 && currentCount < totalCount) {
    const elapsed = Date.now() - startTime;
    const avgPerItem = elapsed / currentCount;
    const remainingMs = (totalCount - currentCount) * avgPerItem;

    if (remainingMs > 60000) {
      etaText = `~${Math.ceil(remainingMs / 60000)} min remaining`;
    } else if (remainingMs > 1000) {
      etaText = `~${Math.ceil(remainingMs / 1000)}s remaining`;
    } else {
      etaText = 'Almost done...';
    }
  }

  // Badge configuration based on stage
  const getStageBadge = () => {
    if (isPublishPaused) {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1.5">
          <Pause size={12} /> Paused
        </span>
      );
    }
    if (isPublishActive) {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-spotify-green/20 text-spotify-green border border-spotify-green/30 flex items-center gap-1.5">
          <Loader2 size={12} className="animate-spin" /> Publishing
        </span>
      );
    }
    if (detailedProgress.stage === 'searching') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center gap-1.5">
          <Loader2 size={12} className="animate-spin" /> Searching
        </span>
      );
    }
    if (detailedProgress.stage === 'matching') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center gap-1.5">
          <Loader2 size={12} className="animate-spin" /> Matching
        </span>
      );
    }
    if (detailedProgress.stage === 'completed') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-spotify-green/20 text-spotify-green border border-spotify-green/30 flex items-center gap-1.5">
          <CheckCircle2 size={12} /> Completed
        </span>
      );
    }
    if (detailedProgress.stage === 'failed') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1.5">
          <AlertCircle size={12} /> Failed
        </span>
      );
    }
    return null;
  };

  return (
    <div className="w-full bg-[#181818] border border-white/10 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
      {/* Header & Status */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          {getStageBadge()}
          <span className="text-sm font-semibold text-white">
            {isPublishPaused
              ? 'Publishing was interrupted'
              : isPublishActive
              ? 'Publishing tracks to Spotify...'
              : 'Processing album catalog...'}
          </span>
        </div>
        <span className="text-spotify-green font-bold text-sm">{percentage}%</span>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ease-out ${
            isPublishPaused ? 'bg-amber-400' : 'bg-spotify-green'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Detailed 4-Metric Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
        {/* Searching albums */}
        <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 flex flex-col">
          <span className="text-[11px] text-spotify-light-gray">Searching albums</span>
          <span className="text-sm font-semibold text-white font-mono mt-0.5">
            {detailedProgress.searching.current} / {detailedProgress.searching.total}
          </span>
        </div>

        {/* Matching albums */}
        <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 flex flex-col">
          <span className="text-[11px] text-spotify-light-gray">Matching albums</span>
          <span className="text-sm font-semibold text-white font-mono mt-0.5">
            {detailedProgress.matching.current} / {detailedProgress.matching.total}
          </span>
        </div>

        {/* Adding tracks */}
        <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 flex flex-col">
          <span className="text-[11px] text-spotify-light-gray">Adding tracks</span>
          <span className="text-sm font-semibold text-white font-mono mt-0.5">
            {detailedProgress.addingTracks.current} / {detailedProgress.addingTracks.total}
          </span>
        </div>

        {/* Failed items */}
        <div
          className={`p-2.5 rounded-xl border flex flex-col ${
            detailedProgress.failedCount > 0
              ? 'bg-red-500/10 border-red-500/30'
              : 'bg-white/[0.03] border-white/5'
          }`}
        >
          <span
            className={`text-[11px] ${
              detailedProgress.failedCount > 0 ? 'text-red-300 font-medium' : 'text-spotify-light-gray'
            }`}
          >
            Failed items
          </span>
          <span
            className={`text-sm font-semibold font-mono mt-0.5 ${
              detailedProgress.failedCount > 0 ? 'text-red-400 font-bold' : 'text-white'
            }`}
          >
            {detailedProgress.failedCount}
          </span>
        </div>
      </div>

      {/* Subtext, Status Message & Action Buttons */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1 border-t border-white/5 text-xs">
        <div className="text-spotify-light-gray truncate max-w-full sm:max-w-[65%]">
          {detailedProgress.statusMessage ? (
            <span className={isPublishPaused ? 'text-amber-300' : 'text-spotify-light-gray'}>
              {detailedProgress.statusMessage}
            </span>
          ) : detailedProgress.currentItem ? (
            <span>Processing: {detailedProgress.currentItem}</span>
          ) : (
            <span>{etaText}</span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          {isPublishPaused && (
            <>
              {onResumePublish && (
                <button
                  onClick={onResumePublish}
                  className="px-3.5 py-1.5 rounded-full bg-spotify-green hover:bg-spotify-green-hover text-black font-bold text-xs shadow-md shadow-spotify-green/20 flex items-center gap-1.5 transition-all"
                >
                  <Play size={13} fill="currentColor" />
                  <span>Resume Publishing</span>
                </button>
              )}
              <button
                onClick={() => {
                  clearPublishSession();
                  onCancelPublish?.();
                }}
                className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-white text-xs flex items-center gap-1.5 transition-colors"
              >
                <XCircle size={13} />
                <span>Discard Session</span>
              </button>
            </>
          )}

          {isSearchActive && !isCancelled && (
            <button
              onClick={() => setIsCancelled(true)}
              className="px-3 py-1 rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-400 font-medium text-xs transition-colors"
            >
              Cancel
            </button>
          )}

          {isCancelled && <span className="text-red-400 font-medium">Stopping...</span>}
        </div>
      </div>
    </div>
  );
};

