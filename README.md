# Cinerune

Static streaming-style web app with a home page, watch page, local resume, and optional cloud sync via Supabase.

## Features

- Home, search, and browse flows for movies and TV
- Continue Watching row with resume support
- Watch page with season/episode controls
- Embedded player integration
- Optional account sync and cloud progress

## Project Structure

- index.html: Home page shell
- watch.html: Watch page
- app.js: Home rendering, auth, continue watching, cloud sync
- watch.js: Player behavior, episode controls, progress updates
- catalog.js: TMDB catalog and metadata helpers
- styles.css: Visual system and responsive layout
- config.js: Runtime API base configuration
- worker/index.js: Cloudflare Worker API
- wrangler.toml: Worker configuration

## Cloudflare Worker

The app expects a worker API for auth, progress sync, and TMDB requests.

1. Create a KV namespace for rate limiting.
2. Set Worker secrets:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `TMDB_READ_TOKEN`
3. Update `wrangler.toml` with the KV namespace ID.
4. Deploy the worker.
5. Set `apiBase` in `config.js` (production) or `config.local.js` (local).

## Local Development

1. Copy `config.local.example.js` to `config.local.js`.
2. Set `apiBase` to the local worker dev URL (default: `http://127.0.0.1:8787`).
3. Run a local HTTP server so ES modules load correctly:

```bash
python3 -m http.server 5173
```

Then open `http://localhost:5173`.
