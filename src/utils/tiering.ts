import { MatchedAlbum, TieringOptions, GeneratedTier } from '../types/app';

export function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '0m';
  const totalMinutes = Math.round(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function calculatePlaylistTiers(
  selectedAlbums: MatchedAlbum[],
  options: TieringOptions,
  existingTrackUris: Set<string> = new Set()
): GeneratedTier[] {
  const tiers: GeneratedTier[] = [];

  // Filter out tracks already in the target playlist before tiering
  const filteredAlbums = selectedAlbums
    .map(albumData => {
      const uniqueTrackUris = Array.from(
        new Set((albumData.trackUris || []).filter(uri => !existingTrackUris.has(uri)))
      );
      const filteredTrackObjects = (albumData.trackObjects || []).filter(t =>
        uniqueTrackUris.includes(t.uri)
      );
      return {
        ...albumData,
        trackUris: uniqueTrackUris,
        trackObjects: filteredTrackObjects,
      };
    })
    .filter(albumData => albumData.trackUris.length > 0);

  if (filteredAlbums.length === 0) {
    return [];
  }

  // Pool all tracks with metadata
  let allTracks = filteredAlbums.flatMap(albumData => {
    return albumData.trackUris.map(uri => {
      const trackObj = albumData.trackObjects.find(t => t.uri === uri);
      return {
        uri,
        popularity: trackObj?.popularity || 0,
        duration_ms: trackObj?.duration_ms || 0,
        albumName: albumData.album.name,
        artistName: albumData.album.artists[0]?.name,
      };
    });
  });

  // --- STRATEGY: TOP N PER ALBUM ---
  if (options.strategy === 'top_n') {
    const n = Math.max(1, options.param || 3);

    const getAlbumTracksSorted = (albumData: (typeof filteredAlbums)[0]) => {
      return albumData.trackUris
        .map(uri => {
          const trackObj = albumData.trackObjects.find(t => t.uri === uri);
          return {
            uri,
            popularity: trackObj?.popularity || 0,
            duration_ms: trackObj?.duration_ms || 0,
            albumName: albumData.album.name,
            artistName: albumData.album.artists[0]?.name,
          };
        })
        .sort((a, b) => b.popularity - a.popularity);
    };

    if (options.mode === 'multi') {
      let batchIndex = 0;
      while (true) {
        const startRank = batchIndex * n;
        const endRank = startRank + n;

        const tierTracks: { uri: string; popularity: number; duration_ms: number }[] = [];

        filteredAlbums.forEach(album => {
          const sorted = getAlbumTracksSorted(album);
          const chunk = sorted.slice(startRank, endRank);
          tierTracks.push(...chunk);
        });

        if (tierTracks.length === 0) break;

        tierTracks.sort((a, b) => b.popularity - a.popularity);

        tiers.push({
          tracks: tierTracks.map(t => t.uri),
          nameSuffix: batchIndex === 0 ? '' : ` - Tier ${batchIndex + 1}`,
        });

        batchIndex++;
        if (tiers.length > 20) break; // Safety cap
      }
    } else {
      // Single Mode
      allTracks = filteredAlbums.flatMap(albumData => {
        const sorted = getAlbumTracksSorted(albumData);
        return sorted.slice(0, n);
      });

      allTracks.sort((a, b) => b.popularity - a.popularity);

      if (options.maxTracks > 0 && allTracks.length > options.maxTracks) {
        for (let i = 0; i < allTracks.length; i += options.maxTracks) {
          tiers.push({
            tracks: allTracks.slice(i, i + options.maxTracks).map(t => t.uri),
            nameSuffix: ` - Part ${tiers.length + 1}`,
          });
        }
      } else {
        tiers.push({
          tracks: allTracks.map(t => t.uri),
          nameSuffix: '',
        });
      }
    }
  }
  // --- STRATEGY: TIME BOUNDED ---
  else if (options.strategy === 'time_bounded') {
    const targetMinutes = Math.max(1, options.param || 60);
    const targetMs = targetMinutes * 60 * 1000;

    allTracks.sort((a, b) => b.popularity - a.popularity);

    let currentChunk: string[] = [];
    let currentDuration = 0;

    for (const track of allTracks) {
      currentChunk.push(track.uri);
      currentDuration += track.duration_ms;

      if (currentDuration >= targetMs) {
        tiers.push({
          tracks: [...currentChunk],
          nameSuffix: ` - Part ${tiers.length + 1}`,
        });
        currentChunk = [];
        currentDuration = 0;
      }
    }

    if (currentChunk.length > 0) {
      tiers.push({
        tracks: currentChunk,
        nameSuffix: ` - Part ${tiers.length + 1}`,
      });
    }
  }
  // --- STRATEGY: PARTITIONING ---
  else if (options.strategy === 'partitioning') {
    if (options.maxTracks <= 0) return [];

    allTracks.sort((a, b) => b.popularity - a.popularity);

    for (let i = 0; i < allTracks.length; i += options.maxTracks) {
      tiers.push({
        tracks: allTracks.slice(i, i + options.maxTracks).map(t => t.uri),
        nameSuffix: ` - Part ${tiers.length + 1}`,
      });
    }
  }
  // --- STRATEGY: POPULARITY HALVING ---
  else {
    allTracks.sort((a, b) => b.popularity - a.popularity);

    const minThresholds = [Infinity, 4, 3, 2, 1];
    let currentTierWrappers = filteredAlbums.map(album => ({
      tracks: [...album.trackUris].sort((a, b) => {
        const tA = album.trackObjects.find(t => t.uri === a)?.popularity || 0;
        const tB = album.trackObjects.find(t => t.uri === b)?.popularity || 0;
        return tB - tA;
      }),
    }));

    tiers.push({
      tracks: currentTierWrappers.flatMap(a => a.tracks),
      nameSuffix: '',
    });

    let thresholdIndex = 1;

    while (true) {
      const minThreshold = minThresholds[Math.min(thresholdIndex, minThresholds.length - 1)];
      const nextWrappers: { tracks: string[] }[] = [];

      for (const w of currentTierWrappers) {
        const currentCount = w.tracks.length;
        let targetCount = Math.ceil(currentCount / 2);
        targetCount = Math.max(targetCount, minThreshold);
        targetCount = Math.min(targetCount, currentCount);

        nextWrappers.push({
          tracks: w.tracks.slice(0, targetCount),
        });
      }

      const newTierTracks = nextWrappers.flatMap(a => a.tracks);
      const prevTierTracks = currentTierWrappers.flatMap(a => a.tracks);

      if (newTierTracks.length >= prevTierTracks.length || newTierTracks.length === 0) break;

      let suffix = '';
      if (tiers.length === 1) suffix = ' - Best';
      else if (tiers.length === 2) suffix = ' - Essentials';
      else suffix = ` - Top ${Math.round((1 / Math.pow(2, tiers.length)) * 100)}%`;

      tiers.push({
        tracks: newTierTracks,
        nameSuffix: suffix,
      });

      currentTierWrappers = nextWrappers;
      thresholdIndex++;

      if (currentTierWrappers.every(a => a.tracks.length <= 1)) break;
      if (tiers.length > 50) break;
    }
  }

  return tiers;
}
