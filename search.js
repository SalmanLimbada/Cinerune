import {
  searchCatalog
} from "./catalog.js?v=20260508-toggle1";
import { initSharedHeader } from "./shared-ui.js?v=20260508-toggle1";
import { balancePosterGrid, initDragScroll } from "./drag-scroll.js?v=20260508-toggle1";
import { initConfiguredTmdb } from "./shared-state.js?v=20260508-toggle1";
import { buildWatchHref, sanitizeText, setPosterImage } from "./shared-utils.js?v=20260508-toggle1";

const query = new URLSearchParams(window.location.search);
const INPUT_LIMITS = {
  searchMax: 80
};
const page = Math.max(1, Number(query.get("page") || 1));

const el = {
  searchPageTitle: document.getElementById("searchPageTitle"),
  searchPageInput: document.getElementById("searchPageInput"),
  searchPageStatus: document.getElementById("searchPageStatus"),
  searchPageGrid: document.getElementById("searchPageGrid"),
  searchPagePagination: document.getElementById("searchPagePagination"),
  posterCardTemplate: document.getElementById("posterCardTemplate")
};

boot();

async function boot() {
  initSharedHeader();
  initConfiguredTmdb();

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
    const url = new URL("./search.html", window.location.href);
    url.searchParams.set("q", nextTerm);
    url.searchParams.delete("page");
    window.location.href = url.toString();
  });

  if (!term) {
    el.searchPageTitle.textContent = "Search";
    el.searchPageStatus.textContent = "Search for a movie or show.";
    renderPosterCards([]);
    return;
  }

  el.searchPageTitle.textContent = `Search: ${term}`;
  el.searchPageStatus.textContent = "Loading results...";

  try {
    let result = await searchCatalog(term, { page });
    let items = result.all || [...(result.movies || []), ...(result.tv || [])];
    let activeTerm = term;
    const correctedTerm = getCorrectedTerm(term, items);

    if (correctedTerm && normalizeSearchQuery(correctedTerm) !== normalizeSearchQuery(term)) {
      activeTerm = correctedTerm;
      result = await searchCatalog(correctedTerm, { page });
      items = result.all || [...(result.movies || []), ...(result.tv || [])];
    }

    const ranked = rankFuzzyResults(activeTerm, items);
    renderPosterCards(ranked);
    renderPagination(activeTerm, page, result.totalPages || 1);
    el.searchPageTitle.textContent = `Search: ${activeTerm}`;
    el.searchPageStatus.textContent = ranked.length
      ? `Page ${page} of ${Math.max(1, Number(result.totalPages || 1))} for "${activeTerm}".`
      : `No results found for "${activeTerm}".`;
  } catch {
    renderPosterCards([]);
    renderPagination(term, 1, 1);
    el.searchPageStatus.textContent = `Could not load results for "${term}" right now.`;
  }
}

function renderPosterCards(items) {
  el.searchPageGrid.innerHTML = "";
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

    if (link) link.href = buildWatchHref(item.id, item.mediaType);

    fragment.appendChild(node);
  });

  el.searchPageGrid.appendChild(fragment);
  initDragScroll();
}

function rankFuzzyResults(query, items) {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) return items || [];

  const scored = (items || []).map((item, index) => {
    const normalizedTitle = normalizeSearchQuery(item.title);
    const score = fuzzyScore(normalizedQuery, normalizedTitle);
    return { item, index, score };
  });

  const hasSignal = scored.some((entry) => entry.score > 0);
  if (!hasSignal) return items || [];

  return scored
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .map((entry) => entry.item);
}

function getCorrectedTerm(query, items) {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) return "";

  let best = null;
  let bestScore = 0;

  (items || []).forEach((item) => {
    const title = String(item.title || "").trim();
    if (!title) return;
    const normalizedTitle = normalizeSearchQuery(title);
    if (!normalizedTitle) return;
    const score = fuzzyScore(normalizedQuery, normalizedTitle);
    if (score > bestScore) {
      bestScore = score;
      best = title;
    }
  });

  if (!best || bestScore < 2000) return "";

  const distance = levenshteinDistance(normalizeSearchQuery(query), normalizeSearchQuery(best));
  if (distance > 2) return "";
  if (best.length > query.length + 2) return "";
  return best;
}

function fuzzyScore(query, title) {
  if (!query || !title) return 0;
  if (title === query) return 10000;
  if (title.startsWith(query)) return 8000;
  if (title.includes(query)) return 5000;
  const distance = levenshteinDistance(query, title);
  if (distance <= 2) return 2000 - (distance * 500);
  return 0;
}

function normalizeSearchQuery(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(a, b) {
  const s = String(a || "");
  const t = String(b || "");
  if (s === t) return 0;
  if (!s) return t.length;
  if (!t) return s.length;

  const rows = s.length + 1;
  const cols = t.length + 1;
  const dp = Array.from({ length: rows }, () => new Array(cols).fill(0));

  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < cols; j += 1) dp[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[rows - 1][cols - 1];
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
