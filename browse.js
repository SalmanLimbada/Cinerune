import {
  initTmdb,
  fetchGenreOptions,
  fetchCountryOptions,
  fetchTitlesByGenre,
  fetchTitlesByCountry
} from "./catalog.js?v=20260427c";

const query = new URLSearchParams(window.location.search);
const INPUT_LIMITS = { valueMax: 12, nameMax: 40 };
const mode = query.get("mode") === "country" ? "country" : "genre";
const value = sanitizeText(query.get("value"), INPUT_LIMITS.valueMax);
const name = sanitizeText(query.get("name"), INPUT_LIMITS.nameMax);
const page = Math.max(1, Number(query.get("page") || 1));

const el = {
  browseOptionsGrid: document.getElementById("browseOptionsGrid"),
  browseTitle: document.getElementById("browseTitle"),
  browseMoviesGrid: document.getElementById("browseMoviesGrid"),
  browseTvGrid: document.getElementById("browseTvGrid"),
  browsePagination: document.getElementById("browsePagination"),
  posterCardTemplate: document.getElementById("posterCardTemplate")
};

const state = {
  options: []
};

boot();

async function boot() {
  initTmdb({
    apiBase: String(window.CINERUNE_CONFIG?.apiBase || "").trim(),
    language: String(window.CINERUNE_CONFIG?.tmdbLanguage || "en-US").trim()
  });


  if (!value) {
    el.browseTitle.textContent = mode === "country" ? "Countries" : "Genres";
    if (el.browseMoviesGrid) el.browseMoviesGrid.innerHTML = "";
    if (el.browseTvGrid) el.browseTvGrid.innerHTML = "";
    await renderOptions();
    return;
  }

  el.browseTitle.textContent = `${mode === "country" ? "Country" : "Genre"}: ${name || value}`;

  try {
    const data = mode === "country"
      ? await fetchTitlesByCountry(value, page)
      : await fetchTitlesByGenre(Number(value), page);

    renderPosterCards(el.browseMoviesGrid, data.movies || []);
    renderPosterCards(el.browseTvGrid, data.tv || []);
    renderBrowsePagination(data.totalPages || 1);
  } catch {
    el.browseMoviesGrid.innerHTML = "";
    el.browseTvGrid.innerHTML = "";
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
    return `
      <button class="mega-menu-item" type="button" data-value="${escapeHtml(valueId)}" data-name="${escapeHtml(label)}">
        ${escapeHtml(label)}
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
    if (!item?.poster) return;

    const node = el.posterCardTemplate.content.firstElementChild.cloneNode(true);
    const button = node.querySelector(".poster-btn");
    const image = node.querySelector(".poster-img");
    const title = node.querySelector(".poster-title");
    const sub = node.querySelector(".poster-sub");

    image.src = item.poster;
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
}
