import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { parseAlbumLine } from '../utils/fuzzyMatch';
import { CheckCircle2, AlertCircle } from 'lucide-react';

const PLACEHOLDERS = [
  'The Beatles - Abbey Road\nPink Floyd - The Wall',
  'Kendrick Lamar - To Pimp a Butterfly\nJames Blake - Overgrown',
  'Fleetwood Mac - Rumours\nTom Misch - Geography',
  'Frank Ocean - Blonde\nA$AP Rocky - At Long Last A$AP',
];

export const AlbumInput: React.FC = () => {
  const { albumListText, setAlbumListText, isProcessing } = useAppStore();
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  // Rotate placeholders every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex(prev => (prev + 1) % PLACEHOLDERS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Compute line numbers and validation state
  const lineCount = useMemo(() => {
    return Math.max(1, albumListText.split('\n').length);
  }, [albumListText]);

  const validation = useMemo(() => {
    const lines = albumListText.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parsed = parseAlbumLine(line);
      if (parsed.error) {
        return {
          isValid: false,
          message: `Line ${i + 1}: ${parsed.error}`,
        };
      }
    }

    const nonEmptyCount = lines.filter(l => l.trim()).length;
    if (nonEmptyCount === 0) {
      return { isValid: true, message: 'Ready to process' };
    }
    return { isValid: true, message: `All ${nonEmptyCount} album line(s) formatted correctly!` };
  }, [albumListText]);

  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold uppercase tracking-wider text-spotify-light-gray flex items-center gap-1">
          <span>Album List</span>
          <span className="text-spotify-green">*</span>
        </label>
        <span className="text-xs text-spotify-light-gray">
          Format: <code className="text-spotify-green font-mono">Artist - Album</code>
        </span>
      </div>

      <div
        className={`relative flex rounded-xl border bg-black/40 overflow-hidden font-mono text-xs sm:text-sm transition-all ${
          !validation.isValid && albumListText.trim()
            ? 'border-red-500/50 shadow-[0_0_12px_rgba(239,68,68,0.15)]'
            : 'border-white/10 focus-within:border-spotify-green/70'
        }`}
      >
        {/* Line Numbers */}
        <div
          ref={lineNumbersRef}
          aria-hidden="true"
          className="w-10 sm:w-12 select-none py-3 px-2 text-right bg-white/[0.02] border-r border-white/10 text-spotify-light-gray/40 overflow-hidden"
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i + 1} className="leading-6">
              {i + 1}
            </div>
          ))}
        </div>

        {/* Text Area */}
        <textarea
          ref={textareaRef}
          value={albumListText}
          onChange={e => setAlbumListText(e.target.value)}
          onScroll={handleScroll}
          disabled={isProcessing}
          placeholder={PLACEHOLDERS[placeholderIndex]}
          rows={7}
          spellCheck={false}
          className="flex-1 p-3 bg-transparent text-white placeholder-spotify-light-gray/30 focus:outline-none resize-y leading-6 font-mono"
        />
      </div>

      {/* Validation Banner */}
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${
          !validation.isValid && albumListText.trim()
            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
            : albumListText.trim()
            ? 'bg-spotify-green/10 text-spotify-green border border-spotify-green/20'
            : 'text-spotify-light-gray'
        }`}
      >
        {!validation.isValid && albumListText.trim() ? (
          <AlertCircle size={15} className="shrink-0 text-red-400" />
        ) : (
          <CheckCircle2
            size={15}
            className={`shrink-0 ${albumListText.trim() ? 'text-spotify-green' : 'opacity-40'}`}
          />
        )}
        <span>{validation.message}</span>
      </div>
    </div>
  );
};
