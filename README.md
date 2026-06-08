# IPTV Dashboard

A streaming dashboard for free-to-air IPTV channels, combining three public
directories — [iptv-org](https://github.com/iptv-org/iptv),
[Free-TV/IPTV](https://github.com/Free-TV/IPTV) and
[iptvlist](https://github.com/chokechainirand/iptvlist) — plus a bundled local
**Sky** pack (`public/sky.m3u`). Channels are organized **by country**, with a
dedicated **Sports** section and a searchable "All channels" view. Streams play
in-browser via [hls.js](https://github.com/video-dev/hls.js).

Combined live content: **~12,800 playable channels** across **178 countries**,
including **~365 sports channels**. Channels that appear in more than one source
are merged into a single card whose stream list pools every source, giving the
player more fallbacks when a stream is down.

## Tech

- **React 18 + Vite 6** — fast dev server, simple production build
- **hls.js** — plays `.m3u8` (HLS) streams in any modern browser
- No backend required — the app fetches the iptv-org JSON API directly in the browser

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
```

Production build:

```bash
npm run build    # outputs to dist/
npm run preview  # serve the production build locally
```

## How it works

`src/api.js` fetches and joins five iptv-org datasets:

| File | Used for |
|------|----------|
| `channels.json` | channel name, country, categories |
| `streams.json` | the playable `.m3u8` URLs (joined by channel id) |
| `countries.json` | country names + flag emoji |
| `categories.json` | category labels |
| `logos.json` | channel logos |

It keeps only channels that have at least one working stream, drops NSFW
channels, then groups them by country and by category. Channels tagged
`sports` populate the Sports tab.

`src/freetv.js` and `src/iptvlist.js` then parse the two M3U sources:
- **Free-TV** (`src/freetv.js`) — reads `tvg-country` (or the `Name.cc` id suffix).
- **iptvlist** (`src/iptvlist.js`) — has no `tvg-country`, so the country is
  resolved from the `group-title` country name (e.g. `USA PLUTO` → US), with an
  alias table for spellings iptv-org doesn't use (USA, UK, TURKEY, KOREA…).

`src/sky.js` parses the bundled `public/sky.m3u` (a minimal name-only pack):
country is recovered from a flag emoji or a trailing country token in the name,
and the category from name keywords (it's sports-heavy, so most land in the
Sports tab). To add your own pack, drop an `.m3u` in `public/` and add a loader
in the same shape.

All M3U sources keep only HLS (`.m3u8`/`.ts`) URLs and feed a shared
`mergeSource()` in `api.js`: a channel whose id already exists gains the URL as
an extra fallback source, while genuinely new channels are added. Channels with
no resolution metadata simply show no quality badge, and any channel whose
country can't be resolved (music/webcam/misc feeds) lands in an **Other** bucket
shown last in the country list.

## Project structure

```
index.html
src/
  main.jsx              app entry
  App.jsx               tabs, search, country navigation, state
  api.js                fetches + organizes the iptv-org data
  styles.css            dark streaming-app theme
  components/
    Player.jsx          hls.js modal player (with source fallback)
    ChannelGrid.jsx     responsive grid of channels
    ChannelCard.jsx     single channel tile
```

## Notes & limitations

- These are **publicly listed, free-to-air** streams aggregated by iptv-org.
  Availability changes constantly — a stream that works today may be offline
  or geo-restricted tomorrow. The player offers a **"Try next source"** button
  when a channel has multiple stream URLs.
### Playback & the stream proxy

Many IPTV streams won't play in a browser **directly** — not because of a bug,
but because of browser security: the stream server often sends no CORS header
(so hls.js can't read it), serves over `http` (mixed-content on an `https`
page), or requires a `Referer`/`User-Agent` the browser won't set for media.
(They still work in VLC because VLC isn't a browser.)

To fix this the app includes a small **stream proxy** (`server/proxy.js`):

- It fetches the stream **server-side** (where CORS/mixed-content don't apply),
  follows redirects, can add a `Referer`/`User-Agent`, and re-serves it with
  `Access-Control-Allow-Origin: *`.
- For HLS it rewrites the `.m3u8` so sub-playlists, keys and segments all route
  back through the proxy too (tokens preserved).
- The player routes every source **through the proxy by default**, falling back
  to a **direct** attempt if the proxy is unavailable, and only then moving on
  to the next source. The footer shows `· via proxy` or `· direct` accordingly.

In `npm run dev` the proxy is mounted by a Vite plugin automatically. In
production the Express server (`server/index.js`) serves the built app **and**
the proxy from one process — so you must run it on a Node host (not a pure
static host) for proxied playback to work. Without the proxy the app still
runs; only directly-playable streams will work.

Note: a proxy can't fix a stream that is genuinely **offline** or
**geo-restricted to a region your server isn't in** — those will still fail.

## Deploy

Because of the stream proxy, deploy to a **Node host** (Render, Railway, Fly.io,
a VPS, etc.) rather than a static-only host:

```bash
npm run build      # builds dist/
npm start          # Express serves dist/ + /proxy on PORT (default 8080)
```

The static `dist/` can still be hosted anywhere on its own, but proxied
playback (the majority of streams) needs `server/index.js` running.
