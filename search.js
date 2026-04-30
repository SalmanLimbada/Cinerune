import {
  initTmdb,
  searchCatalog
} from "./catalog.js?v=20260427c";

const query = new URLSearchParams(window.location.search);
const INPUT_LIMITS = {
  searchMax: 80
};

const el = {
  searchPageTitle: document.getElementById("searchPageTitle"),
  searchPageInput: document.getElementById("searchPageInput"),
  searchPageStatus: document.getElementById("searchPageStatus"),
  searchPageGrid: document.getElementById("searchPageGrid"),
  posterCardTemplate: document.getElementById("posterCardTemplate")
};

boot();

async function boot() {
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
    const result = await searchCatalog(term, { pages: 3 });
    const items = result.all || [...(result.movies || []), ...(result.tv || [])];
    renderPosterCards(items);
    el.searchPageStatus.textContent = items.length
      ? `${items.length} result${items.length === 1 ? "" : "s"} for "${term}".`
      : `No results found for "${term}".`;
  } catch {
    renderPosterCards([]);
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
