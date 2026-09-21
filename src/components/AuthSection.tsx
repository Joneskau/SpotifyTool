import React, { useState } from 'react';
import { initiateLogin, getRedirectUri, SPOTIFY_SCOPES } from '../services/spotifyAuth';
import { useAppStore } from '../store/useAppStore';
import { Check, Copy, Shield, Database, Clock, ChevronDown, ChevronUp } from 'lucide-react';

export const AuthSection: React.FC = () => {
  const { storageType, setStorageType } = useAppStore();
  const [copied, setCopied] = useState(false);
  const [showScopes, setShowScopes] = useState(true);
  const redirectUri = getRedirectUri();

  const handleCopyUri = () => {
    navigator.clipboard.writeText(redirectUri);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConnect = () => {
    initiateLogin(storageType);
  };

  return (
    <div className="w-full flex flex-col items-center text-center py-6 space-y-6">
      {/* Primary Connect Action */}
      <div className="w-full max-w-sm space-y-3">
        <button
          onClick={handleConnect}
          className="w-full py-3.5 px-6 rounded-full bg-spotify-green hover:bg-spotify-green-hover text-black font-bold text-base shadow-lg shadow-spotify-green/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          Connect to Spotify
        </button>

        <p className="text-xs text-spotify-light-gray leading-relaxed">
          Runs 100% in your browser using official Spotify PKCE OAuth. We never run backend servers or
          store your account data.
        </p>
      </div>

      {/* Storage Preference Option */}
      <div className="w-full max-w-lg bg-white/5 border border-white/10 rounded-2xl p-4 text-left space-y-3">
        <div className="flex items-center gap-2 text-white text-xs font-semibold">
          <Database size={15} className="text-spotify-green" />
          <span>Storage Preference</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <label
            className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
              storageType === 'local'
                ? 'bg-spotify-green/10 border-spotify-green/40 text-white'
                : 'bg-black/30 border-white/5 text-spotify-light-gray hover:border-white/20'
            }`}
          >
            <input
              type="radio"
              name="storageType"
              value="local"
              checked={storageType === 'local'}
              onChange={() => setStorageType('local')}
              className="mt-0.5 accent-spotify-green"
            />
            <div className="text-xs">
              <div className="font-semibold text-white">Remember on this device</div>
              <div className="text-[11px] text-spotify-light-gray mt-0.5 leading-snug">
                Stores token in LocalStorage for quick access next time.
              </div>
            </div>
          </label>

          <label
            className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
              storageType === 'session'
                ? 'bg-spotify-green/10 border-spotify-green/40 text-white'
                : 'bg-black/30 border-white/5 text-spotify-light-gray hover:border-white/20'
            }`}
          >
            <input
              type="radio"
              name="storageType"
              value="session"
              checked={storageType === 'session'}
              onChange={() => setStorageType('session')}
              className="mt-0.5 accent-spotify-green"
            />
            <div className="text-xs">
              <div className="font-semibold text-white flex items-center gap-1">
                <Clock size={12} className="text-amber-400" />
                <span>Session-Only</span>
              </div>
              <div className="text-[11px] text-spotify-light-gray mt-0.5 leading-snug">
                Stores token in SessionStorage. Cleared when tab closes.
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* Scopes Transparency Breakdown */}
      <div className="w-full max-w-lg bg-white/5 border border-white/10 rounded-2xl p-4 text-left space-y-3">
        <button
          onClick={() => setShowScopes(!showScopes)}
          className="w-full flex items-center justify-between text-xs font-semibold text-white hover:text-spotify-green transition-colors"
        >
          <div className="flex items-center gap-2">
            <Shield size={15} className="text-spotify-green" />
            <span>Requested Spotify Permissions ({SPOTIFY_SCOPES.length} scopes)</span>
          </div>
          {showScopes ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>

        {showScopes && (
          <div className="space-y-2 pt-1 border-t border-white/5 divide-y divide-white/5 text-xs">
            {SPOTIFY_SCOPES.map(scopeItem => (
              <div key={scopeItem.scope} className="pt-2 pb-1 first:pt-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <code className="text-spotify-green font-mono text-[11px] bg-black/40 px-1.5 py-0.5 rounded border border-white/5">
                    {scopeItem.scope}
                  </code>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-spotify-light-gray font-medium">
                    {scopeItem.category}
                  </span>
                </div>
                <p className="text-[11px] text-spotify-light-gray leading-relaxed">
                  {scopeItem.purpose}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* How It Works Box */}
      <div className="w-full max-w-lg bg-white/5 border border-white/10 rounded-2xl p-4 text-left text-xs leading-relaxed text-spotify-light-gray">
        <strong className="text-white block mb-1.5 font-semibold">How it works:</strong>
        <ol className="list-decimal list-inside space-y-1">
          <li>Connect your Spotify account</li>
          <li>
            Paste your album list (format: <code className="text-spotify-green bg-black/40 px-1 py-0.5 rounded font-mono">Artist - Album</code>)
          </li>
          <li>Review matches and configure popularity tiering</li>
          <li>Publish directly to a new or existing Spotify playlist</li>
        </ol>
      </div>

      {/* Developer Redirect URI Helper */}
      <details className="text-xs text-spotify-light-gray max-w-lg w-full text-left">
        <summary className="cursor-pointer font-medium hover:text-white transition-colors">
          Deploying this yourself?
        </summary>
        <div className="mt-2 p-3 bg-black/40 rounded-xl border border-white/5 text-[11px] leading-relaxed">
          Add this Redirect URI to your Spotify Developer Dashboard:
          <div className="flex items-center justify-between gap-2 mt-2 bg-black/60 p-2 rounded-lg border border-white/10">
            <code className="text-spotify-green font-mono select-all break-all">{redirectUri}</code>
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
