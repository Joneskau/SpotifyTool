export interface NameSuggestionParams {
  now?: Date;
  artistNames?: string[];
  albumNames?: string[];
  totalAlbums?: number;
  strategyName?: string;
  existingPlaylistNames?: string[];
}

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Pure function that generates content-informed, realistic playlist name suggestions.
 */
export function generatePlaylistNameSuggestions({
  now = new Date(),
  artistNames = [],
  albumNames = [],
  totalAlbums = 0,
  strategyName,
}: NameSuggestionParams): string[] {
  const dateStr = formatLocalDate(now);
  const suggestions: string[] = [];

  // Filter unique, non-empty artist names
  const uniqueArtists = Array.from(
    new Set(artistNames.map(a => a.trim()).filter(Boolean))
  );

  // 1. Content-based: Featured artists list
  if (uniqueArtists.length > 0) {
    if (uniqueArtists.length === 1) {
      suggestions.push(`${uniqueArtists[0]} Collection`);
      suggestions.push(`${uniqueArtists[0]} - ${dateStr}`);
    } else if (uniqueArtists.length === 2) {
      suggestions.push(`${uniqueArtists[0]} & ${uniqueArtists[1]}`);
    } else {
      const remaining = uniqueArtists.length - 2;
      suggestions.push(
        `${uniqueArtists[0]}, ${uniqueArtists[1]} + ${remaining} more`
      );
    }
  }

  // 2. Date-based collection name
  suggestions.push(`Album Collection - ${dateStr}`);

  // 3. Strategy or album-count based if applicable
  if (strategyName && strategyName !== 'None') {
    const cleanStrategy = strategyName.replace(/_/g, ' ');
    suggestions.push(`Albums - ${cleanStrategy}`);
  } else if (totalAlbums > 0 || albumNames.length > 0) {
    const count = totalAlbums || albumNames.length;
    suggestions.push(`Selected Albums (${count})`);
  } else {
    suggestions.push(`New Playlist - ${dateStr}`);
  }

  // Deduplicate and trim suggestions
  return Array.from(new Set(suggestions.map(s => s.trim()))).filter(Boolean).slice(0, 4);
}

/**
 * Checks case-insensitively if a playlist name is already used by the user.
 */
export function isPlaylistNameTaken(name: string, existingNames: string[]): boolean {
  if (!name.trim()) return false;
  const target = name.trim().toLowerCase();
  return existingNames.some(existing => existing.trim().toLowerCase() === target);
}
