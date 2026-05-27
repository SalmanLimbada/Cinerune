import {
  searchCatalog
} from "./catalog.js?v=20260515-bugfix2";
import { initSharedHeader, saveSharedRecentSearch } from "./shared-ui.js?v=20260515-bugfix2";
import { balancePosterGrid, initDragScroll } from "./drag-scroll.js?v=20260515-bugfix2";
import { getProgressKey, initConfiguredTmdb, legacyProgressKey } from "./shared-state.js?v=20260515-bugfix2";
import { getStoredSession } from "./auth-client.js";
import { buildResumableWatchHref, sanitizeText, setPosterImage, readJson } from "./shared-utils.js?v=20260515-bugfix2";

const query = new URLSearchParams(window.location.search);
const INPUT_LIMITS = {
  searchMax: 80
};
const page = Math.max(1, Number(query.get("page") || 1));
let activeProgress = {};

const el = {
  searchPageTitle: document.getElementById("searchPageTitle"),
  searchPageInput: document.getElementById("searchPageInput"),
  searchPageStatus: document.getElementById("searchPageStatus"),
  searchResultsHead: document.getElementById("searchResultsHead"),
  searchPageGrid: document.getElementById("searchPageGrid"),
  searchPagePagination: document.getElementById("searchPagePagination"),
  posterCardTemplate: document.getElementById("posterCardTemplate")
};

boot();

async function boot() {
  initSharedHeader();
  initConfiguredTmdb();
  activeProgress = await loadActiveProgress();

  const term = sanitizeText(query.get("q"), INPUT_LIMITS.searchMax);
  el.searchPageInput.value = term;

  el.searchPageInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const nextTerm = sanitizeText(el.searchPageInput.value, INPUT_LIMITS.searchMax);
    if (el.searchPageInput.value !== nextTerm) {
      el.searchPageInput.value = nextTerm;
    }
    if (!nextTerm) return;
    saveSharedRecentSearch(nextTerm);
    const url = new URL("./search.html", window.location.href);
    url.searchParams.set("q", nextTerm);
    url.searchParams.delete("page");
    window.location.href = url.toString();
  });

  if (!term) {
    el.searchPageTitle.textContent = "Search";
    el.searchResultsHead?.setAttribute("hidden", "");
    el.searchPageGrid.innerHTML = "";
    renderPagination("", 1, 1);
    return;
  }

  saveSharedRecentSearch(term);
  el.searchPageTitle.textContent = `Search: ${term}`;
  el.searchPageStatus.textContent = "Loading results...";
  el.searchResultsHead?.removeAttribute("hidden");
  renderSkeletonCards(el.searchPageGrid, 21);

  try {
    const { items, totalPages, page: displayPage, correctedQuery } = await loadSearchGridResults(term, page);
    const ranked = rankFuzzyResults(correctedQuery || term, items);
    renderPosterCards(ranked);
    renderPagination(term, displayPage, totalPages || 1);
    el.searchPageTitle.textContent = `Search: ${term}`;
    el.searchPageStatus.textContent = ranked.length
      ? `Results for "${term}".`
      : `No results found for "${term}".`;
  } catch {
    renderPosterCards([]);
    renderPagination(term, 1, 1);
    el.searchPageStatus.textContent = `Could not load results for "${term}" right now.`;
  }
}

function renderPosterCards(items) {
  el.searchPageGrid.innerHTML = "";
  if (!items.length) {
    renderEmptyState();
    return;
  }
  const fragment = document.createDocumentFragment();

  items.forEach((item) => {
    const node = el.posterCardTemplate.content.firstElementChild.cloneNode(true);
    const link = node.querySelector(".poster-btn");
    const image = node.querySelector(".poster-img");
    const title = node.querySelector(".poster-title");
    const sub = node.querySelector(".poster-sub");

    setPosterImage(image, item);
    image.loading = "lazy";
    image.decoding = "async";
    image.alt = `${item.title} poster`;
    title.textContent = item.title;
    sub.textContent = [item.mediaType === "movie" ? "Movie" : "TV", item.year].filter(Boolean).join(" | ");

    if (link) link.href = buildResumableWatchHref(item, activeProgress);

    fragment.appendChild(node);
  });

  el.searchPageGrid.appendChild(fragment);
  balancePosterGrid(el.searchPageGrid, { targetRows: 3 });
  initDragScroll();
}

async function loadSearchGridResults(term, pageNumber) {
  const result = await searchCatalog(term, { page: 1, pages: 20 });
  const allItems = result.all || [...(result.movies || []), ...(result.tv || [])];
  const rankedPool = rankFuzzyResults(result.correctedQuery || term, allItems);
  const totalResults = rankedPool.length;
  const totalPages = getSearchDisplayPageCount(totalResults);
  const currentPage = Math.max(1, Math.min(totalPages, Number(pageNumber || 1)));
  const offset = (currentPage - 1) * 21;
  const limit = getSearchDisplayPageSize(currentPage, totalResults);

  return {
    items: rankedPool.slice(offset, offset + limit),
    totalPages,
    page: currentPage,
    correctedQuery: result.correctedQuery || ""
  };
}

function getSearchDisplayPageCount(totalResults) {
  const total = Math.max(0, Number(totalResults || 0) || 0);
  if (total <= 21) return 1;
  const fullPages = Math.floor(total / 21);
  const remainder = total % 21;
  if (!remainder) return fullPages;
  return remainder < 7 ? Math.max(1, fullPages) : fullPages + 1;
}

function getSearchDisplayPageSize(pageNumber, totalResults) {
  const total = Math.max(0, Number(totalResults || 0) || 0);
  const totalPages = getSearchDisplayPageCount(total);
  const currentPage = Math.max(1, Math.min(totalPages, Number(pageNumber || 1)));
  if (currentPage < totalPages) return 21;
  return Math.max(0, total - ((currentPage - 1) * 21));
}

function rankFuzzyResults(query, items) {
  const FuseCtor = window.Fuse;
  if (!FuseCtor || !String(query || "").trim() || !Array.isArray(items) || items.length < 2) return items || [];
  const fuse = new FuseCtor(items, {
    keys: ["title", "name"],
    threshold: 0.4,
    ignoreLocation: true,
    minMatchCharLength: 2
  });
  const ranked = fuse.search(query).map((entry) => entry.item);
  if (!ranked.length) return items || [];
  const rankedKeys = new Set(ranked.map((item) => `${item.mediaType}:${item.id}`));
  return [...ranked, ...items.filter((item) => !rankedKeys.has(`${item.mediaType}:${item.id}`))];
}

async function loadActiveProgress() {
  const session = getStoredSession();
  const progress = readJson(getProgressKey(session), null);
  if (progress && typeof progress === "object") return progress;
  return readJson(getProgressKey(null), readJson(legacyProgressKey, {})) || {};
}

function renderEmptyState() {
  el.searchPageGrid.innerHTML = `
    <div class="empty-state search-empty-state">
      <div class="empty-state-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/><path d="M8.5 10h5"/><path d="M10 13h2"/></svg>
      </div>
      <h3>No results found</h3>
      <p class="tiny muted">Try a different movie or show title.</p>
    </div>
  `;
}

function renderSkeletonCards(container, count = 21) {
  if (!container) return;
  container.innerHTML = Array.from({ length: count }, () => `
    <article class="poster-card skeleton-card" aria-hidden="true">
      <span class="skeleton skeleton-poster"></span>
      <span class="skeleton skeleton-line"></span>
      <span class="skeleton skeleton-line short"></span>
    </article>
  `).join("");
}

function renderPagination(term, current, totalPages) {
  if (!el.searchPagePagination) return;
  const total = Math.max(1, Math.min(500, Number(totalPages || 1)));
  const active = Math.max(1, Math.min(total, Number(current || 1)));
  if (total <= 1) {
    el.searchPagePagination.innerHTML = "";
    el.searchPagePagination.setAttribute("hidden", "");
    return;
  }

  const pages = buildPagerPages(active, total);
  el.searchPagePagination.innerHTML = pages.map((entry) => {
    if (entry.type === "gap") return `<span class="pager-btn ghost">...</span>`;
    const activeClass = entry.page === active ? " active" : "";
    return `<a class="pager-btn${activeClass}" href="${buildSearchHref(term, entry.page)}">${entry.label}</a>`;
  }).join("");
  el.searchPagePagination.insertAdjacentHTML("beforeend", `
    <span class="pager-jump">
      <input class="pager-input" type="number" min="1" max="${total}" placeholder="#" aria-label="Go to page" />
      <button class="pager-go" type="button" data-total="${total}">Go</button>
    </span>
  `);
  const input = el.searchPagePagination.querySelector(".pager-input");
  const goBtn = el.searchPagePagination.querySelector(".pager-go");
  const jump = () => {
    if (!input) return;
    const nextPage = Math.max(1, Math.min(total, Number(input.value || 0)));
    if (!nextPage) return;
    window.location.href = buildSearchHref(term, nextPage);
  };
  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      jump();
    }
  });
  goBtn?.addEventListener("click", jump);
  el.searchPagePagination.removeAttribute("hidden");
}

function buildSearchHref(term, nextPage) {
  const url = new URL("./search.html", window.location.href);
  url.searchParams.set("q", term);
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

  for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
    if (pageNumber === 1 || pageNumber === total) continue;
    pages.push({ type: "page", page: pageNumber, label: String(pageNumber) });
  }

  if (end < total - 1) pages.push({ type: "gap" });
  if (total > 1) pages.push({ type: "page", page: total, label: String(total) });

  return pages;
}
