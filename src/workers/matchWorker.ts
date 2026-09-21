import { parseAlbumLine, similarity, normalizeAlbumName } from '../utils/fuzzyMatch';

self.onmessage = (e: MessageEvent<{ type: 'PARSE_LINES'; lines: string[] }>) => {
  if (e.data.type === 'PARSE_LINES') {
    const results = e.data.lines.map((line, index) => {
      const parsed = parseAlbumLine(line);
      return { index, line, ...parsed };
    });
    self.postMessage({ type: 'PARSE_RESULT', results });
  }
};

export { similarity, normalizeAlbumName };
