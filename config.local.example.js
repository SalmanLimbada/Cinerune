// Optional local-only override for fast UI testing without pushing.
// 1) Copy this file to config.local.js
// 2) Add your local key values
// 3) Do not commit config.local.js
window.CINERUNE_CONFIG = {
  ...window.CINERUNE_CONFIG,
  tmdbApiKey: "YOUR_LOCAL_TMDB_API_KEY",
  tmdbReadAccessToken: "YOUR_LOCAL_TMDB_READ_ACCESS_TOKEN",
  tmdbLanguage: "en-US"
};
