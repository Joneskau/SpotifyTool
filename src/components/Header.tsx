import React, { useState, useEffect } from 'react';
import { Sun, Moon, LogOut, Clock, Database, RefreshCw } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { logout, refreshAccessToken, getStoredTokenExpiry } from '../services/spotifyAuth';
import { useTheme } from '../hooks/useTheme';

export const Header: React.FC = () => {
  const {
    userProfile,
    accessToken,
    tokenExpiresAt,
    setTokenExpiresAt,
    storageType,
    setIsSessionExpiredModalOpen,
    addToast,
  } = useAppStore();
  const { theme, toggleTheme } = useTheme();

  const [timeLeftStr, setTimeLeftStr] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Sync token expiration on mount or when token updates
  useEffect(() => {
    if (accessToken && !tokenExpiresAt) {
      const expiry = getStoredTokenExpiry();
      if (expiry) {
        setTokenExpiresAt(expiry);
      }
    }
  }, [accessToken, tokenExpiresAt, setTokenExpiresAt]);

  // Live countdown timer
  useEffect(() => {
    if (!tokenExpiresAt) return;

    const updateTimer = () => {
      const now = Date.now();
      const diff = tokenExpiresAt - now;

      if (diff <= 0) {
        setTimeLeftStr('Expired');
        setIsSessionExpiredModalOpen(true);
        return;
      }

      const totalSeconds = Math.floor(diff / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;

      if (minutes >= 60) {
        const hours = Math.floor(minutes / 60);
        const remMins = minutes % 60;
        setTimeLeftStr(`${hours}h ${remMins}m`);
      } else {
        setTimeLeftStr(`${minutes}m ${seconds.toString().padStart(2, '0')}s`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [tokenExpiresAt, setIsSessionExpiredModalOpen]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      addToast('Renewing Spotify access token...', 'info');
      const newToken = await refreshAccessToken();
      if (newToken) {
        const expiry = getStoredTokenExpiry();
        setTokenExpiresAt(expiry);
        addToast('Spotify session renewed successfully', 'success');
      } else {
        setIsSessionExpiredModalOpen(true);
      }
    } catch {
      setIsSessionExpiredModalOpen(true);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <header className="relative w-full pb-4 pt-2">
      {/* Theme Toggle Top Right */}
      <div className="absolute right-0 top-0 flex items-center gap-2">
        <button
          onClick={toggleTheme}
          aria-label="Toggle dark/light theme"
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all border border-white/10"
        >
          {theme === 'dark' ? (
            <Moon size={15} className="text-yellow-300" />
          ) : (
            <Sun size={15} className="text-amber-500" />
          )}
        </button>
      </div>

      <div className="text-center pt-1">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
          <span>🎵</span> Spotify Album to Playlist
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-spotify-light-gray">
          Add albums to your Spotify playlists automatically
        </p>
      </div>

      {/* Session Status Bar (Visible when connected) */}
      {accessToken && userProfile && (
        <div className="mt-4 w-full bg-white/5 border border-white/10 rounded-2xl p-2.5 sm:p-3 flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm">
          {/* User badge */}
          <div className="flex items-center gap-2">
            <img
              src={
                userProfile.images?.[0]?.url ||
                'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'
              }
              alt={userProfile.display_name}
              className="w-6 h-6 rounded-full object-cover border border-spotify-green/60"
            />
            <span className="font-semibold text-white truncate max-w-[140px] sm:max-w-none">
              {userProfile.display_name}
            </span>
          </div>

          {/* Session Expiry & Storage Badges */}
          <div className="flex items-center flex-wrap gap-2 text-[11px]">
            {/* Storage indicator */}
            <span
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/40 border border-white/10 text-spotify-light-gray"
              title={`Tokens stored in browser ${storageType === 'session' ? 'sessionStorage (tab only)' : 'localStorage (persistent)'}`}
            >
              <Database size={11} className="text-spotify-green" />
              <span className="capitalize">{storageType}</span>
            </span>

            {/* Live Expiry Countdown */}
            {timeLeftStr && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/40 border border-white/10 text-spotify-light-gray">
                <Clock size={11} className="text-amber-400" />
                <span>Expires in:</span>
                <span className="font-mono font-semibold text-white">{timeLeftStr}</span>
                <button
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  className="ml-1 p-0.5 text-spotify-light-gray hover:text-white transition-colors"
                  title="Renew session now"
                >
                  <RefreshCw size={11} className={isRefreshing ? 'animate-spin' : ''} />
                </button>
              </div>
            )}

            {/* Disconnect Button */}
            <button
              onClick={logout}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all font-medium"
              title="Disconnect and clear stored session"
            >
              <LogOut size={11} />
              <span>Disconnect</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
