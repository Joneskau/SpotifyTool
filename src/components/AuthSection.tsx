import React, { useState } from 'react';
import { initiateLogin, getRedirectUri } from '../services/spotifyAuth';
import { Check, Copy } from 'lucide-react';

export const AuthSection: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const redirectUri = getRedirectUri();

  const handleCopyUri = () => {
    navigator.clipboard.writeText(redirectUri);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full flex flex-col items-center text-center py-8">
      <button
        onClick={() => initiateLogin()}
        className="w-full max-w-sm py-3.5 px-6 rounded-full bg-spotify-green hover:bg-spotify-green-hover text-black font-bold text-base shadow-lg shadow-spotify-green/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
      >
        Connect to Spotify
      </button>

      <p className="mt-3 text-xs text-spotify-light-gray max-w-md leading-relaxed">
        We only request permission to read and edit your playlists. Your account stays in your
        browser &mdash; nothing is sent to our servers.
      </p>

      <div className="mt-6 w-full max-w-lg bg-white/5 border border-white/10 rounded-xl p-4 text-left text-xs leading-relaxed text-spotify-light-gray">
        <strong className="text-white block mb-1 font-semibold">How it works:</strong>
        <ol className="list-decimal list-inside space-y-1">
          <li>Connect your Spotify account</li>
          <li>
            Paste your album list (one per line: <code className="text-spotify-green bg-black/40 px-1 py-0.5 rounded">Artist - Album</code>)
          </li>
          <li>Review the matches and pick a tiering strategy</li>
          <li>Publish straight to a new or existing Spotify playlist</li>
        </ol>
      </div>

      <details className="mt-5 text-xs text-spotify-light-gray max-w-lg w-full text-left">
        <summary className="cursor-pointer font-medium hover:text-white transition-colors">
          Deploying this yourself?
        </summary>
        <div className="mt-2 p-3 bg-black/40 rounded-lg border border-white/5 text-[11px] leading-relaxed">
          Add this Redirect URI to your app in the Spotify Developer Dashboard:
          <div className="flex items-center justify-between gap-2 mt-2 bg-black/60 p-2 rounded border border-white/10">
            <code className="text-spotify-green select-all break-all">{redirectUri}</code>
            <button
              onClick={handleCopyUri}
              className="p-1.5 rounded hover:bg-white/10 text-white shrink-0"
              title="Copy to clipboard"
            >
              {copied ? <Check size={14} className="text-spotify-green" /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      </details>
    </div>
  );
};
