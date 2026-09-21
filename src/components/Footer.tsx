import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="w-full mt-12 pt-8 border-t border-white/10 text-center text-xs text-spotify-light-gray space-y-4 max-w-2xl mx-auto">
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 text-xs">
        <details className="cursor-pointer text-left w-full sm:w-auto">
          <summary className="font-semibold text-white hover:text-spotify-green transition-colors text-center sm:text-left">
            How it works
          </summary>
          <p className="mt-2 p-3 bg-white/5 rounded-lg border border-white/10 text-[11px] leading-relaxed text-spotify-light-gray">
            Album to Playlist searches Spotify for each album you list, lets you confirm the right
            edition, and then arranges the tracks into one or more playlists using the tiering
            strategy you choose (popularity halving, partitioning, top-N, or time-bounded). It
            de-duplicates against tracks already in your target playlist so re-running is safe.
          </p>
        </details>

        <details className="cursor-pointer text-left w-full sm:w-auto">
          <summary className="font-semibold text-white hover:text-spotify-green transition-colors text-center sm:text-left">
            Privacy
          </summary>
          <p className="mt-2 p-3 bg-white/5 rounded-lg border border-white/10 text-[11px] leading-relaxed text-spotify-light-gray">
            This is a client-side app. Authentication uses Spotify&rsquo;s official OAuth (PKCE) flow,
            and your access token is kept only in your browser&rsquo;s local storage. We don&rsquo;t run a
            backend, we don&rsquo;t store your data, and we never see your Spotify credentials. Use the
            Disconnect button to clear your session at any time.
          </p>
        </details>
      </div>

      <nav className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-spotify-light-gray/80">
        <a
          href="https://www.spotify.com/legal/privacy-policy/"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-white transition-colors"
        >
          Spotify Privacy
        </a>
        <span>•</span>
        <a
          href="https://developer.spotify.com/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-white transition-colors"
        >
          Spotify Terms
        </a>
      </nav>

      <p className="text-[11px] text-spotify-light-gray/60 leading-relaxed">
        Not affiliated with, endorsed, or sponsored by Spotify AB. &ldquo;Spotify&rdquo; and the Spotify
        logo are trademarks of Spotify AB. This tool uses the Spotify Web API but is an independent
        project.
      </p>

      <p className="text-[11px] text-spotify-light-gray/50">
        &copy; {new Date().getFullYear()} Album to Playlist. Made for music lovers.
      </p>
    </footer>
  );
};
