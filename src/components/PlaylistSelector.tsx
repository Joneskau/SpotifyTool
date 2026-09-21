import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { ChevronDown, Plus, Music } from 'lucide-react';

export const PlaylistSelector: React.FC = () => {
  const {
    playlists,
    selectedPlaylistId,
    newPlaylistName,
    isLoadingPlaylists,
    setSelectedPlaylistId,
    setNewPlaylistName,
  } = useAppStore();

  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedPlaylist = playlists.find(p => p.id === selectedPlaylistId);
  const isNew = selectedPlaylistId === 'NEW';

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredPlaylists = playlists.filter(p =>
    p.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="w-full space-y-3">
      <label className="block text-xs font-semibold uppercase tracking-wider text-spotify-light-gray">
        Target Playlist
      </label>

      <div ref={dropdownRef} className="relative w-full">
        <div
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center justify-between w-full p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer transition-all"
        >
          <div className="flex items-center gap-3 overflow-hidden">
            {isNew ? (
              <div className="w-8 h-8 rounded bg-spotify-green/20 flex items-center justify-center text-spotify-green shrink-0">
                <Plus size={18} />
              </div>
            ) : selectedPlaylist ? (
              <img
                src={selectedPlaylist.images?.[0]?.url || 'https://via.placeholder.com/32'}
                alt={selectedPlaylist.name}
                className="w-8 h-8 rounded object-cover shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center text-spotify-light-gray shrink-0">
                <Music size={16} />
              </div>
            )}

            <div className="truncate text-sm font-medium text-white">
              {isNew
                ? '✨ Create New Playlist...'
                : selectedPlaylist
                ? selectedPlaylist.name
                : 'Select a playlist...'}
            </div>
          </div>
          <ChevronDown
            size={16}
            className={`text-spotify-light-gray transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </div>

        {isOpen && (
          <div className="absolute z-50 mt-2 w-full max-h-72 rounded-xl bg-[#242424] border border-white/10 shadow-2xl overflow-hidden flex flex-col">
            <div className="p-2 border-b border-white/10">
              <input
                type="text"
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Search playlists..."
                className="w-full px-3 py-2 text-sm bg-black/40 border border-white/10 rounded-lg text-white placeholder-spotify-light-gray focus:outline-none focus:border-spotify-green"
                autoFocus
              />
            </div>

            <div className="overflow-y-auto divide-y divide-white/5 max-h-56">
              {/* Create New Option */}
              <div
                onClick={() => {
                  setSelectedPlaylistId('NEW');
                  setIsOpen(false);
                }}
                className="flex items-center gap-3 p-3 hover:bg-white/10 cursor-pointer transition-colors text-spotify-green font-medium text-sm"
              >
                <div className="w-8 h-8 rounded bg-spotify-green/20 flex items-center justify-center">
                  <Plus size={16} />
                </div>
                <span>+ Create New Playlist</span>
              </div>

              {isLoadingPlaylists && (
                <div className="p-4 text-center text-xs text-spotify-light-gray">
                  Loading your playlists...
                </div>
              )}

              {!isLoadingPlaylists && filteredPlaylists.length === 0 && (
                <div className="p-4 text-center text-xs text-spotify-light-gray">
                  No matching playlists found
                </div>
              )}

              {filteredPlaylists.map(playlist => (
                <div
                  key={playlist.id}
                  onClick={() => {
                    setSelectedPlaylistId(playlist.id);
                    setIsOpen(false);
                  }}
                  className={`flex items-center gap-3 p-2.5 hover:bg-white/10 cursor-pointer transition-colors ${
                    selectedPlaylistId === playlist.id ? 'bg-white/5' : ''
                  }`}
                >
                  <img
                    src={playlist.images?.[0]?.url || 'https://via.placeholder.com/32'}
                    alt={playlist.name}
                    className="w-8 h-8 rounded object-cover shrink-0"
                  />
                  <div className="truncate flex-1">
                    <div className="text-sm text-white font-medium truncate">{playlist.name}</div>
                    <div className="text-xs text-spotify-light-gray">
                      {playlist.tracks.total} tracks
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {isNew && (
        <div className="mt-2 space-y-1">
          <label className="block text-xs text-spotify-light-gray">New Playlist Name</label>
          <input
            type="text"
            value={newPlaylistName}
            onChange={e => setNewPlaylistName(e.target.value)}
            placeholder="e.g. My Favorite Albums 2026"
            className="w-full p-3 text-sm bg-white/5 border border-white/10 rounded-xl text-white placeholder-spotify-light-gray focus:outline-none focus:border-spotify-green transition-all"
          />
        </div>
      )}
    </div>
  );
};
