import React from 'react';
import { Sun, Moon, LogOut } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { logout } from '../services/spotifyAuth';
import { useTheme } from '../hooks/useTheme';

export const Header: React.FC = () => {
  const { userProfile, accessToken } = useAppStore();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="relative w-full pb-6 pt-2">
      {/* Theme Toggle Top Right */}
      <div className="absolute right-0 top-0 flex items-center gap-3">
        {accessToken && (
          <button
            onClick={logout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/20 text-white transition-all border border-white/10"
            title="Disconnect Spotify account"
          >
            <LogOut size={13} />
            <span className="hidden sm:inline">Disconnect</span>
          </button>
        )}
        <button
          onClick={toggleTheme}
          aria-label="Toggle dark/light theme"
          className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all border border-white/10"
        >
          {theme === 'dark' ? <Moon size={16} className="text-yellow-300" /> : <Sun size={16} className="text-amber-500" />}
        </button>
      </div>

      <div className="text-center pt-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
          <span>🎵</span> Spotify Album to Playlist
        </h1>
        <p className="mt-1 text-sm text-spotify-light-gray">
          Add albums to your Spotify playlists automatically
        </p>

        {userProfile && (
          <div className="inline-flex items-center gap-2 mt-4 px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-white shadow-sm">
            <img
              src={userProfile.images?.[0]?.url || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'}
              alt={userProfile.display_name}
              className="w-5 h-5 rounded-full object-cover border border-spotify-green/50"
            />
            <span>{userProfile.display_name}</span>
          </div>
        )}
      </div>
    </header>
  );
};
