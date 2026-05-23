import { fetchAiringTodayPage, fetchPopularPage, fetchTrendingPage } from "./catalog.js?v=20260515-bugfix2";
import { initSharedHeader } from "./shared-ui.js?v=20260515-bugfix2";
import { balancePosterGrid, initDragScroll } from "./drag-scroll.js?v=20260515-bugfix2";
import { getProgressKey, initConfiguredTmdb, legacyProgressKey } from "./shared-state.js?v=20260515-bugfix2";
import { getStoredSession } from "./auth-client.js";
import { buildResumableWatchHref, readJson, setPosterImage } from "./shared-utils.js?v=20260515-bugfix2";

const GRID_PAGE_SIZE = 24;
const API_PAGE_SIZE = 20;

const fetchers = {
  trending: fetchTrendingPage,
  popular: fetchPopularPage,
  "airing-today": (_type, page) => fetchAiringTodayPage(page)
};

export async function initCollectionPage(config) {
  const query = new URLSearchParams(window.location.search);
  const hasToggle = config.mediaTypes?.length > 1;
  let mediaType = hasToggle && query.get("type") === "tv" ? "tv" : (config.defaultType || "movie");
  let page = Math.max(1, Number(query.get("page") || 1));
  const cache = { movie: new Map(), tv: new Map() };
  const totals = { movie: 1, tv: 1 };
  const activeProgress = await loadActiveProgress();

  const el = {
    title: document.getElementById("collectionTitle"),
    status: document.getElementById("collectionStatus"),
    grid: document.getElementById("collectionGrid"),
    pagination: document.getElementById("collectionPagination"),
    moviesLink: document.getElementById("collectionMoviesLink"),
    tvLink: document.getElementById("collectionTvLink"),
    posterCardTemplate: document.getElementById("posterCardTemplate")
  };

  initSharedHeader();
  initConfiguredTmdb();
  bindTypeToggle();
  bindPagination();
  await setMediaType(mediaType, { replace: true });

  function bindTypeToggle() {
    el.moviesLink?.addEventListener("click", () => setMediaType("movie"));
    el.tvLink?.addEventListener("click", () => setMediaType("tv"));
  }

  async function setMediaType(nextType, options = {}) {
    if (!config.mediaTypes.includes(nextType)) return;
    if (mediaType !== nextType) page = 1;
    mediaType = nextType;
    updateToggleState();
    updateUrl(options.replace);
    renderSkeletonCards(el.grid, GRID_PAGE_SIZE);
    await ensurePage(mediaType, page);
    renderFromCache(mediaType, page);
  }

  function updateToggleState() {
    el.moviesLink?.classList.toggle("active", mediaType === "movie");
    el.tvLink?.classList.toggle("active", mediaType === "tv");
    if (el.title) el.title.textContent = typeof config.title === "function" ? config.title(mediaType) : config.title;
  }

  function updateUrl(replace = false) {
    const url = new URL(window.location.href);
    if (hasToggle) url.searchParams.set("type", mediaType);
    url.searchParams.set("page", String(page));
    if (replace) {
      window.history.replaceState({}, "", url.toString());
    } else {
      window.history.pushState({}, "", url.toString());
    }
  }

  async function ensurePage(type, pageNumber) {
    if (cache[type].has(pageNumber)) return;
    const result = await fetchGridPage(type, pageNumber).catch(() => ({ items: [], totalPages: 1 }));
    cache[type].set(pageNumber, result.items || []);
    totals[type] = Math.max(1, Number(result.totalPages || 1));
  }

  async function fetchGridPage(type, pageNumber) {
    const source = getSourcePageWindow(pageNumber);
    const first = await fetchers[config.kind](type, source.firstPage);
    const totalSourcePages = Math.max(1, Number(first.totalPages || 1));
    const responses = [first];

    if (source.firstPage + 1 <= totalSourcePages) {
      responses.push(await fetchers[config.kind](type, source.firstPage + 1));
    }

    const items = dedupeMediaItems(responses.flatMap((entry) => entry.items || []))
      .slice(source.offset, source.offset + GRID_PAGE_SIZE);

    return {
      items,
      totalPages: Math.max(1, Math.ceil((totalSourcePages * API_PAGE_SIZE) / GRID_PAGE_SIZE))
    };
  }

  function renderFromCache(type, pageNumber) {
    const items = cache[type].get(pageNumber) || [];
    renderPosterCards(items);
    renderPagination(totals[type]);
    if (!items.length) {
      el.status.textContent = `Could not load ${config.statusNoun(type)} right now.`;
      return;
    }
    el.status.textContent = "";
  }

  function bindPagination() {
    el.pagination?.addEventListener("click", (event) => {
      const link = event.target.closest("a[data-page]");
      if (!link) return;
      event.preventDefault();
      const nextPage = Number(link.dataset.page) || 1;
      if (nextPage === page) return;
      page = nextPage;
      updateUrl(true);
      renderSkeletonCards(el.grid, GRID_PAGE_SIZE);
      void ensurePage(mediaType, page).then(() => renderFromCache(mediaType, page));
    });
  }

  function renderPagination(totalPages) {
    const total = Math.max(1, Number(totalPages || 1));
    if (total <= 1) {
      el.pagination.setAttribute("hidden", "");
      el.pagination.innerHTML = "";
      return;
    }
    const pages = buildPagerPages(page, total);
    el.pagination.innerHTML = pages.map((entry) => {
      if (entry.type === "gap") return `<span class="pager-btn ghost">...</span>`;
      const active = entry.page === page ? " active" : "";
      return `<a class="pager-btn${active}" data-page="${entry.page}" href="${buildHref(entry.page)}">${entry.label}</a>`;
    }).join("");
    el.pagination.insertAdjacentHTML("beforeend", `
      <span class="pager-jump">
        <input class="pager-input" type="number" min="1" max="${total}" placeholder="#" aria-label="Go to page" />
        <button class="pager-go" type="button">Go</button>
      </span>
    `);
    const input = el.pagination.querySelector(".pager-input");
    const jump = () => {
      const nextPage = Math.max(1, Math.min(total, Number(input?.value || 0)));
      if (!nextPage) return;
      page = nextPage;
      updateUrl(true);
      renderSkeletonCards(el.grid, GRID_PAGE_SIZE);
      void ensurePage(mediaType, page).then(() => renderFromCache(mediaType, page));
    };
    input?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        jump();
      }
    });
    el.pagination.querySelector(".pager-go")?.addEventListener("click", jump);
    el.pagination.removeAttribute("hidden");
  }

  function buildHref(nextPage) {
    const url = new URL(`./${config.slug}.html`, window.location.href);
    if (hasToggle) url.searchParams.set("type", mediaType);
    url.searchParams.set("page", String(nextPage));
    return url.toString();
  }

  function renderPosterCards(items) {
    el.grid.innerHTML = "";
    const fragment = document.createDocumentFragment();
    items.forEach((item, index) => {
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
}

function getSourcePageWindow(pageNumber) {
  const start = (Math.max(1, Number(pageNumber || 1)) - 1) * GRID_PAGE_SIZE;
  return {
    firstPage: Math.floor(start / API_PAGE_SIZE) + 1,
    offset: start % API_PAGE_SIZE
  };
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

async function loadActiveProgress() {
  const session = getStoredSession();
  const progress = readJson(getProgressKey(session), null);
  if (progress && typeof progress === "object") return progress;
  return readJson(getProgressKey(null), readJson(legacyProgressKey, {})) || {};
}
