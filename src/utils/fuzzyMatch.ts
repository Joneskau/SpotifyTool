export interface ParsedAlbumLine {
  artist?: string;
  albumName?: string;
  error?: string;
}

export function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

export function similarity(str1: string, str2: string): number {
  const s1 = (str1 || '').toLowerCase().trim();
  const s2 = (str2 || '').toLowerCase().trim();
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(s1, s2) / maxLen;
}

export function normalizeAlbumName(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, ' ') // Remove parenthetical content
    .replace(/\s*\[.*?\]\s*/g, ' ') // Remove bracketed content
    .replace(/\s*(remastered|deluxe|edition|anniversary|expanded|bonus|version)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeDashes(str: string): string {
  return (str || '').replace(/[–—]/g, '-');
}

export function parseAlbumLine(line: string): ParsedAlbumLine {
  const normalized = normalizeDashes(line).trim();
  if (!normalized) {
    return { error: 'Empty line' };
  }

  const match = normalized.match(/^(.+?)\s+-\s+(.+)$/);
  if (!match) {
    return { error: 'Missing " - " separator' };
  }

  const artist = match[1].trim();
  const albumName = match[2].trim();

  if (!artist) {
    return { error: 'Missing artist name' };
  }
  if (!albumName) {
    return { error: 'Missing album name' };
  }

  return { artist, albumName };
}
