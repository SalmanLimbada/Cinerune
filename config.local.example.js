// Optional local-only override for fast UI testing without pushing.
// 1) Copy this file to config.local.js
// 2) Add your local key values
// 3) Do not commit config.local.js
window.CINERUNE_CONFIG = {
  ...window.CINERUNE_CONFIG,
  apiBase: "http://127.0.0.1:8787",
  tmdbLanguage: "en-US"
};
