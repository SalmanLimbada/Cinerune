import { fetchHomeCatalog, fetchRecommendedFromHistory } from "./catalog.js?v=20260515-bugfix2";
import { initSharedHeader } from "./shared-ui.js?v=20260515-bugfix2";
import { balancePosterGrid, initDragScroll } from "./drag-scroll.js?v=20260515-bugfix2";
import { getBookmarksKey, getProgressKey, initConfiguredTmdb, legacyProgressKey } from "./shared-state.js?v=20260515-bugfix2";
import { getStoredSession } from "./auth-client.js";
import { buildResumableWatchHref, readJson, setPosterImage } from "./shared-utils.js?v=20260515-bugfix2";

const PAGE_SIZE = 24;

const query = new URLSearchParams(window.location.search);
let page = Math.max(1, Number(query.get("page") || 1));
let items = [];
let activeProgress = {};

const el = {
  status: document.getElementById("collectionStatus"),
  grid: document.getElementById("collectionGrid"),
  pagination: document.getElementById("collectionPagination"),
  posterCardTemplate: document.getElementById("posterCardTemplate")
};

boot();

async function boot() {
  initSharedHeader();
  initConfiguredTmdb();
  document.getElementById("pageBackBtn")?.addEventListener("click", () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = "./index.html";
    }
  });
  activeProgress = loadActiveProgress();
  renderSkeletonCards(el.grid, PAGE_SIZE);

  try {
    items = await loadRecommendedItems();
    renderPage();
  } catch {
    items = [];
    renderPage();
    if (el.status) el.status.textContent = "Could not load recommended titles right now.";
  }
}

async function loadRecommendedItems() {
  const homeData = await fetchHomeCatalog().catch(() => ({ recommended: [] }));
  const fallback = homeData.recommended || [];
  const history = collectRecommendationHistory();
  const excluded = new Set(history.map((entry) => `${entry.mediaType === "tv" ? "tv" : "movie"}:${Number(entry.id || 0)}`));

  if (!history.length) return fallback.slice(0, 240);

  const personalized = await fetchRecommendedFromHistory(history.slice(0, 10), 240, { seedLimit: 10 }).catch(() => []);
  const merged = dedupeMediaItems([
    ...personalized,
    ...fallback
  ]).filter((item) => !excluded.has(`${item.mediaType}:${Number(item.id || 0)}`));
  return merged.slice(0, 240);
}

function collectRecommendationHistory() {
  const session = getStoredSession();
  const progress = activeProgress || {};
  const bookmarks = readJson(getBookmarksKey(session), readJson(getBookmarksKey(null), {})) || {};
  const progressEntries = Object.values(progress)
    .filter((entry) => Number(entry.progress || 0) > 10 || Number(entry.timestamp || 0) > 300)
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  const bookmarkEntries = Object.values(bookmarks)
    .filter((entry) => entry?.status === "watching" || entry?.status === "watched")
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  return dedupeMediaItems([...progressEntries, ...bookmarkEntries]);
}

function renderPage() {
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  page = Math.max(1, Math.min(totalPages, page));
  const visible = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  renderPosterCards(visible);
  renderPagination(totalPages);
  if (el.status) el.status.textContent = visible.length ? "" : "No recommendations yet.";
}

function renderPosterCards(visibleItems) {
  el.grid.innerHTML = "";
  const fragment = document.createDocumentFragment();
  visibleItems.forEach((item, index) => {
    const node = el.posterCardTemplate.content.firstElementChild.cloneNode(true);
    const link = node.querySelector(".poster-btn");
    const image = node.querySelector(".poster-img");
    const title = node.querySelector(".poster-title");
    const sub = node.querySelector(".poster-sub");
    setPosterImage(image, item, { eager: index < 8 });
    image.alt = `${item.title} poster`;
    title.textContent = item.title;
    sub.textContent = [item.mediaType === "movie" ? "Movie" : "TV", item.year].filter(Boolean).join(" | ");
    if (link) link.href = buildResumableWatchHref(item, activeProgress);
    fragment.appendChild(node);
  });
  el.grid.appendChild(fragment);
  balancePosterGrid(el.grid);
  initDragScroll();
}

function renderPagination(totalPages) {
  if (!el.pagination) return;
  if (totalPages <= 1) {
    el.pagination.setAttribute("hidden", "");
    el.pagination.innerHTML = "";
    return;
  }
  el.pagination.innerHTML = buildPagerPages(page, totalPages).map((entry) => {
    if (entry.type === "gap") return '<span class="pager-btn ghost">...</span>';
    return `<a class="pager-btn${entry.page === page ? " active" : ""}" data-page="${entry.page}" href="${buildHref(entry.page)}">${entry.label}</a>`;
  }).join("");
  el.pagination.querySelectorAll("[data-page]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      page = Number(link.dataset.page || 1);
      window.history.pushState({}, "", buildHref(page));
      renderPage();
    });
  });
  el.pagination.removeAttribute("hidden");
}

function buildHref(nextPage) {
  const url = new URL("./recommended.html", window.location.href);
  url.searchParams.set("page", String(nextPage));
  return url.toString();
}

function buildPagerPages(current, total) {
  const pages = [{ type: "page", page: 1, label: "1" }];
  const start = Math.max(1, current - 2);
  const end = Math.min(total, current + 2);
  if (start > 2) pages.push({ type: "gap" });
  for (let p = start; p <= end; p += 1) {
    if (p !== 1 && p !== total) pages.push({ type: "page", page: p, label: String(p) });
  }
  if (end < total - 1) pages.push({ type: "gap" });
  if (total > 1) pages.push({ type: "page", page: total, label: String(total) });
  return pages;
}

function dedupeMediaItems(sourceItems) {
  const seen = new Set();
  return (sourceItems || []).filter((item) => {
    const key = `${item?.mediaType === "tv" ? "tv" : "movie"}:${Number(item?.id || 0)}`;
    if (seen.has(key) || key.endsWith(":0")) return false;
    seen.add(key);
    return true;
  });
}

function loadActiveProgress() {
  const session = getStoredSession();
  return readJson(getProgressKey(session), readJson(getProgressKey(null), readJson(legacyProgressKey, {}))) || {};
}

function renderSkeletonCards(container, count = 24) {
  if (!container) return;
  container.innerHTML = Array.from({ length: count }, () => `
    <article class="poster-card skeleton-card" aria-hidden="true">
      <span class="skeleton skeleton-poster"></span>
      <span class="skeleton skeleton-line"></span>
      <span class="skeleton skeleton-line short"></span>
    </article>
  `).join("");
}
