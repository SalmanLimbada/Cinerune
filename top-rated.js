import {
  initTmdb,
  fetchTopRatedPage
} from "./catalog.js?v=20260501-fix1";
import { initSharedHeader } from "./shared-ui.js?v=20260502-notifications1";
import { initDragScroll } from "./drag-scroll.js?v=20260502-ui1";

const query = new URLSearchParams(window.location.search);
let mediaType = query.get("type") === "tv" ? "tv" : "movie";
let page = Math.max(1, Number(query.get("page") || 1));
const cache = { movie: new Map(), tv: new Map() };
const totals = { movie: 1, tv: 1 };
const loading = { movie: new Map(), tv: new Map() };

const el = {
  topRatedTitle: document.getElementById("topRatedTitle"),
  topRatedStatus: document.getElementById("topRatedStatus"),
  topRatedGrid: document.getElementById("topRatedGrid"),
  topRatedPagination: document.getElementById("topRatedPagination"),
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

  bindTypeToggle();
  bindPagination();
  await setMediaType(mediaType, { replace: true });
}

function bindTypeToggle() {
  el.topRatedMoviesLink?.addEventListener("click", () => setMediaType("movie"));
  el.topRatedTvLink?.addEventListener("click", () => setMediaType("tv"));
}

async function setMediaType(nextType, options = {}) {
  if (nextType !== "movie" && nextType !== "tv") return;
  if (mediaType === nextType && cache[nextType].has(page)) {
    renderFromCache(nextType, page);
    return;
  }

  if (mediaType !== nextType) {
    page = 1;
  }
  mediaType = nextType;
  updateToggleState();
  updateUrl(options.replace);

  await ensureTopRated(nextType, page);
  renderFromCache(nextType, page);
}

function updateToggleState() {
  el.topRatedMoviesLink?.classList.toggle("active", mediaType === "movie");
  el.topRatedTvLink?.classList.toggle("active", mediaType === "tv");
  el.topRatedTitle.textContent = mediaType === "tv" ? "Top Rated TV Shows" : "Top Rated Movies";
}

function updateUrl(replace = false) {
  const url = new URL(window.location.href);
  url.searchParams.set("type", mediaType);
  url.searchParams.set("page", String(page));
  if (replace) {
    window.history.replaceState({}, "", url.toString());
  } else {
    window.history.pushState({}, "", url.toString());
  }
}

async function ensureTopRated(type, pageNumber) {
  if (cache[type].has(pageNumber)) return;
  if (loading[type].has(pageNumber)) {
    await loading[type].get(pageNumber);
    return;
  }
  const pending = fetchTopRatedPage(type, pageNumber)
    .then((result) => {
      cache[type].set(pageNumber, result.items || []);
      totals[type] = Math.max(1, Number(result.totalPages || 1));
    })
    .catch(() => {
      cache[type].set(pageNumber, []);
      totals[type] = Math.max(1, totals[type] || 1);
    })
    .finally(() => {
      loading[type].delete(pageNumber);
    });
  loading[type].set(pageNumber, pending);
  await pending;
}

function renderFromCache(type, pageNumber) {
  const items = cache[type].get(pageNumber) || [];
  renderPosterCards(items);
  renderTopRatedPagination(totals[type]);
  if (!items.length) {
    el.topRatedStatus.textContent = "Could not load top rated titles right now.";
    return;
  }
  el.topRatedStatus.textContent = `Page ${pageNumber} of ${totals[type]} • Top rated ${type === "tv" ? "TV shows" : "movies"}.`;
}

function bindPagination() {
  if (!el.topRatedPagination) return;
  el.topRatedPagination.addEventListener("click", (event) => {
    const link = event.target.closest("a[data-page]");
    if (!link) return;
    event.preventDefault();
    const nextPage = Number(link.dataset.page) || 1;
    if (nextPage === page) return;
    page = nextPage;
    updateUrl(true);
    void ensureTopRated(mediaType, page).then(() => renderFromCache(mediaType, page));
  });
}

function renderTopRatedPagination(totalPages) {
  if (!el.topRatedPagination) return;
  const total = Math.max(1, Number(totalPages || 1));
  if (total <= 1) {
    el.topRatedPagination.setAttribute("hidden", "");
    el.topRatedPagination.innerHTML = "";
    return;
  }
  const pages = buildPagerPages(page, total);
  el.topRatedPagination.innerHTML = pages.map((entry) => {
    if (entry.type === "gap") {
      return `<span class="pager-btn ghost">…</span>`;
    }
    const active = entry.page === page ? " active" : "";
    return `<a class="pager-btn${active}" data-page="${entry.page}" href="${buildTopRatedHref(entry.page)}">${entry.label}</a>`;
  }).join("");
  el.topRatedPagination.insertAdjacentHTML("beforeend", `
    <span class="pager-jump">
      <input class="pager-input" type="number" min="1" max="${total}" placeholder="#" aria-label="Go to page" />
      <button class="pager-go" type="button" data-total="${total}">Go</button>
    </span>
  `);
  const input = el.topRatedPagination.querySelector(".pager-input");
  const goBtn = el.topRatedPagination.querySelector(".pager-go");
  const jump = () => {
    if (!input) return;
    const nextPage = Math.max(1, Math.min(total, Number(input.value || 0)));
    if (!nextPage) return;
    page = nextPage;
    updateUrl(true);
    void ensureTopRated(mediaType, page).then(() => renderFromCache(mediaType, page));
  };
  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      jump();
    }
  });
  goBtn?.addEventListener("click", jump);
  el.topRatedPagination.removeAttribute("hidden");
}

function buildTopRatedHref(nextPage) {
  const url = new URL("./top-rated.html", window.location.href);
  url.searchParams.set("type", mediaType);
  url.searchParams.set("page", String(nextPage));
  return url.toString();
}

function buildPagerPages(current, total) {
  const pages = [];
  const clamp = (value) => Math.max(1, Math.min(total, value));
  const start = clamp(current - 2);
  const end = clamp(current + 2);

  pages.push({ type: "page", page: 1, label: "1" });
  if (start > 2) pages.push({ type: "gap" });

  for (let p = start; p <= end; p += 1) {
    if (p === 1 || p === total) continue;
    pages.push({ type: "page", page: p, label: String(p) });
  }

  if (end < total - 1) pages.push({ type: "gap" });
  if (total > 1) pages.push({ type: "page", page: total, label: String(total) });

  return pages;
}

function renderPosterCards(items) {
  el.topRatedGrid.innerHTML = "";
  const fragment = document.createDocumentFragment();

  items.forEach((item) => {
    const node = el.posterCardTemplate.content.firstElementChild.cloneNode(true);
    const link = node.querySelector(".poster-btn");
    const image = node.querySelector(".poster-img");
    const title = node.querySelector(".poster-title");
    const sub = node.querySelector(".poster-sub");

    setPosterImage(image, item);
    image.alt = `${item.title} poster`;
    title.textContent = item.title;
    const typeLabel = item.mediaType === "movie" ? "Movie" : "TV";
    const yearLabel = item.year ? String(item.year) : "";
    const ratingLabel = item.rating ? `${item.rating}/10` : "";
    const baseMeta = [typeLabel, yearLabel].filter(Boolean).map(escapeHtml).join(" | ");
    if (ratingLabel) {
      sub.innerHTML = `${baseMeta}${baseMeta ? " " : ""}<span class="rating-pill">${escapeHtml(ratingLabel)}</span>`;
    } else {
      sub.textContent = baseMeta;
    }

    const url = new URL("./watch.html", window.location.href);
    url.searchParams.set("id", String(item.id));
    url.searchParams.set("type", item.mediaType === "tv" ? "tv" : "movie");
    if (item.mediaType === "tv") {
      url.searchParams.set("s", "1");
      url.searchParams.set("e", "1");
    }
    if (link) link.href = url.toString();

    fragment.appendChild(node);
  });

  el.topRatedGrid.appendChild(fragment);
  initDragScroll();
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
