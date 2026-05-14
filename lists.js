import {
  fetchItemsByIds,
  titleById,
  posterById,
  isSensitiveCatalogItem
} from "./catalog.js?v=20260513-fixes1";
import { ensureSession } from "./auth-client.js";
import { deleteBookmarkFromCloud, pushBookmarksToCloud, syncBookmarksWithCloud } from "./bookmark-sync.js";
import { initSharedHeader } from "./shared-ui.js?v=20260513-fixes1";
import { balancePosterGrid } from "./drag-scroll.js?v=20260513-fixes1";
import { getBookmarksKey, getProgressKey, initConfiguredTmdb, legacyProgressKey } from "./shared-state.js?v=20260513-fixes1";
import { buildWatchHref, escapeHtml, formatSeconds, getLatestProgressEntry, normalizePlaybackTimestamp, readJson, setPosterImage } from "./shared-utils.js?v=20260513-fixes1";

const query = new URLSearchParams(window.location.search);

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
  initConfiguredTmdb();


  await initAuth();
  if (!state.session?.user) {
    window.location.replace("./index.html");
    return;
  }

  if (query.get("view") === "continue") {
    await renderContinuePage();
    return;
  }

  await renderBookmarksPage();
}

async function renderBookmarksPage() {
  const progress = readJson(getProgressKey(state.session), readJson(legacyProgressKey, {})) || {};
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

  const hydrated = (await hydrateBookmarks(bookmarks, progress)).filter((item) => !isSensitiveCatalogItem(item));

  renderList(el.listWatching, hydrated.filter((item) => item.status === "watching"), { allowRemove: true });
  renderList(el.listWatched, hydrated.filter((item) => item.status === "watched"), { allowRemove: true });
  renderList(el.listPlan, hydrated.filter((item) => item.status === "plan"), { allowRemove: true });
  renderList(el.listDropped, hydrated.filter((item) => item.status === "dropped"), { allowRemove: true });

  el.bookmarksStatus.textContent = `${hydrated.length} saved title${hydrated.length === 1 ? "" : "s"}.`;
}

async function renderContinuePage() {
  if (el.listsTitle) el.listsTitle.textContent = "Continue Watching";
  hideBookmarkSections();

  const progress = readJson(getProgressKey(state.session), readJson(legacyProgressKey, {}));
  const entries = dedupeContinueEntries(Object.values(progress || {})
    .filter((entry) => normalizePlaybackTimestamp(entry.timestamp, entry.duration) > 8 && Number(entry.progress || 0) < 98));

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
    if (state.session?.user) {
      const key = getBookmarksKey(state.session);
      const bookmarks = readJson(key, {});
      const synced = await syncBookmarksWithCloud(state.session, bookmarks);
      localStorage.setItem(key, JSON.stringify(synced));
    }
  } catch {
    state.session = null;
  }
}

async function hydrateBookmarks(bookmarks, progress = {}) {
  const fallback = bookmarks.map((entry) => ({
    id: Number(entry.id),
    mediaType: entry.mediaType === "tv" ? "tv" : "movie",
    status: entry.status,
    title: entry.title || titleById(entry.id, entry.mediaType) || `Title ${entry.id}`,
    poster: entry.poster || posterById(entry.id, entry.mediaType) || "",
    year: "",
    progressEntry: getLatestProgressEntry(progress, entry.id, entry.mediaType)
  }));
  fallback.forEach((entry) => {
    entry.season = entry.progressEntry?.season || 1;
    entry.episode = entry.progressEntry?.episode || 1;
    entry.resumeAvailable = Boolean(entry.progressEntry);
  });

  try {
    const apiItems = await fetchItemsByIds(fallback);
    const byKey = new Map(apiItems.map((item) => [`${item.mediaType}:${item.id}`, item]));

    return fallback.map((entry) => {
      const apiItem = byKey.get(`${entry.mediaType}:${entry.id}`);
      return {
        ...entry,
        title: apiItem?.title || entry.title,
        poster: apiItem?.poster || entry.poster,
        year: apiItem?.year || "",
        season: entry.progressEntry?.season || entry.season || 1,
        episode: entry.progressEntry?.episode || entry.episode || 1,
        resumeAvailable: Boolean(entry.progressEntry)
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
    resumeSeconds: normalizePlaybackTimestamp(entry.timestamp, entry.duration),
    progressMeta: entry.mediaType === "tv"
      ? `S${entry.season || 1} E${entry.episode || 1} | ${formatSeconds(normalizePlaybackTimestamp(entry.timestamp, entry.duration))}`
      : `${Math.round(Number(entry.progress || 0))}% | ${formatSeconds(normalizePlaybackTimestamp(entry.timestamp, entry.duration))}`
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
    const link = node.querySelector(".poster-btn");
    const image = node.querySelector(".poster-img");
    const title = node.querySelector(".poster-title");
    const sub = node.querySelector(".poster-sub");

    setPosterImage(image, item);
    image.alt = `${item.title} poster`;
    title.textContent = item.title;
    if (item.progressMeta) {
      renderContinueMeta(sub, item);
      sub.classList.add("continue-meta");
    } else {
      sub.classList.remove("continue-meta");
      sub.textContent = [item.mediaType === "movie" ? "Movie" : "TV", item.year].filter(Boolean).join(" | ");
    }
    if (item.progressMeta) {
      const progressTrack = document.createElement("span");
      progressTrack.className = "continue-progress";
      progressTrack.innerHTML = `<span style="width:${Math.max(0, Math.min(100, Number(item.progressPercent || 0)))}%"></span>`;
      link.appendChild(progressTrack);
    }

    if (options.allowRemove) {
      const switcher = document.createElement("label");
      switcher.className = "bookmark-switch-control";
      switcher.setAttribute("aria-label", `Move ${item.title} to another list`);
      switcher.innerHTML = `
        <span class="bookmark-switch-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M6 4h12v16l-6-4-6 4z"/></svg>
        </span>
        <select class="bookmark-switch-select">
          ${bookmarkStatuses().map((entry) => (
            `<option value="${entry.value}"${entry.value === item.status ? " selected" : ""}>${escapeHtml(entry.label)}</option>`
          )).join("")}
        </select>
      `;
      const select = switcher.querySelector("select");
      select?.addEventListener("click", (event) => {
        event.stopPropagation();
      });
      select?.addEventListener("change", (event) => {
        event.preventDefault();
        event.stopPropagation();
        moveBookmarkEntry(item.mediaType, item.id, select.value);
      });
      node.appendChild(switcher);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "continue-remove-btn";
      removeBtn.setAttribute("aria-label", `Remove ${item.title} from bookmarks`);
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        removeBookmarkEntry(item.mediaType, item.id);
      });
      node.appendChild(removeBtn);
    }

    const href = buildWatchHref(item.id, item.mediaType, item.season, item.episode, options.resume || item.resumeAvailable);
    if (link) link.href = href;

    fragment.appendChild(node);
  });

  container.appendChild(fragment);
  balancePosterGrid(container);
}

function bookmarkStatuses() {
  return [
    { value: "watching", label: "Watching" },
    { value: "watched", label: "Watched" },
    { value: "plan", label: "Plan" },
    { value: "dropped", label: "Dropped" }
  ];
}

function moveBookmarkEntry(mediaType, id, status) {
  const normalizedStatus = bookmarkStatuses().some((entry) => entry.value === status) ? status : "watching";
  const key = `${mediaType === "tv" ? "tv" : "movie"}:${Number(id)}`;
  const bookmarks = readJson(getBookmarksKey(state.session), {});
  if (!bookmarks?.[key]) return;
  bookmarks[key] = {
    ...bookmarks[key],
    status: normalizedStatus,
    updatedAt: Date.now()
  };
  localStorage.setItem(getBookmarksKey(state.session), JSON.stringify(bookmarks));
  void pushBookmarksToCloud(state.session, bookmarks);
  void renderBookmarksPage();
}

function removeBookmarkEntry(mediaType, id) {
  const key = `${mediaType === "tv" ? "tv" : "movie"}:${Number(id)}`;
  const bookmarks = readJson(getBookmarksKey(state.session), {});
  if (!bookmarks?.[key]) return;
  delete bookmarks[key];
  localStorage.setItem(getBookmarksKey(state.session), JSON.stringify(bookmarks));
  void deleteBookmarkFromCloud(state.session, mediaType, id);
  void renderBookmarksPage();
}

function renderEmpty(container) {
  container.innerHTML = '<p class="tiny muted">Empty</p>';
}

function renderContinueMeta(container, item) {
  container.textContent = "";
  const main = document.createElement("span");
  main.className = "continue-meta-main";
  const extra = document.createElement("span");
  extra.className = "continue-meta-extra";

  if (item.mediaType === "tv") {
    main.textContent = `S${item.season || 1} E${item.episode || 1}`;
    extra.textContent = formatSeconds(item.resumeSeconds || 0);
  } else {
    main.textContent = `${Math.round(Number(item.progressPercent || 0))}%`;
    extra.textContent = formatSeconds(item.resumeSeconds || 0);
  }
  container.append(main, extra);
}

function openWatchPage(id, mediaType, season = 1, episode = 1, resume = false) {
  window.location.href = buildWatchHref(id, mediaType, season, episode, resume);
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
