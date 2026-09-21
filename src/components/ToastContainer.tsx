import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useAppStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full px-4">
      {toasts.map(t => {
        let icon = <Info size={18} className="text-blue-400 shrink-0" />;
        let border = 'border-blue-500/30 bg-[#1f242d]';

        if (t.type === 'success') {
          icon = <CheckCircle2 size={18} className="text-spotify-green shrink-0" />;
          border = 'border-spotify-green/30 bg-[#18261e]';
        } else if (t.type === 'error') {
          icon = <AlertCircle size={18} className="text-red-400 shrink-0" />;
          border = 'border-red-500/30 bg-[#281c1c]';
        }

        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-xl text-white text-xs backdrop-blur-md animate-in slide-in-from-bottom-2 ${border}`}
          >
            {icon}
            <span className="flex-1 font-medium leading-relaxed">{t.message}</span>
            <button
              onClick={() => removeToast(t.id)}
              className="text-spotify-light-gray/60 hover:text-white transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
