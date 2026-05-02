import {
  initTmdb,
  fetchItemsByIds,
  titleById,
  posterById,
  isSensitiveCatalogItem
} from "./catalog.js?v=20260501-fix1";
import { ensureSession } from "./auth-client.js";
import { initSharedHeader } from "./shared-ui.js?v=20260502-notifications1";
import { initDragScroll } from "./drag-scroll.js?v=20260502-ui1";

const bookmarksBaseKey = "cinerune:bookmarks";
const progressBaseKey = "cinerune:progress";
const legacyProgressKey = "cinerune:progress";
const query = new URLSearchParams(window.location.search);

function getBookmarksKey(session) {
  const userId = session?.user?.id ? String(session.user.id) : "";
  return userId ? `${bookmarksBaseKey}:user:${userId}` : `${bookmarksBaseKey}:guest`;
}

const el = {
  bookmarksStatus: document.getElementById("bookmarksStatus"),
  listsTitle: document.getElementById("listsTitle"),
  continueListSection: document.getElementById("continueListSection"),
  listContinue: document.getElementById("listContinue"),
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
  initSharedHeader();
  initTmdb({
    apiBase: String(window.CINERUNE_CONFIG?.apiBase || "").trim(),
    fallbackApiBase: String(window.CINERUNE_CONFIG?.fallbackApiBase || "").trim(),
    language: String(window.CINERUNE_CONFIG?.tmdbLanguage || "en-US").trim()
  });


  await initAuth();

  if (query.get("view") === "continue") {
    await renderContinuePage();
    return;
  }

  const bookmarks = Object.values(readJson(getBookmarksKey(state.session), {}))
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));

  if (!bookmarks.length) {
    el.bookmarksStatus.textContent = "No saved titles yet.";
    renderEmpty(el.listWatching);
    renderEmpty(el.listWatched);
    renderEmpty(el.listPlan);
    renderEmpty(el.listDropped);
    return;
  }

  const hydrated = (await hydrateBookmarks(bookmarks)).filter((item) => !isSensitiveCatalogItem(item));

  renderList(el.listWatching, hydrated.filter((item) => item.status === "watching"));
  renderList(el.listWatched, hydrated.filter((item) => item.status === "watched"));
  renderList(el.listPlan, hydrated.filter((item) => item.status === "plan"));
  renderList(el.listDropped, hydrated.filter((item) => item.status === "dropped"));

  el.bookmarksStatus.textContent = `${hydrated.length} saved title${hydrated.length === 1 ? "" : "s"}.`;
}

async function renderContinuePage() {
  if (el.listsTitle) el.listsTitle.textContent = "Continue Watching";
  hideBookmarkSections();

  const progress = readJson(getProgressKey(state.session), readJson(legacyProgressKey, {}));
  const entries = dedupeContinueEntries(Object.values(progress || {})
    .filter((entry) => Number(entry.timestamp || 0) > 20 && Number(entry.progress || 0) < 98));

  if (!entries.length) {
    el.bookmarksStatus.textContent = "No continue watching titles yet.";
    renderEmpty(el.listContinue);
    return;
  }

  const hydrated = (await hydrateProgressEntries(entries)).filter((item) => !isSensitiveCatalogItem(item));
  el.continueListSection?.removeAttribute("hidden");
  renderList(el.listContinue, hydrated, { resume: true });
  el.bookmarksStatus.textContent = `${hydrated.length} title${hydrated.length === 1 ? "" : "s"} in progress.`;
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

async function hydrateProgressEntries(entries) {
  const fallback = entries.map((entry) => ({
    id: Number(entry.id),
    mediaType: entry.mediaType === "tv" ? "tv" : "movie",
    season: Number(entry.season || 1),
    episode: Number(entry.episode || 1),
    title: entry.title || titleById(entry.id, entry.mediaType) || `Title ${entry.id}`,
    poster: entry.poster || posterById(entry.id, entry.mediaType) || "",
    year: "",
    progressPercent: Math.max(0, Math.min(100, Number(entry.progress || 0))),
    progressMeta: entry.mediaType === "tv"
      ? `S${entry.season || 1} E${entry.episode || 1} | ${formatSeconds(entry.timestamp)}`
      : `${Math.round(Number(entry.progress || 0))}% | ${formatSeconds(entry.timestamp)}`
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

function renderList(container, entries, options = {}) {
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

    setPosterImage(image, item);
    image.alt = `${item.title} poster`;
    title.textContent = item.title;
    sub.textContent = item.progressMeta || [item.mediaType === "movie" ? "Movie" : "TV", item.year].filter(Boolean).join(" | ");
    if (item.progressMeta) {
      const progressTrack = document.createElement("span");
      progressTrack.className = "continue-progress";
      progressTrack.innerHTML = `<span style="width:${Math.max(0, Math.min(100, Number(item.progressPercent || 0)))}%"></span>`;
      button.appendChild(progressTrack);
    }

    button.addEventListener("click", () => {
      openWatchPage(item.id, item.mediaType, item.season, item.episode, options.resume);
    });

    fragment.appendChild(node);
  });

  container.appendChild(fragment);
  initDragScroll();
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

function openWatchPage(id, mediaType, season = 1, episode = 1, resume = false) {
  const url = new URL("./watch.html", window.location.href);
  url.searchParams.set("id", String(id));
  url.searchParams.set("type", mediaType === "tv" ? "tv" : "movie");
  if (mediaType === "tv") {
    url.searchParams.set("s", String(season || 1));
    url.searchParams.set("e", String(episode || 1));
  }
  if (resume) {
    url.searchParams.set("resume", "1");
  }
  window.location.href = url.toString();
}

function setPosterImage(image, item) {
  const fallback = buildPosterPlaceholder(item?.title);
  image.loading = "eager";
  image.decoding = "async";
  image.onerror = () => {
    image.onerror = null;
    image.src = fallback;
  };
  image.src = item?.poster || fallback;
}

function hideBookmarkSections() {
  [el.listWatching, el.listWatched, el.listPlan, el.listDropped].forEach((node) => {
    node?.closest(".lists-section")?.setAttribute("hidden", "");
  });
}

function dedupeContinueEntries(entries) {
  const map = new Map();
  entries.forEach((entry) => {
    const key = `${entry.mediaType === "tv" ? "tv" : "movie"}:${Number(entry.id || 0)}`;
    const previous = map.get(key);
    if (!previous || Number(entry.updatedAt || 0) > Number(previous.updatedAt || 0)) {
      map.set(key, entry);
    }
  });
  return [...map.values()].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
}

function getProgressKey(session) {
  const userId = session?.user?.id ? String(session.user.id) : "";
  return userId ? `${progressBaseKey}:user:${userId}` : `${progressBaseKey}:guest`;
}

function formatSeconds(value) {
  const total = Math.max(0, Math.floor(Number(value || 0)));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
