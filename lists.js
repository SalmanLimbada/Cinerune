import {
  initTmdb,
  fetchItemsByIds,
  titleById,
  posterById
} from "./catalog.js?v=20260423b";

const bookmarksKey = "cinerune:bookmarks";

const el = {
  listsStatus: document.getElementById("listsStatus"),
  listWatching: document.getElementById("listWatching"),
  listWatched: document.getElementById("listWatched"),
  listPlan: document.getElementById("listPlan"),
  listDropped: document.getElementById("listDropped"),
  posterCardTemplate: document.getElementById("posterCardTemplate")
};

boot();

async function boot() {
  initTmdb({
    apiKey: String(window.CINERUNE_CONFIG?.tmdbApiKey || "").trim(),
    readAccessToken: String(window.CINERUNE_CONFIG?.tmdbReadAccessToken || "").trim(),
    language: String(window.CINERUNE_CONFIG?.tmdbLanguage || "en-US").trim()
  });

  const bookmarks = Object.values(readJson(bookmarksKey, {}))
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));

  if (!bookmarks.length) {
    el.listsStatus.textContent = "No saved titles yet.";
    renderEmpty(el.listWatching);
    renderEmpty(el.listWatched);
    renderEmpty(el.listPlan);
    renderEmpty(el.listDropped);
    return;
  }

  const hydrated = await hydrateBookmarks(bookmarks);

  renderList(el.listWatching, hydrated.filter((item) => item.status === "watching"));
  renderList(el.listWatched, hydrated.filter((item) => item.status === "watched"));
  renderList(el.listPlan, hydrated.filter((item) => item.status === "plan"));
  renderList(el.listDropped, hydrated.filter((item) => item.status === "dropped"));

  el.listsStatus.textContent = `${hydrated.length} saved title${hydrated.length === 1 ? "" : "s"}.`;
}

async function hydrateBookmarks(bookmarks) {
  const fallback = bookmarks.map((entry) => ({
    id: Number(entry.id),
    mediaType: entry.mediaType === "tv" ? "tv" : "movie",
    status: entry.status,
    title: entry.title || titleById(entry.id, entry.mediaType) || `Title ${entry.id}`,
    poster: entry.poster || posterById(entry.id, entry.mediaType) || "",
    year: ""
  }));

  try {
    const apiItems = await fetchItemsByIds(fallback);
    const byKey = new Map(apiItems.map((item) => [`${item.mediaType}:${item.id}`, item]));

    return fallback.map((entry) => {
      const apiItem = byKey.get(`${entry.mediaType}:${entry.id}`);
      return {
        ...entry,
        title: apiItem?.title || entry.title,
        poster: apiItem?.poster || entry.poster,
        year: apiItem?.year || ""
      };
    });
  } catch {
    return fallback;
  }
}

function renderList(container, entries) {
  if (!entries.length) {
    renderEmpty(container);
    return;
  }

  container.innerHTML = "";
  const fragment = document.createDocumentFragment();

  entries.forEach((item) => {
    if (!item.poster) return;

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
      openWatchPage(item.id, item.mediaType);
    });

    fragment.appendChild(node);
  });

  container.appendChild(fragment);
}

function renderEmpty(container) {
  container.innerHTML = '<p class="tiny muted">Empty</p>';
}

function openWatchPage(id, mediaType) {
  const url = new URL("./watch.html", window.location.href);
  url.searchParams.set("id", String(id));
  url.searchParams.set("type", mediaType === "tv" ? "tv" : "movie");
  if (mediaType === "tv") {
    url.searchParams.set("s", "1");
    url.searchParams.set("e", "1");
  }
  window.location.href = url.toString();
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
