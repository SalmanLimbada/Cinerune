# Cinerune

Cinerune is a private, family-focused streaming web app with a clean home page and a dedicated watch page.

## What Cinerune Is

Cinerune is designed to feel simple on mobile while still offering account sync and full-screen watching comfort on bigger screens.

## Core Product Experience

- Home page with separate Movies and TV Shows sections
- Continue Watching at the top of home with one-tap resume
- Dedicated Watch page opened when selecting any title
- Playback settings directly under the player on the watch page
- TV controls with season and episode selectors plus episode counts
- Cloud sync support with Supabase-authenticated accounts

## Key Technical Features

- Static frontend architecture
- Embedded player integration
- Local resume tracking with cloud synchronization
- Username-or-email style sign-up/sign-in input flow
- Mobile-first responsive layout and interaction model
- Service worker caching for faster repeat visits

## Repository Structure

- index.html: Home page shell
- watch.html: Dedicated watch experience
- app.js: Home rendering, auth, continue watching, cloud sync helpers
- watch.js: Player page behavior, episode controls, settings, progress updates
- catalog.js: Title catalog and TV season/episode metadata
- styles.css: Shared visual system and responsive UI styles
- config.js: Runtime Supabase configuration
- sw.js: Service worker strategy and asset caching

## Product Intent

Cinerune focuses on clarity first:

- Immediate navigation from home to watching
- Easy resume without technical friction
- Consistent cross-device account behavior
- Cleaner UI with obvious sections and controls
