export function sanitizeText(value, maxLen) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return trimmed.slice(0, maxLen);
}

export function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function normalizePlaybackTimestamp(value, duration = 0) {
  const timestamp = Math.floor(Number(value || 0));
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 0;

  const runtime = Math.floor(Number(duration || 0));
  if (runtime > 0) {
    return timestamp <= runtime + 60 ? Math.max(0, timestamp) : 0;
  }

  // Playback positions should be seconds. Epoch millisecond values from embeds
  // are far larger and create impossible resume times in Continue Watching.
  return timestamp <= 24 * 60 * 60 ? timestamp : 0;
}

export function buildWatchHref(id, mediaType, season = 1, episode = 1, resume = false) {
  const url = new URL("./watch.html", window.location.href);
  url.searchParams.set("id", String(id));
  url.searchParams.set("type", mediaType === "tv" ? "tv" : "movie");
  if (mediaType === "tv") {
    url.searchParams.set("s", String(season || 1));
    url.searchParams.set("e", String(episode || 1));
  }
  if (resume) {
    url.searchParams.set("resume", "1");
  }
  return url.toString();
}

export function getLatestProgressEntry(progress, id, mediaType) {
  const normalizedType = mediaType === "tv" ? "tv" : "movie";
  const normalizedId = Number(id || 0);
  if (!normalizedId || !progress || typeof progress !== "object") return null;

  return Object.values(progress)
    .filter((entry) => (
      entry?.mediaType === normalizedType
      && Number(entry?.id || 0) === normalizedId
      && normalizePlaybackTimestamp(entry?.timestamp, entry?.duration) > 8
      && Number(entry?.progress || 0) < 98
    ))
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0] || null;
}

export function buildResumableWatchHref(item, progress, fallbackResume = false) {
  const mediaType = item?.mediaType === "tv" ? "tv" : "movie";
  const latest = getLatestProgressEntry(progress, item?.id, mediaType);
  const season = latest?.season || item?.season || item?.defaultSeason || 1;
  const episode = latest?.episode || item?.episode || item?.defaultEpisode || 1;
  return buildWatchHref(item?.id, mediaType, season, episode, Boolean(latest) || fallbackResume);
}

export function formatSeconds(value) {
  const total = Math.max(0, Math.floor(Number(value || 0)));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function buildPosterPlaceholder(title) {
  const safeTitle = escapeHtml(String(title || "Cinerune").slice(0, 28));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="#123a5c"/><stop offset="100%" stop-color="#071528"/></linearGradient></defs><rect width="300" height="450" fill="url(#g)"/><rect x="22" y="22" width="256" height="406" rx="18" fill="rgba(255,255,255,0.045)" stroke="rgba(126,216,255,0.18)"/><text x="150" y="214" fill="#e8f1fb" font-family="Arial, sans-serif" font-size="20" font-weight="700" text-anchor="middle">${safeTitle}</text><text x="150" y="246" fill="#9fb6d0" font-family="Arial, sans-serif" font-size="12" text-anchor="middle">Poster loading unavailable</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function setPosterImage(image, item, options = {}) {
  if (!image) return;
  const fallback = buildPosterPlaceholder(item?.title);
  image.loading = options.eager ? "eager" : "lazy";
  image.decoding = "async";
  if (options.eager) image.fetchPriority = "high";
  const srcset = buildTmdbPosterSrcSet(item?.poster);
  if (srcset) {
    image.srcset = srcset;
    image.sizes = options.sizes || "(max-width: 640px) 42vw, (max-width: 1100px) 24vw, 185px";
  } else {
    image.removeAttribute("srcset");
    image.removeAttribute("sizes");
  }
  image.onload = () => image.classList.add("is-loaded");
  image.onerror = () => {
    image.onerror = null;
    image.onload = null;
    image.removeAttribute("srcset");
    image.removeAttribute("sizes");
    image.classList.add("is-loaded");
    image.src = fallback;
  };
  image.src = item?.poster || fallback;
  if (!item?.poster) image.classList.add("is-loaded");
}

function buildTmdbPosterSrcSet(src) {
  const value = String(src || "");
  const match = value.match(/^https:\/\/image\.tmdb\.org\/t\/p\/w\d+(.+)$/);
  if (!match) return "";
  const path = match[1];
  return [
    `https://image.tmdb.org/t/p/w185${path} 185w`,
    `https://image.tmdb.org/t/p/w342${path} 342w`,
    `https://image.tmdb.org/t/p/w500${path} 500w`
  ].join(", ");
}

export function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}
