import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { initiateLogin, saveSessionSnapshot, logout } from '../services/spotifyAuth';
import { AlertTriangle, RefreshCw, CheckCircle2 } from 'lucide-react';

export const ReconnectModal: React.FC = () => {
  const {
    isSessionExpiredModalOpen,
    setIsSessionExpiredModalOpen,
    albumListText,
    matchedAlbums,
    selectedPlaylistId,
    newPlaylistName,
    tierOptions,
    storageType,
  } = useAppStore();

  if (!isSessionExpiredModalOpen) return null;

  const handleReconnect = () => {
    // Preserve entire current working session
    saveSessionSnapshot({
      albumListText,
      matchedAlbums,
      selectedPlaylistId,
      newPlaylistName,
      tierOptions,
      storageType,
    });

    initiateLogin(storageType);
  };

  const albumCount = albumListText.split('\n').filter(l => l.trim()).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="max-w-md w-full bg-[#1e1e1e] border border-amber-500/40 rounded-2xl p-6 shadow-2xl space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
            <AlertTriangle size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Session Expired</h3>
            <p className="text-xs text-spotify-light-gray">
              Your Spotify access token needs to be renewed.
            </p>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 space-y-2 text-xs">
          <div className="text-spotify-green font-semibold flex items-center gap-1.5">
            <CheckCircle2 size={14} />
            <span>Your work is safe and preserved</span>
          </div>
          <ul className="text-spotify-light-gray space-y-1 pl-4 list-disc text-[11px]">
            {albumCount > 0 && <li>{albumCount} album(s) entered in editor</li>}
            {matchedAlbums.length > 0 && <li>{matchedAlbums.length} matched album candidate(s)</li>}
            {selectedPlaylistId && <li>Target playlist selection & tiering rules</li>}
          </ul>
        </div>

        <p className="text-xs text-spotify-light-gray leading-relaxed">
          Click below to reconnect with Spotify. You will be redirected back immediately with your
          work fully restored.
        </p>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleReconnect}
            className="flex-1 py-3 px-4 rounded-full bg-spotify-green hover:bg-spotify-green-hover text-black font-bold text-sm shadow-lg shadow-spotify-green/20 flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
          >
            <RefreshCw size={16} />
            <span>Reconnect to Spotify</span>
          </button>
          <button
            onClick={() => {
              setIsSessionExpiredModalOpen(false);
              logout();
            }}
            className="py-3 px-4 rounded-full bg-white/10 hover:bg-white/15 text-white font-medium text-xs transition-all"
          >
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
};
