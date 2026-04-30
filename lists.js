import {
  initTmdb,
  fetchItemsByIds,
  titleById,
  posterById
} from "./catalog.js?v=20260427c";
import { ensureSession } from "./auth-client.js";

const bookmarksBaseKey = "cinerune:bookmarks";

function getBookmarksKey(session) {
  const userId = session?.user?.id ? String(session.user.id) : "";
  return userId ? `${bookmarksBaseKey}:user:${userId}` : `${bookmarksBaseKey}:guest`;
}

const el = {
  listsStatus: document.getElementById("listsStatus"),
  listWatching: document.getElementById("listWatching"),
  listWatched: document.getElementById("listWatched"),
  listPlan: document.getElementById("listPlan"),
  listDropped: document.getElementById("listDropped"),
  posterCardTemplate: document.getElementById("posterCardTemplate")
};

const state = {
  session: null
};

boot();

async function boot() {
  initTmdb({
    apiBase: String(window.CINERUNE_CONFIG?.apiBase || "").trim(),
    language: String(window.CINERUNE_CONFIG?.tmdbLanguage || "en-US").trim()
  });


  await initAuth();

  const bookmarks = Object.values(readJson(getBookmarksKey(state.session), {}))
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

async function initAuth() {
  try {
    state.session = await ensureSession();
  } catch {
    state.session = null;
  }
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
    const node = el.posterCardTemplate.content.firstElementChild.cloneNode(true);
    const button = node.querySelector(".poster-btn");
    const image = node.querySelector(".poster-img");
    const title = node.querySelector(".poster-title");
    const sub = node.querySelector(".poster-sub");

    image.src = item.poster || buildPosterPlaceholder(item.title);
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

function buildPosterPlaceholder(title) {
  const safeTitle = String(title || "Title").slice(0, 24);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#1a3552" />
          <stop offset="100%" stop-color="#0f1f33" />
        </linearGradient>
      </defs>
      <rect width="300" height="450" fill="url(#g)" />
      <rect x="20" y="20" width="260" height="410" rx="18" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" />
      <text x="150" y="220" fill="#d8e8f8" font-family="Outfit, sans-serif" font-size="20" font-weight="600" text-anchor="middle">
        ${safeTitle}
      </text>
      <text x="150" y="250" fill="#9fb6d0" font-family="Outfit, sans-serif" font-size="12" text-anchor="middle">
        No poster available
      </text>
    </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
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
