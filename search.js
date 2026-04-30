import {
  initTmdb,
  searchCatalog
} from "./catalog.js?v=20260430-search";
import { initSharedHeader } from "./shared-ui.js";

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
  initTmdb({
    apiBase: String(window.CINERUNE_CONFIG?.apiBase || "").trim(),
    language: String(window.CINERUNE_CONFIG?.tmdbLanguage || "en-US").trim()
  });

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
    const result = await searchCatalog(term, { page });
    const items = result.all || [...(result.movies || []), ...(result.tv || [])];
    renderPosterCards(items);
    renderPagination(term, page, result.totalPages || 1);
    el.searchPageStatus.textContent = items.length
      ? `Page ${page} of ${Math.max(1, Number(result.totalPages || 1))} for "${term}".`
      : `No results found for "${term}".`;
  } catch {
    renderPosterCards([]);
    renderPagination(term, 1, 1);
    el.searchPageStatus.textContent = `Could not load results for "${term}" right now.`;
  }
}

function sanitizeText(value, maxLen) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return trimmed.slice(0, maxLen);
}

function renderPosterCards(items) {
  el.searchPageGrid.innerHTML = "";
  const fragment = document.createDocumentFragment();

  items.forEach((item) => {
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

  el.searchPageGrid.appendChild(fragment);
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
