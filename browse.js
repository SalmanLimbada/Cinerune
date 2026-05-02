import {
  initTmdb,
  fetchGenreOptions,
  fetchCountryOptions,
  fetchTitlesByGenre,
  fetchTitlesByCountry
} from "./catalog.js?v=20260502-browse2";
import { initSharedHeader } from "./shared-ui.js?v=20260502-notifications1";
import { initDragScroll } from "./drag-scroll.js?v=20260502-ui1";

const query = new URLSearchParams(window.location.search);
const INPUT_LIMITS = { valueMax: 12, nameMax: 40 };
const mode = query.get("mode") === "country" ? "country" : "genre";
const value = sanitizeText(query.get("value"), INPUT_LIMITS.valueMax);
const name = sanitizeText(query.get("name"), INPUT_LIMITS.nameMax);
const page = Math.max(1, Number(query.get("page") || 1));

const el = {
  browseOptionsGrid: document.getElementById("browseOptionsGrid"),
  browseTitle: document.getElementById("browseTitle"),
  browseOptionsSection: document.getElementById("browseOptionsSection"),
  browseMoviesSection: document.getElementById("browseMoviesSection"),
  browseMoviesGrid: document.getElementById("browseMoviesGrid"),
  browseTvSection: document.getElementById("browseTvSection"),
  browseTvGrid: document.getElementById("browseTvGrid"),
  browsePagination: document.getElementById("browsePagination"),
  posterCardTemplate: document.getElementById("posterCardTemplate")
};

const state = {
  options: []
};

boot();

async function boot() {
  initSharedHeader();
  initTmdb({
    apiBase: String(window.CINERUNE_CONFIG?.apiBase || "").trim(),
    fallbackApiBase: String(window.CINERUNE_CONFIG?.fallbackApiBase || "").trim(),
    language: String(window.CINERUNE_CONFIG?.tmdbLanguage || "en-US").trim()
  });


  if (!value) {
    el.browseTitle.textContent = mode === "country" ? "Countries" : "Genres";
    if (el.browseMoviesGrid) el.browseMoviesGrid.innerHTML = "";
    if (el.browseTvGrid) el.browseTvGrid.innerHTML = "";
    el.browseMoviesSection?.setAttribute("hidden", "");
    el.browseTvSection?.setAttribute("hidden", "");
    el.browsePagination?.setAttribute("hidden", "");
    await renderOptions();
    return;
  }

  el.browseTitle.textContent = `${mode === "country" ? "Country" : "Genre"}: ${name || value}`;
  el.browseOptionsSection?.setAttribute("hidden", "");
  el.browseMoviesSection?.removeAttribute("hidden");
  el.browseTvSection?.removeAttribute("hidden");

  try {
    const data = mode === "country"
      ? await fetchTitlesByCountry(value, page)
      : await fetchTitlesByGenre(Number(value), page);

    renderPosterCards(el.browseMoviesGrid, data.movies || []);
    renderPosterCards(el.browseTvGrid, data.tv || []);
    el.browseMoviesSection?.toggleAttribute("hidden", !(data.movies || []).length);
    el.browseTvSection?.toggleAttribute("hidden", !(data.tv || []).length);
    renderBrowsePagination(data.totalPages || 1);
  } catch {
    el.browseMoviesGrid.innerHTML = "";
    el.browseTvGrid.innerHTML = "";
    el.browseMoviesSection?.setAttribute("hidden", "");
    el.browseTvSection?.setAttribute("hidden", "");
    renderBrowsePagination(1);
  }
}

async function renderOptions() {
  if (!el.browseOptionsGrid) return;

  const data = mode === "country" ? await fetchCountryOptions() : await fetchGenreOptions();
  const options = mode === "country" ? (data || []) : [...(data.movie || []), ...(data.tv || [])];
  state.options = options;

  el.browseOptionsGrid.innerHTML = options.map((entry) => {
    const valueId = mode === "country" ? entry.code : entry.id;
    const label = entry.name;
    const flag = mode === "country" ? countryFlagMarkup(valueId) : "";
    return `
      <button class="mega-menu-item" type="button" data-value="${escapeHtml(valueId)}" data-name="${escapeHtml(label)}">
        ${flag ? `<span class="country-flag" aria-hidden="true">${flag}</span>` : ""}<span>${escapeHtml(label)}</span>
      </button>
    `;
  }).join("");

  [...el.browseOptionsGrid.querySelectorAll(".mega-menu-item")].forEach((node) => {
    node.addEventListener("click", () => {
      const url = new URL("./browse.html", window.location.href);
      url.searchParams.set("mode", mode === "country" ? "country" : "genre");
      url.searchParams.set("value", node.dataset.value);
      url.searchParams.set("name", node.dataset.name || "");
      window.location.href = url.toString();
    });
  });
}

function renderBrowsePagination(totalPages) {
  if (!el.browsePagination) return;
  const total = Math.max(1, Number(totalPages || 1));
  if (total <= 1) {
    el.browsePagination.setAttribute("hidden", "");
    el.browsePagination.innerHTML = "";
    return;
  }

  const pages = buildPagerPages(page, total);
  el.browsePagination.innerHTML = pages.map((entry) => {
    if (entry.type === "gap") {
      return `<span class="pager-btn ghost">…</span>`;
    }
    const active = entry.page === page ? " active" : "";
    return `<a class="pager-btn${active}" href="${buildBrowseHref(entry.page)}">${entry.label}</a>`;
  }).join("");

  el.browsePagination.removeAttribute("hidden");
}

function buildBrowseHref(nextPage) {
  const url = new URL("./browse.html", window.location.href);
  url.searchParams.set("mode", mode === "country" ? "country" : "genre");
  if (value) url.searchParams.set("value", value);
  if (name) url.searchParams.set("name", name);
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

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sanitizeText(value, maxLen) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return trimmed.slice(0, maxLen);
}

function renderPosterCards(container, items) {
  container.innerHTML = "";
  const fragment = document.createDocumentFragment();

  items.slice(0, 24).forEach((item) => {
    const node = el.posterCardTemplate.content.firstElementChild.cloneNode(true);
    const button = node.querySelector(".poster-btn");
    const image = node.querySelector(".poster-img");
    const title = node.querySelector(".poster-title");
    const sub = node.querySelector(".poster-sub");

    setPosterImage(image, item);
    image.alt = `${item.title} poster`;
    title.textContent = item.title;
    sub.textContent = [item.mediaType === "movie" ? "Movie" : "TV", item.year].filter(Boolean).join(" | ");

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

  container.appendChild(fragment);
  initDragScroll();
}

function countryFlagMarkup(code) {
  const normalized = String(code || "").trim().toLowerCase();
  const mapped = normalizeCountryFlagCode(normalized);
  if (!mapped) return "";
  const src = `https://flagcdn.com/24x18/${mapped}.png`;
  return `<img class="country-flag-image" src="${escapeHtml(src)}" alt="" aria-hidden="true" loading="lazy" decoding="async" referrerpolicy="no-referrer" />`;
}

function normalizeCountryFlagCode(code) {
  const value = String(code || "").trim().toLowerCase();
  if (!value) return "";
  const aliases = {
    uk: "gb",
    tp: "tl",
    yu: "rs",
    zr: "cd",
    dd: "de",
    fx: "fr",
    cs: "rs",
    su: "ru",
    an: "nl",
    bu: "mm"
  };
  const mapped = aliases[value] || value;
  return /^[a-z]{2}$/.test(mapped) ? mapped : "";
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
