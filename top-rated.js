import {
  initTmdb,
  fetchTopRated
} from "./catalog.js?v=20260501-fix1";
import { initSharedHeader } from "./shared-ui.js";

const query = new URLSearchParams(window.location.search);
const mediaType = query.get("type") === "tv" ? "tv" : "movie";

const el = {
  topRatedTitle: document.getElementById("topRatedTitle"),
  topRatedStatus: document.getElementById("topRatedStatus"),
  topRatedGrid: document.getElementById("topRatedGrid"),
  topRatedMoviesLink: document.getElementById("topRatedMoviesLink"),
  topRatedTvLink: document.getElementById("topRatedTvLink"),
  posterCardTemplate: document.getElementById("posterCardTemplate")
};

boot();

async function boot() {
  initSharedHeader();
  initTmdb({
    apiBase: String(window.CINERUNE_CONFIG?.apiBase || "").trim(),
    fallbackApiBase: String(window.CINERUNE_CONFIG?.fallbackApiBase || "").trim(),
    language: String(window.CINERUNE_CONFIG?.tmdbLanguage || "en-US").trim()
  });

  el.topRatedTitle.textContent = mediaType === "tv" ? "Top Rated TV Shows" : "Top Rated Movies";
  el.topRatedMoviesLink.classList.toggle("active", mediaType === "movie");
  el.topRatedTvLink.classList.toggle("active", mediaType === "tv");

  try {
    const items = await fetchTopRated(mediaType, 3);
    renderPosterCards(items.slice(0, 60));
    el.topRatedStatus.textContent = `${Math.min(items.length, 60)} top rated ${mediaType === "tv" ? "TV shows" : "movies"} right now.`;
  } catch {
    renderPosterCards([]);
    el.topRatedStatus.textContent = "Could not load top rated titles right now.";
  }
}

function renderPosterCards(items) {
  el.topRatedGrid.innerHTML = "";
  const fragment = document.createDocumentFragment();

  items.forEach((item) => {
    const node = el.posterCardTemplate.content.firstElementChild.cloneNode(true);
    const button = node.querySelector(".poster-btn");
    const image = node.querySelector(".poster-img");
    const title = node.querySelector(".poster-title");
    const sub = node.querySelector(".poster-sub");

    setPosterImage(image, item);
    image.alt = `${item.title} poster`;
    title.textContent = item.title;
    sub.textContent = [item.mediaType === "movie" ? "Movie" : "TV", item.year, item.rating ? `${item.rating}/10` : ""]
      .filter(Boolean)
      .join(" | ");

    button.addEventListener("click", () => {
      const url = new URL("./watch.html", window.location.href);
      url.searchParams.set("id", String(item.id));
      url.searchParams.set("type", item.mediaType === "tv" ? "tv" : "movie");
      if (item.mediaType === "tv") {
        url.searchParams.set("s", "1");
        url.searchParams.set("e", "1");
      }
      window.location.href = url.toString();
    });

    fragment.appendChild(node);
  });

  el.topRatedGrid.appendChild(fragment);
}

function setPosterImage(image, item) {
  const fallback = buildPosterPlaceholder(item?.title);
  image.loading = "eager";
  image.decoding = "async";
  image.onerror = () => {
    image.onerror = null;
    image.src = fallback;
  };
  image.src = item?.poster || fallback;
}

function buildPosterPlaceholder(title) {
  const safeTitle = escapeHtml(String(title || "Cinerune").slice(0, 28));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="#123a5c"/><stop offset="100%" stop-color="#071528"/></linearGradient></defs><rect width="300" height="450" fill="url(#g)"/><rect x="22" y="22" width="256" height="406" rx="18" fill="rgba(255,255,255,0.045)" stroke="rgba(126,216,255,0.18)"/><text x="150" y="214" fill="#e8f1fb" font-family="Arial, sans-serif" font-size="20" font-weight="700" text-anchor="middle">${safeTitle}</text><text x="150" y="246" fill="#9fb6d0" font-family="Arial, sans-serif" font-size="12" text-anchor="middle">Poster loading unavailable</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
