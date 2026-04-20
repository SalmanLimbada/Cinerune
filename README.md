# Cinerune

Cinerune is a family-ready movie and TV launcher using Vidking embed URLs.

## New upgraded features

- Public web deployment support (not limited to localhost)
- Email/password login (Supabase Auth)
- Cloud watch-progress sync across devices
- Continue Watching from synced account data
- Smart app-level auto-next episode option
- Fast UI with lazy loading and service-worker cache

## 1) Put Cinerune online (free)

Use Cloudflare Pages, Netlify, or Vercel. Easiest path:

### Netlify Drop (no CLI)

1. Open https://app.netlify.com/drop
2. Drag this whole project folder into Netlify Drop
3. Netlify gives you a public URL like `https://cinerune-xxxx.netlify.app`
4. Share that URL with family devices

Optional: connect a custom domain later.

## 2) Enable login + progress sync (Supabase)

1. Create a free Supabase project at https://supabase.com
2. In Supabase dashboard, open SQL Editor and run:

```sql
create table if not exists public.watch_progress (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  content_id bigint not null,
  season_number integer not null default 1,
  episode_number integer not null default 1,
  timestamp_seconds integer not null default 0,
  duration_seconds integer not null default 0,
  progress_percent numeric not null default 0,
  updated_at timestamptz not null default now()
);

create unique index if not exists watch_progress_unique
on public.watch_progress (user_id, media_type, content_id, season_number, episode_number);

alter table public.watch_progress enable row level security;

create policy "users can read own progress"
on public.watch_progress
for select
using (auth.uid() = user_id);

create policy "users can insert own progress"
on public.watch_progress
for insert
with check (auth.uid() = user_id);

create policy "users can update own progress"
on public.watch_progress
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

3. In Supabase, go to Project Settings > API
4. Copy:
- Project URL
- Publishable key

5. Open config.js and fill values:

```js
window.CINERUNE_CONFIG = {
  supabaseUrl: "https://YOUR-PROJECT.supabase.co",
  supabasePublishableKey: "YOUR_PUBLISHABLE_KEY"
};
```

6. Redeploy site (or re-upload folder in Netlify Drop)

## 3) TMDB key for richer browsing

Inside Cinerune app:
1. Open Settings
2. Paste TMDB API key
3. Save Settings

Without TMDB key, Quick Launch by TMDB ID still works.

## 4) Auto-next episode options

In Settings:
- Next episode (Vidking UI option)
- Smart auto-next episode (Cinerune app-level fallback)

Turn on both for the Loklok-style flow.

## Local testing (optional)

Run a server before deployment:

```bash
python -m http.server 5500
```

Open http://localhost:5500

## Notes

- This app is for authorized personal/family use only.
- Keep the Supabase publishable key in config.js (public key is expected to be public).
- Do not put any secret service-role key in frontend files.
