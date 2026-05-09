import {
  fetchGenreOptions,
  fetchCountryOptions,
  fetchTitlesByGenre,
  fetchTitlesByCountry
} from "./catalog.js?v=20260508-toggle1";
import { initSharedHeader } from "./shared-ui.js?v=20260508-toggle1";
import { balancePosterGrid, initDragScroll } from "./drag-scroll.js?v=20260508-toggle1";
import { initConfiguredTmdb } from "./shared-state.js?v=20260508-toggle1";
import { buildWatchHref, escapeHtml, sanitizeText, setPosterImage } from "./shared-utils.js?v=20260508-toggle1";

const query = new URLSearchParams(window.location.search);
const INPUT_LIMITS = { valueMax: 12, nameMax: 40 };
const GRID_PAGE_SIZE = 24;
const API_PAGE_SIZE = 20;
const mode = query.get("mode") === "country" ? "country" : "genre";
let mediaType = query.get("type") === "tv" ? "tv" : "movie";
let selectedValue = sanitizeText(query.get("value"), INPUT_LIMITS.valueMax);
let selectedName = sanitizeText(query.get("name"), INPUT_LIMITS.nameMax);
let page = Math.max(1, Number(query.get("page") || 1));

const el = {
  browseOptionsGrid: document.getElementById("browseOptionsGrid"),
  browseTitle: document.getElementById("browseTitle"),
  browseTypeToggle: document.getElementById("browseTypeToggle"),
  browseMoviesLink: document.getElementById("browseMoviesLink"),
  browseTvLink: document.getElementById("browseTvLink"),
  browseOptionsSection: document.getElementById("browseOptionsSection"),
  browseMoviesSection: document.getElementById("browseMoviesSection"),
  browseMoviesGrid: document.getElementById("browseMoviesGrid"),
  browseTvSection: document.getElementById("browseTvSection"),
  browseTvGrid: document.getElementById("browseTvGrid"),
  browsePagination: document.getElementById("browsePagination"),
  posterCardTemplate: document.getElementById("posterCardTemplate")
};

const state = {
  options: [],
  data: null,
  genreOptions: { movie: [], tv: [] },
  genreIndex: {
    byKey: new Map(),
    movieIdToKey: new Map(),
    tvIdToKey: new Map()
  }
};

boot();

async function boot() {
  initSharedHeader();
  initConfiguredTmdb();


  if (!selectedValue) {
    el.browseTitle.textContent = mode === "country" ? "Countries" : "Genres";
    el.browseTypeToggle?.setAttribute("hidden", "");
    if (el.browseMoviesGrid) el.browseMoviesGrid.innerHTML = "";
    if (el.browseTvGrid) el.browseTvGrid.innerHTML = "";
    el.browseMoviesSection?.setAttribute("hidden", "");
    el.browseTvSection?.setAttribute("hidden", "");
    el.browsePagination?.setAttribute("hidden", "");
    await renderOptions();
    return;
  }

  if (mode === "genre") {
    await ensureGenreOptions();
    syncSelectedGenreName();
  }
  el.browseTitle.textContent = `${mode === "country" ? "Country" : "Genre"}: ${selectedName || selectedValue}`;
  updateTypeToggleVisibility();
  bindTypeToggle();
  updateTypeToggle();
  el.browseOptionsSection?.setAttribute("hidden", "");
  el.browseMoviesSection?.toggleAttribute("hidden", mediaType !== "movie");
  el.browseTvSection?.toggleAttribute("hidden", mediaType !== "tv");

  try {
    await loadBrowseData();
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

  const data = mode === "country" ? await fetchCountryOptions() : await ensureGenreOptions();
  const options = mode === "country" ? (data || []) : [...state.genreIndex.byKey.values()];
  state.options = options;

  el.browseOptionsGrid.innerHTML = options.map((entry) => {
    const valueId = mode === "country" ? entry.code : entry.id;
    const label = entry.name;
    const flag = mode === "country" ? countryFlagMarkup(valueId) : "";
    const movieId = entry.movieId ? String(entry.movieId) : "";
    const tvId = entry.tvId ? String(entry.tvId) : "";
    return `
      <button class="mega-menu-item" type="button" data-value="${escapeHtml(valueId)}" data-name="${escapeHtml(label)}" data-movie-id="${escapeHtml(movieId)}" data-tv-id="${escapeHtml(tvId)}">
        ${flag ? `<span class="country-flag" aria-hidden="true">${flag}</span>` : ""}<span>${escapeHtml(label)}</span>
      </button>
    `;
  }).join("");

  [...el.browseOptionsGrid.querySelectorAll(".mega-menu-item")].forEach((node) => {
    node.addEventListener("click", () => {
      const url = new URL("./browse.html", window.location.href);
      url.searchParams.set("mode", mode === "country" ? "country" : "genre");
      if (mode === "country") {
        url.searchParams.set("value", node.dataset.value);
        url.searchParams.set("name", node.dataset.name || "");
        url.searchParams.set("type", mediaType);
      } else {
        const movieId = node.dataset.movieId || "";
        const tvId = node.dataset.tvId || "";
        const nextType = mediaType === "tv" ? (tvId ? "tv" : "movie") : (movieId ? "movie" : "tv");
        const nextValue = nextType === "tv" ? tvId : movieId;
        url.searchParams.set("type", nextType);
        url.searchParams.set("value", nextValue || node.dataset.value);
        url.searchParams.set("name", node.dataset.name || "");
      }
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
    return `<a class="pager-btn${active}" href="${buildBrowseHref(entry.page, mediaType)}">${entry.label}</a>`;
  }).join("");
  el.browsePagination.insertAdjacentHTML("beforeend", `
    <span class="pager-jump">
      <input class="pager-input" type="number" min="1" max="${total}" placeholder="#" aria-label="Go to page" />
      <button class="pager-go" type="button" data-total="${total}">Go</button>
    </span>
  `);
  const input = el.browsePagination.querySelector(".pager-input");
  const goBtn = el.browsePagination.querySelector(".pager-go");
  const jump = () => {
    if (!input) return;
    const nextPage = Math.max(1, Math.min(total, Number(input.value || 0)));
    if (!nextPage) return;
    window.location.href = buildBrowseHref(nextPage, mediaType);
  };
  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      jump();
    }
  });
  goBtn?.addEventListener("click", jump);

  el.browsePagination.removeAttribute("hidden");
}

function buildBrowseHref(nextPage, nextType = mediaType) {
  const url = new URL("./browse.html", window.location.href);
  url.searchParams.set("mode", mode === "country" ? "country" : "genre");
  if (selectedValue) url.searchParams.set("value", selectedValue);
  if (selectedName) url.searchParams.set("name", selectedName);
  if (nextType) url.searchParams.set("type", nextType);
  url.searchParams.set("page", String(nextPage));
  return url.toString();
}

function bindTypeToggle() {
  el.browseMoviesLink?.addEventListener("click", () => setMediaType("movie"));
  el.browseTvLink?.addEventListener("click", () => setMediaType("tv"));
}

async function setMediaType(nextType) {
  if (nextType !== "movie" && nextType !== "tv") return;
  if (mediaType === nextType) return;
  mediaType = nextType;
  if (mode === "genre") {
    const mapped = mapGenreId(nextType);
    if (mapped) {
      selectedValue = String(mapped.id);
      selectedName = String(mapped.name || "");
      page = 1;
    }
  }
  updateTypeToggle();
  updateTypeToggleVisibility();
  updateBrowseUrl();
  await loadBrowseData();
}

function updateTypeToggle() {
  el.browseMoviesLink?.classList.toggle("active", mediaType === "movie");
  el.browseTvLink?.classList.toggle("active", mediaType === "tv");
}

function updateBrowseUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set("mode", mode === "country" ? "country" : "genre");
  if (selectedValue) url.searchParams.set("value", selectedValue);
  if (selectedName) url.searchParams.set("name", selectedName);
  url.searchParams.set("type", mediaType);
  url.searchParams.set("page", String(page));
  window.history.replaceState({}, "", url.toString());
}

function renderBrowseResults() {
  if (!state.data) return;
  if (mediaType === "movie") {
    renderPosterCards(el.browseMoviesGrid, state.data.movies || []);
    el.browseMoviesSection?.toggleAttribute("hidden", false);
    el.browseTvSection?.toggleAttribute("hidden", true);
  } else {
    renderPosterCards(el.browseTvGrid, state.data.tv || []);
    el.browseTvSection?.toggleAttribute("hidden", false);
    el.browseMoviesSection?.toggleAttribute("hidden", true);
  }
}

async function ensureGenreOptions() {
  if (state.genreOptions.movie.length || state.genreOptions.tv.length) return state.genreOptions;
  const data = await fetchGenreOptions();
  state.genreOptions = {
    movie: data?.movie || [],
    tv: data?.tv || []
  };
  state.genreIndex = buildGenreIndex(state.genreOptions);
  return state.genreOptions;
}

function buildGenreIndex(source) {
  const byKey = new Map();
  const movieIdToKey = new Map();
  const tvIdToKey = new Map();
  const addEntry = (entry, type) => {
    const key = normalizeGenreKey(entry.name);
    if (!key) return;
    const existing = byKey.get(key) || { name: entry.name, movieId: null, tvId: null };
    existing.name = existing.name || entry.name;
    if (type === "movie") existing.movieId = entry.id;
    if (type === "tv") existing.tvId = entry.id;
    byKey.set(key, existing);
    if (type === "movie") movieIdToKey.set(String(entry.id), key);
    if (type === "tv") tvIdToKey.set(String(entry.id), key);
  };
  (source.movie || []).forEach((entry) => addEntry(entry, "movie"));
  (source.tv || []).forEach((entry) => addEntry(entry, "tv"));
  return { byKey, movieIdToKey, tvIdToKey };
}

function normalizeGenreKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function genreTokens(name) {
  const stop = new Set(["and", "the", "tv", "movie", "movies", "series", "show", "shows"]);
  return normalizeGenreKey(name)
    .split(" ")
    .filter((token) => token && !stop.has(token));
}

function genreBigramSimilarity(a, b) {
  const left = normalizeGenreKey(a);
  const right = normalizeGenreKey(b);
  if (!left || !right) return 0;
  const build = (value) => {
    const padded = ` ${value} `;
    const grams = new Set();
    for (let i = 0; i < padded.length - 1; i += 1) {
      grams.add(padded.slice(i, i + 2));
    }
    return grams;
  };
  const leftSet = build(left);
  const rightSet = build(right);
  if (!leftSet.size || !rightSet.size) return 0;
  let shared = 0;
  leftSet.forEach((gram) => {
    if (rightSet.has(gram)) shared += 1;
  });
  return (2 * shared) / (leftSet.size + rightSet.size);
}

function bestGenreMatch(list, name) {
  const sourceTokens = genreTokens(name);
  let best = null;
  let bestScore = 0;
  (list || []).forEach((entry) => {
    const targetTokens = genreTokens(entry.name);
    const overlap = sourceTokens.filter((token) => targetTokens.includes(token)).length;
    const similarity = genreBigramSimilarity(name, entry.name);
    const score = overlap * 2 + similarity;
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  });
  return bestScore > 0 ? best : null;
}

function findGenreByName(list, name) {
  const key = normalizeGenreKey(name);
  return (list || []).find((entry) => normalizeGenreKey(entry.name) === key) || null;
}

function mapGenreId(targetType) {
  if (mode !== "genre") return null;
  const targetList = targetType === "tv" ? state.genreOptions.tv : state.genreOptions.movie;
  const sourceList = mediaType === "tv" ? state.genreOptions.tv : state.genreOptions.movie;
  let sourceName = selectedName;
  if (!sourceName) {
    const current = (sourceList || []).find((entry) => String(entry.id) === String(selectedValue));
    sourceName = current?.name || "";
  }
  if (!sourceName) return null;
  let mapped = findGenreByName(targetList, sourceName);
  if (!mapped) {
    const normalized = normalizeGenreKey(sourceName);
    const aliasMap = {
      "action and adventure": ["Action", "Adventure"],
      "war and politics": ["War", "Politics"],
      "sci fi and fantasy": ["Science Fiction", "Fantasy"],
      "science fiction": ["Sci-Fi & Fantasy"],
      "fantasy": ["Sci-Fi & Fantasy"],
      "action": ["Action & Adventure"],
      "adventure": ["Action & Adventure"],
      "war": ["War & Politics"],
      "politics": ["War & Politics"]
    };
    const aliases = aliasMap[normalized] || [];
    mapped = aliases.map((alias) => findGenreByName(targetList, alias)).find(Boolean) || null;
  }
  if (!mapped) {
    const normalized = normalizeGenreKey(sourceName);
    if (targetType === "movie" && normalized.includes("sci fi") && normalized.includes("fantasy")) {
      mapped = findGenreByName(targetList, "Science Fiction") || findGenreByName(targetList, "Fantasy");
    }
    if (targetType === "tv" && (normalized === "science fiction" || normalized === "fantasy")) {
      mapped = findGenreByName(targetList, "Sci-Fi & Fantasy");
    }
    if (!mapped) {
      mapped = bestGenreMatch(targetList, sourceName);
    }
  }
  return mapped;
}

function updateTypeToggleVisibility() {
  if (!el.browseTypeToggle) return;
  if (selectedValue || selectedName) {
    el.browseTypeToggle.removeAttribute("hidden");
    return;
  }
  el.browseTypeToggle.setAttribute("hidden", "");
}

function syncSelectedGenreName() {
  if (mode !== "genre") return;
  if (selectedName) return;
  if (!selectedValue) return;
  const list = mediaType === "tv" ? state.genreOptions.tv : state.genreOptions.movie;
  const match = (list || []).find((entry) => String(entry.id) === String(selectedValue));
  if (match?.name) {
    selectedName = match.name;
  }
}

async function loadBrowseData() {
  const source = getSourcePageWindow(page);
  const first = await fetchBrowseSourcePage(source.firstPage);
  const totalSourcePages = Math.max(1, Number(first.totalPages || 1));
  const responses = [first];

  if (source.firstPage + 1 <= totalSourcePages) {
    responses.push(await fetchBrowseSourcePage(source.firstPage + 1));
  }

  const movies = dedupeMediaItems(responses.flatMap((entry) => entry.movies || []))
    .slice(source.offset, source.offset + GRID_PAGE_SIZE);
  const tv = dedupeMediaItems(responses.flatMap((entry) => entry.tv || []))
    .slice(source.offset, source.offset + GRID_PAGE_SIZE);

  state.data = {
    movies,
    tv,
    page,
    totalPages: Math.max(1, Math.ceil((totalSourcePages * API_PAGE_SIZE) / GRID_PAGE_SIZE))
  };
  renderBrowseResults();
  renderBrowsePagination(state.data.totalPages || 1);
}

function getSourcePageWindow(pageNumber) {
  const start = (Math.max(1, Number(pageNumber || 1)) - 1) * GRID_PAGE_SIZE;
  return {
    firstPage: Math.floor(start / API_PAGE_SIZE) + 1,
    offset: start % API_PAGE_SIZE
  };
}

function fetchBrowseSourcePage(sourcePage) {
  return mode === "country"
    ? fetchTitlesByCountry(selectedValue, sourcePage)
    : fetchTitlesByGenre(Number(selectedValue), sourcePage);
}

function dedupeMediaItems(items) {
  const seen = new Set();
  return (items || []).filter((item) => {
    const key = `${item.mediaType === "tv" ? "tv" : "movie"}:${Number(item.id || 0)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

function renderPosterCards(container, items) {
  container.innerHTML = "";
  const fragment = document.createDocumentFragment();

  items.slice(0, GRID_PAGE_SIZE).forEach((item) => {
    const node = el.posterCardTemplate.content.firstElementChild.cloneNode(true);
    const link = node.querySelector(".poster-btn");
    const image = node.querySelector(".poster-img");
    const title = node.querySelector(".poster-title");
    const sub = node.querySelector(".poster-sub");

    setPosterImage(image, item);
    image.alt = `${item.title} poster`;
    title.textContent = item.title;
    sub.textContent = [item.mediaType === "movie" ? "Movie" : "TV", item.year].filter(Boolean).join(" | ");

    if (link) link.href = buildWatchHref(item.id, item.mediaType);

    fragment.appendChild(node);
  });

  container.appendChild(fragment);
  balancePosterGrid(container);
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
