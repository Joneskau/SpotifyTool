import React, { useState, useRef, useEffect, useId } from 'react';
import { useAppStore } from '../store/useAppStore';
import {
  Plus,
  ListMusic,
  ChevronDown,
  Search,
  X,
  Lock,
  Globe,
  Users,
  AlertTriangle,
  CheckCircle2,
  Info,
  UploadCloud,
  Trash2,
  Loader2,
} from 'lucide-react';
import { generatePlaylistNameSuggestions, isPlaylistNameTaken } from '../utils/nameSuggestions';
import { processImageForSpotifyCover, validateCoverImage } from '../utils/imageProcess';
import { hasGrantedScope, initiateLogin } from '../services/spotifyAuth';
import { SimplifiedPlaylist } from '../types/app';

export const PlaylistSelector: React.FC = () => {
  const {
    playlists,
    userProfile,
    targetPlaylistMode,
    selectedExistingPlaylistId,
    newPlaylistName,
    newPlaylistDescription,
    newPlaylistIsPublic,
    newPlaylistCoverImage,
    isLoadingPlaylists,
    duplicateCheckStatus,
    duplicateCheckProgress,
    existingTrackUris,
    matchedAlbums,
    setTargetPlaylistMode,
    setSelectedExistingPlaylistId,
    setNewPlaylistName,
    setNewPlaylistDescription,
    setNewPlaylistIsPublic,
    setNewPlaylistCoverImage,
  } = useAppStore();

  // Dropdown states
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [showFollowedPlaylists, setShowFollowedPlaylists] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  // Cover image processing state
  const [isProcessingCover, setIsProcessingCover] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const comboboxId = useId();
  const listboxId = useId();

  // Writable check: user is owner or playlist is collaborative
  const isWritable = (playlist: SimplifiedPlaylist): boolean => {
    if (!userProfile) return true;
    if (playlist.owner?.id === userProfile.id) return true;
    return Boolean(playlist.collaborative);
  };

  // Filtered playlists
  const filteredPlaylists = playlists.filter(playlist => {
    if (!showFollowedPlaylists && !isWritable(playlist)) {
      return false;
    }
    if (!filter.trim()) return true;
    const query = filter.toLowerCase();
    const nameMatch = playlist.name.toLowerCase().includes(query);
    const ownerMatch = (playlist.owner?.display_name || playlist.owner?.id || '')
      .toLowerCase()
      .includes(query);
    return nameMatch || ownerMatch;
  });

  const selectedPlaylist = playlists.find(p => p.id === selectedExistingPlaylistId);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation for dropdown combobox
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev =>
        prev < filteredPlaylists.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev =>
        prev > 0 ? prev - 1 : filteredPlaylists.length - 1
      );
    } else if (e.key === 'Home') {
      e.preventDefault();
      setHighlightedIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setHighlightedIndex(Math.max(0, filteredPlaylists.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filteredPlaylists[highlightedIndex];
      if (target && isWritable(target)) {
        setSelectedExistingPlaylistId(target.id);
        setIsOpen(false);
      }
    }
  };

  // Keep highlighted item visible
  useEffect(() => {
    if (isOpen && listboxRef.current) {
      const activeEl = listboxRef.current.querySelector(
        `[data-index="${highlightedIndex}"]`
      ) as HTMLElement | null;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  // Dynamic name suggestions
  const artistNames = matchedAlbums.map(a => a.artist).filter(Boolean);
  const albumNames = matchedAlbums.map(a => a.album.name).filter(Boolean);
  const existingNames = playlists.map(p => p.name);

  const nameSuggestions = generatePlaylistNameSuggestions({
    now: new Date(),
    artistNames,
    albumNames,
    totalAlbums: matchedAlbums.length,
  });

  const isNameTaken = isPlaylistNameTaken(newPlaylistName, existingNames);
  const hasCoverScope = hasGrantedScope('ugc-image-upload');

  // Handle Cover File Upload
  const handleFileSelected = async (file: File | null) => {
    if (!file) return;
    setCoverError(null);
    const val = validateCoverImage(file);
    if (!val.valid) {
      setCoverError(val.error || 'Invalid image file');
      return;
    }

    setIsProcessingCover(true);
    try {
      const processed = await processImageForSpotifyCover(file);
      setNewPlaylistCoverImage(processed);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error processing image';
      setCoverError(msg);
    } finally {
      setIsProcessingCover(false);
    }
  };

  // Duplicate calculation against selected albums
  const validSelectedTracks = matchedAlbums
    .filter(a => a.selected !== false)
    .flatMap(a => a.trackUris || [])
    .filter(uri => typeof uri === 'string' && uri.startsWith('spotify:track:'));
  const uniqueIncomingUris = Array.from(new Set(validSelectedTracks));
  const duplicateCount = uniqueIncomingUris.filter(uri =>
    existingTrackUris.has(uri)
  ).length;
  const newUniqueCount = uniqueIncomingUris.length - duplicateCount;
  const currentTracksTotal = selectedPlaylist?.tracks?.total || 0;
  const projectedTotal = currentTracksTotal + newUniqueCount;

  return (
    <div className="w-full space-y-4">
      {/* Target Playlist Mode: Segmented Radiogroup */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-spotify-light-gray mb-2">
          Target Playlist
        </label>
        <div
          role="radiogroup"
          aria-label="Target playlist destination mode"
          className="grid grid-cols-2 gap-2 p-1 bg-black/40 border border-white/10 rounded-xl"
        >
          <button
            type="button"
            role="radio"
            aria-checked={targetPlaylistMode === 'new'}
            onClick={() => setTargetPlaylistMode('new')}
            className={`min-h-[44px] px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spotify-green ${
              targetPlaylistMode === 'new'
                ? 'bg-white/15 text-white shadow-sm border border-white/20'
                : 'text-spotify-light-gray hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            <Plus size={16} className={targetPlaylistMode === 'new' ? 'text-spotify-green' : ''} />
            <span>Create New Playlist</span>
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={targetPlaylistMode === 'existing'}
            onClick={() => setTargetPlaylistMode('existing')}
            className={`min-h-[44px] px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spotify-green ${
              targetPlaylistMode === 'existing'
                ? 'bg-white/15 text-white shadow-sm border border-white/20'
                : 'text-spotify-light-gray hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            <ListMusic size={16} className={targetPlaylistMode === 'existing' ? 'text-spotify-green' : ''} />
            <span>Add to Existing Playlist</span>
          </button>
        </div>
      </div>

      {/* MODE 1: CREATE NEW PLAYLIST FORM */}
      {targetPlaylistMode === 'new' && (
        <div className="space-y-4 pt-1 animate-in fade-in duration-200">
          {/* Playlist Name Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="new-playlist-name" className="text-xs font-medium text-white">
                Playlist Name <span className="text-red-400">*</span>
              </label>
              {isNameTaken && (
                <span className="text-[11px] text-amber-300 font-normal flex items-center gap-1">
                  <AlertTriangle size={12} />
                  You already have a playlist with this name.
                </span>
              )}
            </div>
            <input
              id="new-playlist-name"
              type="text"
              value={newPlaylistName}
              onChange={e => setNewPlaylistName(e.target.value)}
              placeholder="e.g. Album Collection"
              className="w-full min-h-[44px] px-3.5 py-2.5 text-sm bg-white/5 border border-white/10 rounded-xl text-white placeholder-spotify-light-gray focus:outline-none focus:border-spotify-green focus:ring-1 focus:ring-spotify-green transition-all"
            />

            {/* Smart Suggestions Chips */}
            {nameSuggestions.length > 0 && (
              <div className="pt-1.5">
                <span className="text-[11px] text-spotify-light-gray block mb-1.5">
                  Suggested names:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {nameSuggestions.map((suggestion, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setNewPlaylistName(suggestion)}
                      className="text-xs px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 text-spotify-light-gray hover:text-white transition-all text-left truncate max-w-full"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Description Input */}
          <div className="space-y-1.5">
            <label htmlFor="new-playlist-desc" className="text-xs font-medium text-white">
              Description <span className="text-spotify-light-gray font-normal">(Optional)</span>
            </label>
            <textarea
              id="new-playlist-desc"
              rows={2}
              value={newPlaylistDescription}
              onChange={e => setNewPlaylistDescription(e.target.value)}
              placeholder="Add an optional description for this playlist"
              className="w-full px-3.5 py-2.5 text-sm bg-white/5 border border-white/10 rounded-xl text-white placeholder-spotify-light-gray focus:outline-none focus:border-spotify-green focus:ring-1 focus:ring-spotify-green transition-all resize-none"
            />
          </div>

          {/* Public / Private Switch Toggle */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/5 border border-white/10">
            <div className="space-y-0.5 pr-4">
              <div className="text-sm font-medium text-white flex items-center gap-2">
                {newPlaylistIsPublic ? <Globe size={15} className="text-spotify-green" /> : <Lock size={15} className="text-spotify-light-gray" />}
                <span>{newPlaylistIsPublic ? 'Public Playlist' : 'Private Playlist'}</span>
              </div>
              <p className="text-xs text-spotify-light-gray">
                {newPlaylistIsPublic
                  ? 'Anyone can view, search, and follow this playlist on Spotify.'
                  : 'Only you can view this playlist unless you share its direct link.'}
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={newPlaylistIsPublic}
              onClick={() => setNewPlaylistIsPublic(!newPlaylistIsPublic)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-spotify-green ${
                newPlaylistIsPublic ? 'bg-spotify-green' : 'bg-white/20'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  newPlaylistIsPublic ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Optional Cover Image Upload */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-white block">
              Cover Image <span className="text-spotify-light-gray font-normal">(Optional)</span>
            </label>

            {!hasCoverScope ? (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Info size={16} className="shrink-0 text-amber-400" />
                  <span>Custom covers require permission to upload to Spotify.</span>
                </div>
                <button
                  type="button"
                  onClick={() => initiateLogin()}
                  className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-medium whitespace-nowrap transition-colors"
                >
                  Reconnect to Enable
                </button>
              </div>
            ) : newPlaylistCoverImage ? (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                <img
                  src={newPlaylistCoverImage.dataUrl}
                  alt="Playlist cover preview"
                  className="w-14 h-14 rounded-lg object-cover border border-white/10 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-white truncate">
                    Custom Cover Attached
                  </div>
                  <div className="text-[11px] text-spotify-light-gray">
                    Square center-cropped JPEG (&le; 250 KB)
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setNewPlaylistCoverImage(null)}
                  className="p-2 rounded-lg text-spotify-light-gray hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Remove cover image"
                  aria-label="Remove cover image"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ) : (
              <div
                tabIndex={0}
                role="button"
                aria-label="Upload custom playlist cover image"
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  if (e.dataTransfer.files?.[0]) {
                    handleFileSelected(e.dataTransfer.files[0]);
                  }
                }}
                className="flex flex-col items-center justify-center p-4 border border-dashed border-white/20 hover:border-spotify-green rounded-xl bg-white/[0.02] hover:bg-white/[0.05] cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spotify-green text-center"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={e => {
                    if (e.target.files?.[0]) {
                      handleFileSelected(e.target.files[0]);
                    }
                  }}
                />

                {isProcessingCover ? (
                  <div className="flex items-center gap-2 text-xs text-spotify-light-gray py-2">
                    <Loader2 size={16} className="animate-spin text-spotify-green" />
                    <span>Processing and sizing image...</span>
                  </div>
                ) : (
                  <>
                    <UploadCloud size={24} className="text-spotify-light-gray mb-1.5" />
                    <span className="text-xs font-medium text-white">
                      Click or drag and drop to upload cover
                    </span>
                    <span className="text-[11px] text-spotify-light-gray mt-0.5">
                      JPEG, PNG, or WebP. Auto center-cropped to square.
                    </span>
                  </>
                )}
              </div>
            )}

            {coverError && (
              <div className="text-xs text-red-400 flex items-center gap-1.5 pt-1">
                <AlertTriangle size={13} className="shrink-0" />
                <span>{coverError}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODE 2: EXISTING PLAYLIST SELECTOR */}
      {targetPlaylistMode === 'existing' && (
        <div className="space-y-3 pt-1 animate-in fade-in duration-200">
          <div ref={dropdownRef} className="relative w-full">
            {/* Combobox Trigger */}
            <div
              id={comboboxId}
              role="combobox"
              aria-expanded={isOpen}
              aria-haspopup="listbox"
              aria-controls={listboxId}
              tabIndex={0}
              onClick={() => setIsOpen(!isOpen)}
              onKeyDown={handleKeyDown}
              className="flex items-center justify-between w-full min-h-[48px] p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spotify-green"
            >
              <div className="flex items-center gap-3 overflow-hidden">
                {selectedPlaylist ? (
                  <img
                    src={selectedPlaylist.images?.[0]?.url || 'https://via.placeholder.com/32'}
                    alt=""
                    className="w-9 h-9 rounded-lg object-cover shrink-0 border border-white/10"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-spotify-light-gray shrink-0">
                    <ListMusic size={18} />
                  </div>
                )}

                <div className="truncate text-left">
                  <div className="truncate text-sm font-medium text-white">
                    {selectedPlaylist ? selectedPlaylist.name : 'Choose an existing playlist...'}
                  </div>
                  {selectedPlaylist && (
                    <div className="text-xs text-spotify-light-gray flex items-center gap-2 mt-0.5">
                      <span>{selectedPlaylist.tracks.total.toLocaleString()} tracks</span>
                      <span>&bull;</span>
                      <span>
                        {userProfile && selectedPlaylist.owner?.id === userProfile.id
                          ? 'by You'
                          : `by ${selectedPlaylist.owner?.display_name || selectedPlaylist.owner?.id || 'Unknown'}`}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <ChevronDown
                size={16}
                className={`text-spotify-light-gray transition-transform duration-200 shrink-0 ${
                  isOpen ? 'rotate-180' : ''
                }`}
              />
            </div>

            {/* Dropdown Popup Listbox */}
            {isOpen && (
              <div className="absolute z-50 mt-2 w-full max-h-80 rounded-xl bg-[#242424] border border-white/10 shadow-2xl overflow-hidden flex flex-col animate-in fade-in duration-150">
                {/* Search & Filter Header */}
                <div className="p-2 border-b border-white/10 space-y-2 bg-[#202020]">
                  <div className="relative flex items-center">
                    <Search
                      size={15}
                      className="absolute left-3 text-spotify-light-gray pointer-events-none"
                    />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={filter}
                      onChange={e => {
                        setFilter(e.target.value);
                        setHighlightedIndex(0);
                      }}
                      onKeyDown={handleKeyDown}
                      placeholder="Search by name or owner..."
                      className="w-full pl-9 pr-8 py-2 text-xs bg-black/40 border border-white/10 rounded-lg text-white placeholder-spotify-light-gray focus:outline-none focus:border-spotify-green focus:ring-1 focus:ring-spotify-green"
                      autoFocus
                    />
                    {filter && (
                      <button
                        type="button"
                        onClick={() => setFilter('')}
                        className="absolute right-2.5 text-spotify-light-gray hover:text-white p-0.5"
                        aria-label="Clear search"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Followed Playlist Toggle */}
                  <div className="flex items-center justify-between px-1 text-[11px] text-spotify-light-gray">
                    <span>
                      Showing {filteredPlaylists.length} playlist{filteredPlaylists.length === 1 ? '' : 's'}
                    </span>
                    <label className="flex items-center gap-1.5 cursor-pointer hover:text-white">
                      <input
                        type="checkbox"
                        checked={showFollowedPlaylists}
                        onChange={e => setShowFollowedPlaylists(e.target.checked)}
                        className="rounded bg-black/40 border-white/20 text-spotify-green focus:ring-0 cursor-pointer"
                      />
                      <span>Show followed (read-only)</span>
                    </label>
                  </div>
                </div>

                {/* Playlist Options Listbox */}
                <div
                  ref={listboxRef}
                  id={listboxId}
                  role="listbox"
                  className="overflow-y-auto divide-y divide-white/5 max-h-60"
                >
                  {isLoadingPlaylists && (
                    <div className="p-5 text-center text-xs text-spotify-light-gray flex items-center justify-center gap-2">
                      <Loader2 size={16} className="animate-spin text-spotify-green" />
                      <span>Loading your playlists...</span>
                    </div>
                  )}

                  {!isLoadingPlaylists && filteredPlaylists.length === 0 && (
                    <div className="p-6 text-center text-xs text-spotify-light-gray">
                      No matching writable playlists found.
                    </div>
                  )}

                  {filteredPlaylists.map((playlist, idx) => {
                    const writable = isWritable(playlist);
                    const isSelected = selectedExistingPlaylistId === playlist.id;
                    const isHighlighted = highlightedIndex === idx;
                    const totalTracks = playlist.tracks.total;
                    const isFull = totalTracks >= 10000;
                    const isNearLimit = totalTracks >= 9000 && !isFull;
                    const isMine = userProfile && playlist.owner?.id === userProfile.id;

                    return (
                      <div
                        key={playlist.id}
                        data-index={idx}
                        role="option"
                        aria-selected={isSelected}
                        aria-disabled={!writable}
                        onClick={() => {
                          if (writable) {
                            setSelectedExistingPlaylistId(playlist.id);
                            setIsOpen(false);
                          }
                        }}
                        onMouseEnter={() => setHighlightedIndex(idx)}
                        className={`flex items-center gap-3 p-2.5 transition-colors ${
                          !writable
                            ? 'opacity-40 cursor-not-allowed bg-black/20'
                            : 'cursor-pointer hover:bg-white/10'
                        } ${isSelected ? 'bg-white/10' : ''} ${
                          isHighlighted && writable ? 'bg-white/15' : ''
                        }`}
                      >
                        <img
                          src={playlist.images?.[0]?.url || 'https://via.placeholder.com/32'}
                          alt=""
                          className="w-9 h-9 rounded object-cover shrink-0 border border-white/10"
                        />
                        <div className="truncate flex-1 text-left min-w-0">
                          <div className="text-xs text-white font-medium truncate flex items-center justify-between gap-1">
                            <span className="truncate">{playlist.name}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              {!writable && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-white/10 text-spotify-light-gray">
                                  Read-only
                                </span>
                              )}
                              {isFull && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                                  Full (10k)
                                </span>
                              )}
                              {isNearLimit && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                  Near Limit
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="text-[11px] text-spotify-light-gray flex items-center gap-2 mt-0.5 truncate">
                            <span>{totalTracks.toLocaleString()} tracks</span>
                            <span>&bull;</span>
                            <span className="truncate">
                              {isMine
                                ? 'by You'
                                : `by ${playlist.owner?.display_name || playlist.owner?.id || 'Unknown'}`}
                            </span>
                            <span>&bull;</span>
                            <span className="flex items-center gap-1">
                              {playlist.public ? (
                                <>
                                  <Globe size={10} /> Public
                                </>
                              ) : (
                                <>
                                  <Lock size={10} /> Private
                                </>
                              )}
                            </span>
                            {playlist.collaborative && (
                              <span className="text-spotify-green flex items-center gap-0.5">
                                <Users size={10} /> Collab
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* DUPLICATE TRACKS CHECK & CAPACITY FEEDBACK */}
          {selectedPlaylist && (
            <div aria-live="polite" className="space-y-2 pt-1">
              {/* Checking Progress State */}
              {duplicateCheckStatus === 'checking' && (
                <div className="p-3 rounded-xl border bg-white/5 border-white/10 text-xs text-spotify-light-gray flex items-center gap-2.5">
                  <Loader2 size={16} className="animate-spin text-spotify-green shrink-0" />
                  <span>
                    Checking existing tracks in target playlist
                    {duplicateCheckProgress.total > 0
                      ? ` (${duplicateCheckProgress.current.toLocaleString()} / ${duplicateCheckProgress.total.toLocaleString()})...`
                      : '...'}
                  </span>
                </div>
              )}

              {/* Error State: Could not check */}
              {duplicateCheckStatus === 'error' && (
                <div className="p-3 rounded-xl border bg-amber-500/10 border-amber-500/30 text-xs text-amber-300 flex items-start gap-2.5">
                  <Info size={16} className="shrink-0 text-amber-400 mt-0.5" />
                  <div>
                    <div className="font-semibold">Could not verify existing tracks</div>
                    <p className="text-[11px] text-amber-200/80 mt-0.5">
                      Network or permission issues prevented scanning this playlist. Tracks will be sent normally.
                    </p>
                  </div>
                </div>
              )}

              {/* Success State: Results available */}
              {duplicateCheckStatus === 'success' && matchedAlbums.length > 0 && (
                <>
                  {duplicateCount > 0 ? (
                    <div className="p-3 rounded-xl border bg-amber-500/10 border-amber-500/30 text-xs text-amber-300 flex items-start gap-2.5">
                      <AlertTriangle size={16} className="shrink-0 text-amber-400 mt-0.5" />
                      <div>
                        <div className="font-semibold">
                          {duplicateCount} {duplicateCount === 1 ? 'track' : 'tracks'} may already exist in this playlist
                        </div>
                        <p className="text-[11px] text-amber-200/80 mt-0.5">
                          Matching track URIs will be skipped during publishing to prevent duplicates.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-xl border bg-spotify-green/10 border-spotify-green/20 text-xs text-spotify-green flex items-center gap-2">
                      <CheckCircle2 size={15} className="shrink-0" />
                      <span>No duplicate track URIs found in this playlist.</span>
                    </div>
                  )}

                  {/* Projected Total Track Count */}
                  <div className="text-[11px] text-spotify-light-gray flex items-center justify-between px-1">
                    <span>Projected Total:</span>
                    <span
                      className={`font-medium ${
                        projectedTotal > 10000
                          ? 'text-red-400'
                          : projectedTotal >= 9000
                          ? 'text-amber-400'
                          : 'text-white'
                      }`}
                    >
                      {projectedTotal.toLocaleString()} / 10,000 tracks
                    </span>
                  </div>
                </>
              )}

              {/* Standalone Limit Warning if 10k reached */}
              {currentTracksTotal >= 10000 && (
                <div className="p-3 rounded-xl border bg-red-500/10 border-red-500/30 text-xs text-red-300 flex items-center gap-2.5">
                  <AlertTriangle size={16} className="shrink-0 text-red-400" />
                  <div>
                    <span className="font-semibold">Spotify 10,000 Track Limit Reached: </span>
                    <span>This playlist is completely full. You must create a new playlist or choose another destination.</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
