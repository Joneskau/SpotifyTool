import { z } from 'zod';

export const SpotifyImageSchema = z.object({
  url: z.string(),
  height: z.number().nullable().optional(),
  width: z.number().nullable().optional(),
});

export const SpotifyArtistSimplifiedSchema = z.object({
  id: z.string(),
  name: z.string(),
  uri: z.string().optional(),
});

export const SpotifyAlbumSimplifiedSchema = z.object({
  id: z.string(),
  name: z.string(),
  release_date: z.string().optional(),
  images: z.array(SpotifyImageSchema).default([]),
  artists: z.array(SpotifyArtistSimplifiedSchema).default([]),
  popularity: z.number().optional(),
});

export const SpotifyTrackSimplifiedSchema = z.object({
  id: z.string(),
  name: z.string(),
  uri: z.string(),
  duration_ms: z.number(),
  track_number: z.number().optional(),
});

export const SpotifyTrackFullSchema = SpotifyTrackSimplifiedSchema.extend({
  popularity: z.number().optional().default(0),
});

export const SpotifyUserSchema = z.object({
  id: z.string(),
  display_name: z.string().nullable().optional().default('Spotify User'),
  images: z.array(SpotifyImageSchema).optional().default([]),
});

export const SpotifyPlaylistSimplifiedSchema = z.object({
  id: z.string(),
  name: z.string(),
  images: z.array(SpotifyImageSchema).nullable().optional().default([]),
  tracks: z.object({
    total: z.number().default(0),
  }),
});

export const SpotifySearchAlbumsResponseSchema = z.object({
  albums: z.object({
    items: z.array(SpotifyAlbumSimplifiedSchema).default([]),
    total: z.number().default(0),
  }).optional(),
});

export const SpotifyPagingResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema).default([]),
    next: z.string().nullable().optional(),
    total: z.number().optional(),
  });
