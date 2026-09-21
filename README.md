# 🎵 Spotify Album to Playlist

A modern, client-side web application that turns album lists into smart, customized Spotify playlists with fuzzy matching, popularity tiering, and one-click publishing.

Built with **React 19**, **TypeScript**, **Vite**, **Tailwind CSS**, and **Zustand**.

---

## ✨ Features

- 🔐 **Zero Backend & Client-Side Privacy**: Runs 100% in your browser using Spotify's official OAuth 2.0 PKCE flow. No servers, no credentials stored externally.
- 🔍 **Intelligent Fuzzy Album Matching**: 5-stage search strategy (strict field, loose field, general text, alternative symbols, prefix handling) with Levenshtein confidence scoring.
- 📊 **Smart Playlist Tiering**:
  - **Popularity Halving**: Nested tiers (Top 100%, 50%, 25%...).
  - **Partitioning**: Sequential playlist parts with configurable track caps and zero repeats.
  - **Top N per Album**: Selects top $N$ most popular tracks per album (Single or Multi-tier recursive mode).
  - **Time-Bounded**: Organizes tracks into playlists targeting a specific duration (e.g., 60-minute mixes).
- 🔄 **Edition & Version Switcher**: Easily switch between original releases, Deluxe editions, or Remasters.
- ⚡ **Interactive Review**: Drag-and-drop playlist reordering, grid/list view toggles, and live duration/track count calculators.
- 🛠️ **Error Recovery & Suggestions**: Interactive inline query editing for unfound albums with real-time alternative suggestions.
- 🌙 **Adaptive Themes**: Seamless Dark & Light mode toggle with Spotify design language.

---

## 🚀 Quick Start

### 1. Clone the repository
```bash
git clone https://github.com/Joneskau/SpotifyTool.git
cd SpotifyTool
```

### 2. Install dependencies
```bash
npm install
```

### 3. Start local development server
```bash
npm run dev
```
The app will be running at `http://localhost:5173/`.

---

## 🛠️ Spotify Developer Setup

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Create an App (or open your existing one).
3. In App Settings, add your Redirect URI:
   - For local development: `http://localhost:5173/` (or `http://127.0.0.1:5173/`)
   - For production: `https://your-domain.com/`
4. (Optional) Create a `.env.local` file to specify your own Client ID if desired:
   ```env
   VITE_SPOTIFY_CLIENT_ID=your_spotify_client_id_here
   VITE_SPOTIFY_REDIRECT_URI=http://localhost:5173/
   ```

---

## 🧪 Testing & Build

```bash
# Run Vitest unit tests
npm run test:run

# Check TypeScript types
npx tsc --noEmit

# Build production bundle
npm run build
```

---

## 📄 License

MIT License. Not affiliated with or endorsed by Spotify AB.
