import React, { useState } from 'react';
import { useAppStore, selectStatusMetrics } from '../store/useAppStore';
import {
  generateStatusSummary,
  generateStatusDetails,
} from '../utils/errorFeedback';
import {
  Activity,
  AlertTriangle,
  AlertCircle,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Disc3,
  Layers,
  Music,
  RefreshCw,
  Clock,
  ExternalLink,
} from 'lucide-react';

interface StatusCenterProps {
  onFilterWarnings?: () => void;
  onFilterErrors?: () => void;
  onFilterDuplicates?: () => void;
  onReconnect?: () => void;
  onResumePublish?: () => void;
}

export const StatusCenter: React.FC<StatusCenterProps> = ({
  onFilterWarnings,
  onFilterErrors,
  onFilterDuplicates,
  onReconnect,
  onResumePublish,
}) => {
  const store = useAppStore();
  const metrics = selectStatusMetrics(store);
  const { sessionError, setSessionError, eventLogs, failedAlbums, publishFailures, addToast } =
    store;

  const [isExpanded, setIsExpanded] = useState(false);
  const [showEventLog, setShowEventLog] = useState(false);
  const [copiedType, setCopiedType] = useState<'summary' | 'details' | null>(null);

  const hasContent =
    metrics.processing.total > 0 ||
    metrics.warnings.total > 0 ||
    metrics.errors.total > 0 ||
    metrics.tracksReady.total > 0 ||
    sessionError !== null;

  if (!hasContent) {
    return null;
  }

  const handleCopy = async (type: 'summary' | 'details') => {
    try {
      const textToCopy =
        type === 'summary'
          ? generateStatusSummary(metrics)
          : generateStatusDetails(metrics, eventLogs, failedAlbums, publishFailures);

      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        // Fallback for non-secure contexts
        const textarea = document.createElement('textarea');
        textarea.value = textToCopy;
        textarea.style.position = 'fixed';
        textarea.style.left = '-999999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 2500);
      addToast(
        type === 'summary' ? 'Status summary copied to clipboard' : 'Diagnostic report copied',
        'success'
      );
    } catch {
      addToast('Failed to copy to clipboard. Please allow clipboard permissions.', 'error');
    }
  };

  const isProcessing = metrics.processing.status === 'processing';

  return (
    <section
      aria-label="Status Center"
      className="w-full bg-[#181818] border border-white/10 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl transition-all"
    >
      {/* Session-Level Error Banner (Single persistent banner on 401, 403 scope, offline) */}
      {sessionError && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-white space-y-2 animate-in fade-in duration-200"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-red-300">{sessionError.title}</h3>
                <p className="text-xs text-white/80 mt-0.5">{sessionError.detail}</p>
              </div>
            </div>
            {sessionError.action && (
              <button
                onClick={() => {
                  if (sessionError.action?.type === 'reconnect') {
                    onReconnect?.();
                  } else if (sessionError.action?.type === 'resume') {
                    setSessionError(null);
                    onResumePublish?.();
                  } else {
                    setSessionError(null);
                  }
                }}
                className="px-3 py-1.5 rounded-full bg-red-500/80 hover:bg-red-500 text-white font-semibold text-xs shrink-0 transition-colors"
              >
                {sessionError.action.label}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Header bar: Title & Summary Copy Actions */}
      <div className="flex items-center justify-between gap-2 pb-1 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-spotify-green" />
          <h2 className="text-sm font-bold text-white tracking-wide">Status Center</h2>
          {isProcessing && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center gap-1 font-medium">
              <RefreshCw size={11} className="animate-spin" /> In Progress
            </span>
          )}
        </div>

        {/* Action buttons: Copy Summary / Details & Mobile toggle */}
        <div className="flex items-center gap-1.5 text-xs">
          <button
            onClick={() => handleCopy('summary')}
            className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-spotify-light-gray hover:text-white flex items-center gap-1.5 transition-colors"
            title="Copy 5-line summary to clipboard"
          >
            {copiedType === 'summary' ? (
              <Check size={12} className="text-spotify-green" />
            ) : (
              <Copy size={12} />
            )}
            <span className="hidden sm:inline">
              {copiedType === 'summary' ? 'Copied' : 'Copy Summary'}
            </span>
          </button>

          <button
            onClick={() => handleCopy('details')}
            className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-spotify-light-gray hover:text-white flex items-center gap-1.5 transition-colors"
            title="Copy full diagnostic report (tokens redacted)"
          >
            {copiedType === 'details' ? (
              <Check size={12} className="text-spotify-green" />
            ) : (
              <ExternalLink size={12} />
            )}
            <span className="hidden sm:inline">
              {copiedType === 'details' ? 'Copied' : 'Copy Details'}
            </span>
          </button>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="sm:hidden p-1 rounded-lg bg-white/5 text-spotify-light-gray hover:text-white"
            aria-label={isExpanded ? 'Collapse status details' : 'Expand status details'}
          >
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* 5-Metric Responsive Grid */}
      <div
        className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 ${
          isExpanded ? 'block' : 'hidden sm:grid'
        }`}
      >
        {/* Metric 1: Processing */}
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-spotify-light-gray text-xs">
            <span className="font-medium">
              {metrics.processing.status === 'completed'
                ? 'Processed'
                : metrics.processing.status === 'processing'
                ? 'Processing'
                : 'Input Albums'}
            </span>
            <Disc3
              size={13}
              className={isProcessing ? 'animate-spin text-spotify-green' : 'text-spotify-light-gray'}
            />
          </div>
          <div className="mt-1 font-mono text-base font-bold text-white">
            {metrics.processing.current} / {metrics.processing.total}
          </div>
          <span className="text-[10px] text-spotify-light-gray/80 mt-0.5 truncate">
            {metrics.processing.total === 1 ? '1 album total' : `${metrics.processing.total} albums total`}
          </span>
        </div>

        {/* Metric 2: Warnings (Clickable to filter/review) */}
        <button
          type="button"
          onClick={onFilterWarnings}
          className={`p-3 rounded-xl border flex flex-col justify-between text-left transition-all hover:bg-amber-500/[0.04] focus:outline-none focus:ring-1 focus:ring-amber-500/50 ${
            metrics.warnings.total > 0
              ? 'bg-amber-500/[0.02] border-amber-500/30'
              : 'bg-white/[0.02] border-white/5'
          }`}
          title="Click to filter albums with warnings"
        >
          <div className="flex items-center justify-between text-xs">
            <span
              className={
                metrics.warnings.total > 0 ? 'text-amber-400 font-medium' : 'text-spotify-light-gray'
              }
            >
              Warnings
            </span>
            <AlertTriangle
              size={13}
              className={metrics.warnings.total > 0 ? 'text-amber-400' : 'text-spotify-light-gray/60'}
            />
          </div>
          <div
            className={`mt-1 font-mono text-base font-bold ${
              metrics.warnings.total > 0 ? 'text-amber-400' : 'text-white'
            }`}
          >
            {metrics.warnings.total}
          </div>
          <span className="text-[10px] text-spotify-light-gray/80 mt-0.5 truncate">
            {metrics.warnings.breakdown.marketRestricted > 0
              ? `${metrics.warnings.breakdown.marketRestricted} region restricted`
              : metrics.warnings.breakdown.lowConfidence > 0
              ? `${metrics.warnings.breakdown.lowConfidence} low confidence`
              : 'No warnings'}
          </span>
        </button>

        {/* Metric 3: Errors (Clickable to review failures) */}
        <button
          type="button"
          onClick={onFilterErrors}
          className={`p-3 rounded-xl border flex flex-col justify-between text-left transition-all hover:bg-red-500/[0.04] focus:outline-none focus:ring-1 focus:ring-red-500/50 ${
            metrics.errors.total > 0
              ? 'bg-red-500/[0.03] border-red-500/30'
              : 'bg-white/[0.02] border-white/5'
          }`}
          title="Click to view error details"
        >
          <div className="flex items-center justify-between text-xs">
            <span
              className={
                metrics.errors.total > 0 ? 'text-red-400 font-medium' : 'text-spotify-light-gray'
              }
            >
              Errors
            </span>
            <AlertCircle
              size={13}
              className={metrics.errors.total > 0 ? 'text-red-400' : 'text-spotify-light-gray/60'}
            />
          </div>
          <div
            className={`mt-1 font-mono text-base font-bold ${
              metrics.errors.total > 0 ? 'text-red-400' : 'text-white'
            }`}
          >
            {metrics.errors.total}
          </div>
          <span className="text-[10px] text-spotify-light-gray/80 mt-0.5 truncate">
            {metrics.errors.breakdown.notFound > 0
              ? `${metrics.errors.breakdown.notFound} not found`
              : metrics.errors.breakdown.searchFailed > 0
              ? `${metrics.errors.breakdown.searchFailed} search failed`
              : 'No errors'}
          </span>
        </button>

        {/* Metric 4: Duplicates (to skip or skipped) */}
        <button
          type="button"
          onClick={onFilterDuplicates}
          className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col justify-between text-left transition-all hover:bg-white/[0.04] focus:outline-none focus:ring-1 focus:ring-white/20"
          title="Click to highlight duplicate tracks"
        >
          <div className="flex items-center justify-between text-spotify-light-gray text-xs">
            <span className="font-medium">{metrics.duplicates.label}</span>
            <Layers size={13} className="text-spotify-light-gray" />
          </div>
          <div className="mt-1 font-mono text-base font-bold text-white">
            {metrics.duplicates.count}
          </div>
          <span className="text-[10px] text-spotify-light-gray/80 mt-0.5 truncate">
            {metrics.duplicates.isPostPublish ? 'Omitted from playlist' : 'Pending deduplication'}
          </span>
        </button>

        {/* Metric 5: Tracks Ready */}
        <div className="p-3 rounded-xl bg-spotify-green/[0.03] border border-spotify-green/20 flex flex-col justify-between">
          <div className="flex items-center justify-between text-spotify-green text-xs">
            <span className="font-semibold">Tracks ready</span>
            <Music size={13} className="text-spotify-green" />
          </div>
          <div className="mt-1 font-mono text-base font-bold text-spotify-green">
            {metrics.tracksReady.total}
          </div>
          <span className="text-[10px] text-spotify-light-gray/80 mt-0.5 truncate">
            {metrics.tracksReady.added !== undefined
              ? `${metrics.tracksReady.added} added to playlist`
              : 'Ready to commit'}
          </span>
        </div>
      </div>

      {/* Collapsible Recent Events Log */}
      {eventLogs.length > 0 && (
        <div className="pt-2 border-t border-white/5 space-y-2">
          <button
            type="button"
            onClick={() => setShowEventLog(!showEventLog)}
            className="w-full flex items-center justify-between text-xs text-spotify-light-gray hover:text-white transition-colors"
          >
            <span className="flex items-center gap-1.5 font-medium">
              <Clock size={13} />
              <span>Recent Activity ({eventLogs.length})</span>
            </span>
            {showEventLog ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          {showEventLog && (
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 font-mono text-[11px]">
              {eventLogs.slice(0, 15).map(ev => {
                let badgeColor = 'text-spotify-light-gray bg-white/5';
                if (ev.severity === 'warning') badgeColor = 'text-amber-400 bg-amber-500/10';
                else if (ev.severity === 'error') badgeColor = 'text-red-400 bg-red-500/10';
                else if (ev.severity === 'success') badgeColor = 'text-spotify-green bg-spotify-green/10';

                return (
                  <div
                    key={ev.id}
                    className="p-2 rounded-lg bg-black/40 border border-white/5 flex items-start justify-between gap-2"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`px-1.5 py-0.2 rounded text-[9px] uppercase font-semibold ${badgeColor}`}>
                          {ev.severity}
                        </span>
                        {ev.itemLabel && (
                          <span className="text-white/90 font-medium truncate">
                            {ev.itemLabel}
                          </span>
                        )}
                      </div>
                      <p className="text-spotify-light-gray leading-snug">{ev.message}</p>
                    </div>
                    <span className="text-[10px] text-spotify-light-gray/60 shrink-0">
                      {new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
