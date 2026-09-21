import { TrackObject } from '../types/app';
import { HEADLINE_MARKET } from './errorFeedback';

/**
 * Format total duration into human-readable string.
 * Examples:
 * - < 60s: "45s"
 * - < 1 hr: "53 min 21s"
 * - >= 1 hr: "1 hr 12 min"
 */
export function formatDuration(durationMs: number): string {
  if (!durationMs || durationMs <= 0) return '0s';

  const totalSeconds = Math.round(durationMs / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`;
  }

  return seconds > 0 ? `${minutes} min ${seconds}s` : `${minutes} min`;
}

/**
 * Derives confidence level (high | medium | low) based on the exact same
 * rounded percentage that is displayed to the user.
 * High: >= 80%
 * Medium: 50% - 79%
 * Low: < 50%
 */
export function getConfidenceLevel(score: number): 'high' | 'medium' | 'low' {
  const roundedPercent = Math.round(score * 100);
  if (roundedPercent >= 80) return 'high';
  if (roundedPercent >= 50) return 'medium';
  return 'low';
}

/**
 * Evaluates market availability from album tracks using Spotify 2026 Developer Mode signals:
 * - Checks `is_playable === false`
 * - Checks `restrictions?.reason === 'market'`
 * Returns a region warning message or null if playable or unknown.
 */
export function getPlayabilityWarning(tracks?: TrackObject[]): string | null {
  if (!tracks || tracks.length === 0) return null;

  const hasUnplayable = tracks.some(
    t => t.is_playable === false || t.restrictions?.reason === 'market'
  );

  if (hasUnplayable) {
    return HEADLINE_MARKET;
  }

  return null;
}

/**
 * Checks if the album contains explicit tracks:
 * - Returns `true` if at least one track is explicit.
 * - Returns `false` if explicit information is present on all tracks and none is explicit.
 * - Returns `null` if explicit status is missing/unknown across all tracks.
 */
export function hasExplicitTracks(tracks?: TrackObject[]): boolean | null {
  if (!tracks || tracks.length === 0) return null;

  const anyExplicit = tracks.some(t => t.explicit === true);
  if (anyExplicit) return true;

  const hasAnyExplicitInfo = tracks.some(t => typeof t.explicit === 'boolean');
  if (hasAnyExplicitInfo) return false;

  return null;
}
