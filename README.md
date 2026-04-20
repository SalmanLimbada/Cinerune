# Cinerune

Cinerune is a private, family-focused streaming hub built for smooth playback and simple cross-device progress sync.

## Project Overview

Cinerune combines a curated home feed, embedded playback, and account-based watch continuity in a single lightweight web app.

### Core Experience

- Mobile-first home page with clear sections
- Continue Watching at the top for instant resume
- Curated movie and series rails for fast browsing
- Embedded Vidking player with configurable playback options
- Automatic progress tracking and account sync via Supabase

### Account and Sync

- Sign up and sign in using username or email
- Cloud progress is tied to user accounts
- Resume state is preserved across phones, laptops, and TVs
- Manual Sync Now action is available from the account panel

### Playback Behavior

- Supports movie and TV playback routes
- Resume time is passed to player when available
- Optional smart auto-next for TV episodes
- Configurable color, autoplay, episode selector, and next-episode controls

## Architecture

Cinerune is a static frontend application.

### Files

- index.html: Main app structure and UI sections
- styles.css: Responsive styling and visual system
- app.js: App state, auth, feed rendering, progress logic
- config.js: Runtime configuration for Supabase URL and publishable key
- sw.js: Service worker cache strategy for fast repeat loads

### Integrations

- Supabase Auth: account session management
- Supabase Postgres: watch_progress table for synced resume state
- Vidking Embed: playback surface for movies and TV episodes

## Design Goals

- Fast and stable behavior on low and high-end mobile devices
- Clear, minimal navigation with no unnecessary setup friction
- Friendly family usage with simple login and reliable resume
- Clean visual language with readable cards and obvious actions

## Privacy and Security Notes

- Uses Supabase publishable key in frontend configuration
- Never uses secret keys in browser code
- Progress data is protected by Row Level Security policies per user
- Intended for authorized personal and family viewing usage
