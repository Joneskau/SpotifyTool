import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { TierStrategy } from '../types/app';
import { Settings } from 'lucide-react';

export const TieringControls: React.FC = () => {
  const { tierOptions, setTierOptions } = useAppStore();

  const handleStrategyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const strategy = e.target.value as TierStrategy;
    setTierOptions({ strategy });
  };

  let paramLabel = 'N / A';
  let paramPlaceholder = '-';
  let strategyDesc = '';
  let isParamDisabled = true;
  let isMaxTracksDisabled = false;

  if (tierOptions.strategy === 'halving') {
    paramLabel = 'N / A';
    strategyDesc = 'Nested playlists: Top 100%, Top 50%, Top 25%... (Tracks repeat)';
    isMaxTracksDisabled = true;
  } else if (tierOptions.strategy === 'partitioning') {
    paramLabel = 'N / A';
    strategyDesc = 'Sequential playlists: Part 1, Part 2... (No repeats)';
  } else if (tierOptions.strategy === 'top_n') {
    paramLabel = 'Top N';
    paramPlaceholder = 'e.g. 3';
    strategyDesc = 'Selects the N most popular tracks from each album.';
    isParamDisabled = false;
  } else if (tierOptions.strategy === 'time_bounded') {
    paramLabel = 'Minutes';
    paramPlaceholder = 'e.g. 60';
    strategyDesc = 'Chunks tracks into playlists of roughly N minutes.';
    isParamDisabled = false;
  }

  return (
    <div className="w-full space-y-4 pt-4 border-t border-white/10">
      <div className="flex items-center gap-2 text-spotify-green font-semibold text-sm">
        <Settings size={16} />
        <span>Tiering Strategy</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Strategy Selector */}
        <div className="space-y-1">
          <label className="block text-xs text-spotify-light-gray font-medium">Strategy</label>
          <select
            value={tierOptions.strategy}
            onChange={handleStrategyChange}
            className="w-full p-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-spotify-green"
          >
            <option value="halving" className="bg-[#242424]">Popularity Halving</option>
            <option value="partitioning" className="bg-[#242424]">Partitioning (No Repeats)</option>
            <option value="top_n" className="bg-[#242424]">Top N per Album</option>
            <option value="time_bounded" className="bg-[#242424]">Time-bounded</option>
          </select>
          <p className="text-[11px] text-spotify-light-gray/70 min-h-[32px]">{strategyDesc}</p>
        </div>

        {/* Dynamic Parameter */}
        <div className="space-y-1">
          <label className="block text-xs text-spotify-light-gray font-medium">{paramLabel}</label>
          <input
            type="number"
            min={1}
            disabled={isParamDisabled}
            value={isParamDisabled ? '' : tierOptions.param || ''}
            onChange={e => setTierOptions({ param: parseInt(e.target.value, 10) || 0 })}
            placeholder={paramPlaceholder}
            className={`w-full p-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-spotify-green ${
              isParamDisabled ? 'opacity-40 cursor-not-allowed' : ''
            }`}
          />
        </div>

        {/* Mode (Top N only) */}
        {tierOptions.strategy === 'top_n' && (
          <div className="space-y-1">
            <label className="block text-xs text-spotify-light-gray font-medium">Mode</label>
            <select
              value={tierOptions.mode}
              onChange={e =>
                setTierOptions({ mode: e.target.value as 'single' | 'multi' })
              }
              className="w-full p-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-spotify-green"
            >
              <option value="single" className="bg-[#242424]">Single Playlist</option>
              <option value="multi" className="bg-[#242424]">Multi-tier (Recursive)</option>
            </select>
          </div>
        )}

        {/* Constraints */}
        <div className="space-y-1">
          <label className="block text-xs text-spotify-light-gray font-medium">Max Playlists</label>
          <input
            type="number"
            min={1}
            value={tierOptions.maxPlaylists || ''}
            onChange={e =>
              setTierOptions({ maxPlaylists: parseInt(e.target.value, 10) || 0 })
            }
            placeholder="Unlimited"
            className="w-full p-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-spotify-green"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-xs text-spotify-light-gray font-medium">
            Max Tracks / Playlist
          </label>
          <input
            type="number"
            min={1}
            disabled={isMaxTracksDisabled}
            value={isMaxTracksDisabled ? '' : tierOptions.maxTracks || ''}
            onChange={e =>
              setTierOptions({ maxTracks: parseInt(e.target.value, 10) || 0 })
            }
            placeholder={
              tierOptions.strategy === 'partitioning' ? 'Required' : 'Unlimited'
            }
            className={`w-full p-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-spotify-green ${
              isMaxTracksDisabled ? 'opacity-40 cursor-not-allowed' : ''
            }`}
          />
        </div>
      </div>
    </div>
  );
};
