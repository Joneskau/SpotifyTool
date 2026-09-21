import { describe, it, expect } from 'vitest';
import {
  levenshtein,
  similarity,
  normalizeAlbumName,
  normalizeDashes,
  parseAlbumLine,
} from '../utils/fuzzyMatch';

describe('fuzzyMatch utils', () => {
  describe('levenshtein & similarity', () => {
    it('returns exact match for identical strings', () => {
      expect(levenshtein('Abbey Road', 'Abbey Road')).toBe(0);
      expect(similarity('Abbey Road', 'Abbey Road')).toBe(1);
    });

    it('handles case insensitivity and whitespace in similarity', () => {
      expect(similarity('  abbey road  ', 'Abbey Road')).toBe(1);
    });

    it('calculates expected distance for typos', () => {
      expect(levenshtein('Abbey Road', 'Abby Road')).toBe(1);
      expect(similarity('Abbey Road', 'Abby Road')).toBeCloseTo(0.9, 1);
    });

    it('handles empty strings gracefully', () => {
      expect(similarity('', '')).toBe(1);
      expect(similarity('hello', '')).toBe(0);
    });
  });

  describe('normalizeAlbumName', () => {
    it('removes parenthetical and bracketed content', () => {
      expect(normalizeAlbumName('Abbey Road (Super Deluxe Edition)')).toBe('abbey road');
      expect(normalizeAlbumName('OK Computer [Collector Edition]')).toBe('ok computer');
    });

    it('removes edition keywords', () => {
      expect(normalizeAlbumName('The Dark Side of the Moon Remastered')).toBe('the dark side of the moon');
      expect(normalizeAlbumName('Thriller 25th Anniversary')).toBe('thriller 25th');
    });
  });

  describe('normalizeDashes', () => {
    it('converts en-dash and em-dash to hyphen', () => {
      expect(normalizeDashes('Artist – Album')).toBe('Artist - Album');
      expect(normalizeDashes('Artist — Album')).toBe('Artist - Album');
    });
  });

  describe('parseAlbumLine', () => {
    it('parses valid Artist - Album lines', () => {
      const result = parseAlbumLine('The Beatles - Abbey Road');
      expect(result).toEqual({
        artist: 'The Beatles',
        albumName: 'Abbey Road',
      });
    });

    it('handles dashes in album or artist name if spaced correctly', () => {
      const result = parseAlbumLine('AC/DC - Back in Black - Remastered');
      expect(result).toEqual({
        artist: 'AC/DC',
        albumName: 'Back in Black - Remastered',
      });
    });

    it('normalizes en-dash and em-dashes during parse', () => {
      const result = parseAlbumLine('Pink Floyd – The Wall');
      expect(result).toEqual({
        artist: 'Pink Floyd',
        albumName: 'The Wall',
      });
    });

    it('returns error when separator is missing', () => {
      const result = parseAlbumLine('The Beatles Abbey Road');
      expect(result.error).toBe('Missing " - " separator');
    });

    it('returns error on empty line', () => {
      const result = parseAlbumLine('   ');
      expect(result.error).toBe('Empty line');
    });
  });
});
