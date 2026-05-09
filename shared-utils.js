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
  image.onload = () => image.classList.add("is-loaded");
  image.onerror = () => {
    image.onerror = null;
    image.onload = null;
    image.classList.add("is-loaded");
    image.src = fallback;
  };
  image.src = item?.poster || fallback;
  if (!item?.poster) image.classList.add("is-loaded");
}

export function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}
