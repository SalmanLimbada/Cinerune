import {
  fetchItemsByIds,
  titleById,
  posterById,
  isSensitiveCatalogItem
} from "./catalog.js?v=20260515-bugfix2";
import { apiRequest, authHeaders, ensureSession } from "./auth-client.js";
import { deleteBookmarkFromCloud, pushBookmarksToCloud, syncBookmarksWithCloud } from "./bookmark-sync.js";
import { deleteProgressEntriesFromCloud, readDeletedProgressMap, rememberDeletedProgressEntries } from "./progress-sync.js";
import { initSharedHeader } from "./shared-ui.js?v=20260515-bugfix2";
import { balancePosterGrid } from "./drag-scroll.js?v=20260515-bugfix2";
import { getBookmarksKey, getProgressKey, initConfiguredTmdb, legacyProgressKey } from "./shared-state.js?v=20260515-bugfix2";
import { buildWatchHref, dedupeContinueProgressEntries, escapeHtml, formatSeconds, getLatestProgressEntry, normalizePlaybackTimestamp, readJson, setPosterImage } from "./shared-utils.js?v=20260515-bugfix2";
import { showToast } from "./ui-toast.js";

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
  clearContinueBtn: document.getElementById("clearContinueBtn"),
  continuePagination: document.getElementById("continuePagination"),
  posterCardTemplate: document.getElementById("posterCardTemplate")
};

const state = {
  session: null,
  continueItems: [],
  continuePage: Math.max(1, Number(query.get("page") || 1))
};

if (query.get("view") === "continue") {
  document.title = "Continue Watching | Cinerune";
  if (el.listsTitle) {
    el.listsTitle.textContent = "Continue Watching";
  }
}

const CONTINUE_PAGE_SIZE = 21;

boot();

async function boot() {
  initSharedHeader();
  initConfiguredTmdb();
  document.addEventListener("click", () => {
    document.querySelectorAll(".bookmark-switch-menu").forEach((node) => {
      node.setAttribute("hidden", "");
    });
    document.querySelectorAll(".bookmark-switch-trigger[aria-expanded='true']").forEach((node) => {
      node.setAttribute("aria-expanded", "false");
    });
  });


  await initAuth();
  if (!state.session?.user) {
    window.location.replace("./index.html");
    return;
  }

  if (query.get("view") === "continue") {
    setListsDocumentTitle("continue");
    setListsHeading("continue");
    el.clearContinueBtn?.addEventListener("click", clearAllContinueWatching);
    await renderContinuePage();
    return;
  }

  setListsHeading("bookmarks");
  await renderBookmarksPage();
}

async function renderBookmarksPage() {
  setListsHeading("bookmarks");
  [el.listWatching, el.listWatched, el.listPlan, el.listDropped].forEach((node) => renderSkeletonCards(node, 8));
  const progress = readJson(getProgressKey(state.session), readJson(legacyProgressKey, {})) || {};
  const bookmarks = Object.values(readJson(getBookmarksKey(state.session), {}))
    .filter((entry) => entry?.status && entry.status !== "deleted")
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
  setListsDocumentTitle("continue");
  setListsHeading("continue");
  hideBookmarkSections();
  renderSkeletonCards(el.listContinue, 8);

  const progress = readJson(getProgressKey(state.session), readJson(legacyProgressKey, {}));
  const entries = dedupeContinueProgressEntries(Object.values(progress || {}));

  if (!entries.length) {
    el.bookmarksStatus.textContent = "No continue watching titles yet.";
    el.clearContinueBtn?.setAttribute("hidden", "");
    renderEmpty(el.listContinue);
    return;
  }

  const hydrated = (await hydrateProgressEntries(entries)).filter((item) => !isSensitiveCatalogItem(item));
  el.continueListSection?.removeAttribute("hidden");
  el.clearContinueBtn?.removeAttribute("hidden");
  state.continueItems = hydrated;
  state.continuePage = Math.min(state.continuePage, Math.max(1, Math.ceil(hydrated.length / CONTINUE_PAGE_SIZE)));
  renderContinuePageSlice();
  el.bookmarksStatus.textContent = `${hydrated.length} title${hydrated.length === 1 ? "" : "s"} in progress.`;
}

function renderContinuePageSlice() {
  const totalPages = Math.max(1, Math.ceil(state.continueItems.length / CONTINUE_PAGE_SIZE));
  const current = Math.max(1, Math.min(totalPages, Number(state.continuePage || 1)));
  state.continuePage = current;
  const start = (current - 1) * CONTINUE_PAGE_SIZE;
  renderList(el.listContinue, state.continueItems.slice(start, start + CONTINUE_PAGE_SIZE), { resume: true, disableBalance: true, allowContinueRemove: true });
  renderContinuePagination(totalPages);
}

function renderContinuePagination(totalPages) {
  if (!el.continuePagination) return;
  const total = Math.max(1, Number(totalPages || 1));
  if (total <= 1) {
    el.continuePagination.setAttribute("hidden", "");
    el.continuePagination.innerHTML = "";
    return;
  }
  const pages = buildPagerPages(state.continuePage, total);
  el.continuePagination.innerHTML = pages.map((entry) => {
    if (entry.type === "gap") return `<span class="pager-btn ghost">...</span>`;
    const active = entry.page === state.continuePage ? " active" : "";
    return `<button class="pager-btn${active}" type="button" data-page="${entry.page}">${entry.label}</button>`;
  }).join("");
  el.continuePagination.insertAdjacentHTML("beforeend", `
    <span class="pager-jump">
      <input class="pager-input" type="number" min="1" max="${total}" placeholder="#" aria-label="Go to page" />
      <button class="pager-go" type="button">Go</button>
    </span>
  `);
  el.continuePagination.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => setContinuePage(Number(button.dataset.page || 1), total));
  });
  const input = el.continuePagination.querySelector(".pager-input");
  const jump = () => setContinuePage(Number(input?.value || 0), total);
  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      jump();
    }
  });
  el.continuePagination.querySelector(".pager-go")?.addEventListener("click", jump);
  el.continuePagination.removeAttribute("hidden");
}

function setListsDocumentTitle(mode) {
  if (mode === "continue") {
    document.title = "Continue Watching | Cinerune";
  }
}

function setListsHeading(mode) {
  if (!el.listsTitle) return;
  el.listsTitle.textContent = mode === "continue" ? "Continue Watching" : "Bookmarks";
}

function setContinuePage(page, totalPages) {
  const nextPage = Math.max(1, Math.min(totalPages, Number(page || 0)));
  if (!nextPage || nextPage === state.continuePage) return;
  state.continuePage = nextPage;
  const url = new URL(window.location.href);
  url.searchParams.set("view", "continue");
  url.searchParams.set("page", String(nextPage));
  window.history.replaceState({}, document.title, url.toString());
  renderContinuePageSlice();
  el.continueListSection?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function initAuth() {
  try {
    state.session = await ensureSession();
    if (state.session?.user) {
      const key = getBookmarksKey(state.session);
      const bookmarks = readJson(key, {});
      const synced = await syncBookmarksWithCloud(state.session, bookmarks);
      localStorage.setItem(key, JSON.stringify(synced));
      await pullCloudProgress();
    }
  } catch {
    state.session = null;
  }
}

async function pullCloudProgress() {
  if (!state.session?.user) return;
  let data = null;
  try {
    data = await apiRequest("/progress/pull?limit=500", {
      headers: authHeaders(state.session)
    });
  } catch {
    return;
  }

  const key = getProgressKey(state.session);
  const progress = readJson(key, {}) || {};
  const deletedProgressMap = readDeletedProgressMap(state.session);
  const pulledAt = Date.now();
  const nextProgress = {};
  (data || []).forEach((row) => {
    const mediaType = row.media_type === "tv" ? "tv" : "movie";
    const id = Number(row.content_id);
    if (!id) return;
    const season = Number(row.season_number) || 1;
    const episode = Number(row.episode_number) || 1;
    const progressKey = `${mediaType}:${id}:${season}:${episode}`;
    const cloudUpdatedAt = Date.parse(row.updated_at || "") || 0;
    if (deletedProgressMap[progressKey] && cloudUpdatedAt <= Number(deletedProgressMap[progressKey] || 0)) return;

    const entry = {
      mediaType,
      id,
      season,
      episode,
      timestamp: Number(row.timestamp_seconds) || 0,
      duration: Number(row.duration_seconds) || 0,
      progress: Number(row.progress_percent) || 0,
      updatedAt: cloudUpdatedAt || Date.now(),
      title: titleById(id, mediaType) || `Title ${id}`,
      poster: posterById(id, mediaType) || ""
    };
    if (normalizePlaybackTimestamp(entry.timestamp, entry.duration) > 8) {
      nextProgress[progressKey] = entry;
    }
  });

  Object.entries(progress || {}).forEach(([progressKey, entry]) => {
    if (nextProgress[progressKey]) return;
    if (Number(entry?.updatedAt || 0) > pulledAt) {
      nextProgress[progressKey] = entry;
    }
  });
  localStorage.setItem(key, JSON.stringify(nextProgress));
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
    progressKey: `${entry.mediaType === "tv" ? "tv" : "movie"}:${Number(entry.id)}:${entry.mediaType === "tv" ? Number(entry.season || 1) : 1}:${entry.mediaType === "tv" ? Number(entry.episode || 1) : 1}`,
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
      const switcher = document.createElement("div");
      switcher.className = "bookmark-switch-control";
      switcher.setAttribute("aria-label", `Move ${item.title} to another list`);
      switcher.innerHTML = `
        <button class="bookmark-switch-trigger" type="button" aria-expanded="false">
          <span class="bookmark-switch-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M6 4h12v16l-6-4-6 4z"/></svg>
          </span>
        </button>
        <div class="bookmark-switch-menu dropdown-menu" hidden>
          ${bookmarkStatuses().map((entry) => (
            `<button class="bookmark-option${entry.value === item.status ? " active" : ""}" type="button" data-status="${entry.value}">
              ${escapeHtml(entry.label)}
            </button>`
          )).join("")}
        </div>
      `;
      const trigger = switcher.querySelector(".bookmark-switch-trigger");
      const menu = switcher.querySelector(".bookmark-switch-menu");
      trigger?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        document.querySelectorAll(".bookmark-switch-menu").forEach((node) => {
          if (node !== menu) node.setAttribute("hidden", "");
        });
        const hidden = menu?.hasAttribute("hidden");
        menu?.toggleAttribute("hidden", !hidden);
        trigger.setAttribute("aria-expanded", hidden ? "true" : "false");
      });
      menu?.querySelectorAll("[data-status]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          moveBookmarkEntry(item.mediaType, item.id, button.dataset.status);
        });
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

    if (options.allowContinueRemove && item.progressKey) {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "continue-remove-btn";
      removeBtn.setAttribute("aria-label", `Remove ${item.title} from Continue Watching`);
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        removeContinueEntry(item.progressKey);
      });
      node.appendChild(removeBtn);
    }

    const href = buildWatchHref(item.id, item.mediaType, item.season, item.episode, options.resume || item.resumeAvailable);
    if (link) link.href = href;

    fragment.appendChild(node);
  });

  container.appendChild(fragment);
  if (!options.disableBalance) {
    balancePosterGrid(container);
  }
}

function bookmarkStatuses() {
  return [
    { value: "watching", label: "Watching" },
    { value: "watched", label: "Watched" },
    { value: "plan", label: "Plan" },
    { value: "dropped", label: "Dropped" }
  ];
}

function bookmarkStatusLabel(status) {
  return bookmarkStatuses().find((entry) => entry.value === status)?.label || "Watching";
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
  showToast(`Moved to ${bookmarkStatusLabel(normalizedStatus)}`);
  void renderBookmarksPage();
}

function removeBookmarkEntry(mediaType, id) {
  const key = `${mediaType === "tv" ? "tv" : "movie"}:${Number(id)}`;
  const bookmarks = readJson(getBookmarksKey(state.session), {});
  if (!bookmarks?.[key]) return;
  bookmarks[key] = {
    ...bookmarks[key],
    status: "deleted",
    updatedAt: Date.now()
  };
  localStorage.setItem(getBookmarksKey(state.session), JSON.stringify(bookmarks));
  void deleteBookmarkFromCloud(state.session, mediaType, id);
  showToast("Removed from bookmarks");
  void renderBookmarksPage();
}

function clearAllContinueWatching() {
  const progress = readJson(getProgressKey(state.session), readJson(legacyProgressKey, {})) || {};
  const nextProgress = { ...progress };
  const deletedEntries = [];
  Object.keys(nextProgress).forEach((key) => {
    const entry = nextProgress[key];
    if (
      normalizePlaybackTimestamp(entry?.timestamp, entry?.duration) > 8
    ) {
      deletedEntries.push(entry);
      delete nextProgress[key];
    }
  });
  localStorage.setItem(getProgressKey(state.session), JSON.stringify(nextProgress));
  rememberDeletedProgressEntries(state.session, deletedEntries);
  void deleteProgressEntriesFromCloud(state.session, deletedEntries);
  if (deletedEntries.length) showToast("Cleared Continue Watching");
  state.continueItems = [];
  state.continuePage = 1;
  el.continuePagination?.setAttribute("hidden", "");
  if (el.continuePagination) el.continuePagination.innerHTML = "";
  void renderContinuePage();
}

function removeContinueEntry(progressEntryKey) {
  const progress = readJson(getProgressKey(state.session), readJson(legacyProgressKey, {})) || {};
  const entry = progress?.[progressEntryKey];
  if (!entry) return;
  rememberDeletedProgressEntries(state.session, [entry]);
  delete progress[progressEntryKey];
  localStorage.setItem(getProgressKey(state.session), JSON.stringify(progress));
  void deleteProgressEntriesFromCloud(state.session, [entry]);
  showToast("Removed from Continue Watching");
  state.continueItems = state.continueItems.filter((item) => item.progressKey !== progressEntryKey);
  if (!state.continueItems.length) {
    el.bookmarksStatus.textContent = "No continue watching titles yet.";
    el.clearContinueBtn?.setAttribute("hidden", "");
    el.continuePagination?.setAttribute("hidden", "");
    renderEmpty(el.listContinue);
    return;
  }
  state.continuePage = Math.min(state.continuePage, Math.max(1, Math.ceil(state.continueItems.length / CONTINUE_PAGE_SIZE)));
  renderContinuePageSlice();
  el.bookmarksStatus.textContent = `${state.continueItems.length} title${state.continueItems.length === 1 ? "" : "s"} in progress.`;
}

function renderEmpty(container) {
  container.innerHTML = '<p class="tiny muted">Empty</p>';
}

function renderSkeletonCards(container, count = 8) {
  if (!container) return;
  container.innerHTML = Array.from({ length: count }, () => `
    <article class="poster-card skeleton-card" aria-hidden="true">
      <span class="skeleton skeleton-poster"></span>
      <span class="skeleton skeleton-line"></span>
      <span class="skeleton skeleton-line short"></span>
    </article>
  `).join("");
}

function renderContinueMeta(container, item) {
  container.textContent = "";
  const main = document.createElement("span");
  main.className = "continue-meta-main";
  const extra = document.createElement("span");
  extra.className = "continue-meta-extra";
  const detail = document.createElement("span");
  detail.className = "continue-meta-detail";
  detail.textContent = [item.mediaType === "movie" ? "Movie" : "TV", item.year].filter(Boolean).join(" | ");

  if (item.mediaType === "tv") {
    main.textContent = `S${item.season || 1} E${item.episode || 1}`;
    extra.textContent = formatSeconds(item.resumeSeconds || 0);
  } else {
    main.textContent = `${Math.round(Number(item.progressPercent || 0))}%`;
    extra.textContent = formatSeconds(item.resumeSeconds || 0);
  }
  container.append(main, extra);
  if (detail.textContent) container.append(detail);
}

function openWatchPage(id, mediaType, season = 1, episode = 1, resume = false) {
  window.location.href = buildWatchHref(id, mediaType, season, episode, resume);
}

function hideBookmarkSections() {
  [el.listWatching, el.listWatched, el.listPlan, el.listDropped].forEach((node) => {
    node?.closest(".lists-section")?.setAttribute("hidden", "");
  });
}

function buildPagerPages(current, total) {
  const pages = [];
  const add = (page) => {
    if (page >= 1 && page <= total && !pages.some((entry) => entry.page === page)) {
      pages.push({ type: "page", page, label: String(page) });
    }
  };
  add(1);
  for (let page = current - 1; page <= current + 1; page += 1) add(page);
  add(total);
  pages.sort((a, b) => a.page - b.page);
  const output = [];
  pages.forEach((entry, index) => {
    if (index > 0 && entry.page - pages[index - 1].page > 1) {
      output.push({ type: "gap" });
    }
    output.push(entry);
  });
  return output;
}
