import React, { useRef, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Terminal, Check, AlertTriangle, Info, Trash2 } from 'lucide-react';

export const StatusLog: React.FC = () => {
  const { statusLogs, clearStatusLogs } = useAppStore();
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [statusLogs]);

  if (statusLogs.length === 0) return null;

  return (
    <div className="w-full bg-black/60 border border-white/10 rounded-xl p-3 font-mono text-xs text-spotify-light-gray space-y-2">
      <div className="flex items-center justify-between pb-2 border-b border-white/10 text-[11px] font-sans font-semibold text-white">
        <div className="flex items-center gap-1.5 text-spotify-light-gray">
          <Terminal size={14} />
          <span>Status Console</span>
        </div>
        <button
          onClick={clearStatusLogs}
          className="text-spotify-light-gray/60 hover:text-white transition-colors"
          title="Clear logs"
        >
          <Trash2 size={13} />
        </button>
      </div>

      <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
        {statusLogs.map(log => {
          let icon = <Info size={12} className="text-blue-400 shrink-0" />;
          let color = 'text-spotify-light-gray';

          if (log.type === 'success') {
            icon = <Check size={12} className="text-spotify-green shrink-0" />;
            color = 'text-spotify-green';
          } else if (log.type === 'error') {
            icon = <AlertTriangle size={12} className="text-red-400 shrink-0" />;
            color = 'text-red-400';
          }

          return (
            <div key={log.id} className={`flex items-start gap-2 ${color} leading-5`}>
              <span className="mt-0.5">{icon}</span>
              <span className="break-all">{log.text}</span>
            </div>
          );
        })}
        <div ref={logEndRef} />
      </div>
    </div>
  );
};
