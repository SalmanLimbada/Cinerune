import { apiRequest, authHeaders, clearStoredSession, ensureSession } from "./auth-client.js";
import { avatarDataUri, avatarSrcById, initSharedFooterReport, initSharedNavSearch, normalizeAvatarId, openSettingsModal, openSharedAuthModal } from "./shared-ui.js?v=20260513-fixes1";
import { initHeaderNotifications } from "./notifications.js?v=20260513-fixes1";
import { initDragScroll } from "./drag-scroll.js?v=20260513-fixes1";
import { showToast } from "./ui-toast.js";
import { deleteBookmarkFromCloud, pushBookmarksToCloud, syncBookmarksWithCloud } from "./bookmark-sync.js";
import {
  fetchItemDetailsById,
  fetchRelatedById,
  episodeCount,
  fetchSeasonEpisodes,
  seasonCount,
  titleById,
  posterById
} from "./catalog.js?v=20260513-fixes1";
import { getBookmarksKey, getProgressKey, initConfiguredTmdb, legacyProgressKey } from "./shared-state.js?v=20260513-fixes1";
import { buildResumableWatchHref, buildWatchHref, escapeHtml, formatSeconds, normalizePlaybackTimestamp, readJson, sanitizeText, setPosterImage } from "./shared-utils.js?v=20260513-fixes1";

const PLAYER_BASE = "https://www.vidking.net/embed";
const VIDROCK_BASE = "https://vidrock.net";
const VIDEASY_BASE = "https://player.videasy.net";
const settingsKey = "cinerune:settings";
const defaultServerOrder = ["videasy", "vidrock", "vidking"];
const reportsKey = "cinerune:reports";
const REPORT_LIMIT = 500;

const el = {
  watchAccountMenuWrap: document.getElementById("watchAccountMenuWrap"),
  watchAccountBtn: document.getElementById("watchAccountBtn"),
  watchAccountAvatar: document.getElementById("watchAccountAvatar"),
  watchAccountLabel: document.getElementById("watchAccountLabel"),
  watchAccountMenu: document.getElementById("watchAccountMenu"),
  watchAccountSettings: document.getElementById("watchAccountSettings"),
  watchSignOutBtn: document.getElementById("watchSignOutBtn"),
  watchListsLink: document.getElementById("watchListsLink"),
  watchTagline: document.getElementById("watchTagline"),
  watchTitle: document.getElementById("watchTitle"),
  watchMeta: document.getElementById("watchMeta"),
  watchStatus: document.getElementById("watchStatus"),
  playerFrame: document.getElementById("playerFrame"),
  sidePoster: document.getElementById("sidePoster"),
  sideType: document.getElementById("sideType"),
  sideGenre: document.getElementById("sideGenre"),
  sideRuntime: document.getElementById("sideRuntime"),
  sideRating: document.getElementById("sideRating"),
  sidePlot: document.getElementById("sidePlot"),
  sideProgress: document.getElementById("sideProgress"),
  ratingStars: document.getElementById("ratingStars"),
  tvControls: document.getElementById("tvControls"),
  episodeCountText: document.getElementById("episodeCountText"),
  seasonSelect: document.getElementById("seasonSelect"),
  prevEpisodeBtn: document.getElementById("prevEpisodeBtn"),
  nextEpisodeBtn: document.getElementById("nextEpisodeBtn"),
  episodeGrid: document.getElementById("episodeGrid"),
  relatedRail: document.getElementById("relatedRail"),
  relatedPrevBtn: document.getElementById("relatedPrevBtn"),
  relatedNextBtn: document.getElementById("relatedNextBtn"),
  bookmarkTrigger: document.getElementById("bookmarkTrigger"),
  bookmarkToast: document.getElementById("bookmarkToast"),
  bookmarkMenu: document.getElementById("bookmarkMenu"),
  reportTrigger: document.getElementById("reportTrigger"),
  reportDialog: document.getElementById("reportDialog"),
  reportForm: document.getElementById("reportForm"),
  reportMessage: document.getElementById("reportMessage"),
  cancelReport: document.getElementById("cancelReport"),
  playerServer1: document.getElementById("playerServer1"),
  playerServer2: document.getElementById("playerServer2"),
  playerServer3: document.getElementById("playerServer3")
};

const query = new URLSearchParams(window.location.search);

const state = {
  mediaType: query.get("type") === "tv" ? "tv" : "movie",
  id: Number(query.get("id")) || 0,
  season: Number(query.get("s")) || 1,
  episode: Number(query.get("e")) || 1,
  playerServer: "videasy",
  resumeMode: query.get("resume") === "1",
  resumeAttempted: false,
  resumeTarget: 0,
  resumeSeekTimer: null,
  resumeFallbackTimer: null,
  resumeSeekAttempts: 0,
  resumeConfirmed: false,
  serverSwitchInProgress: false,
  lastPlayerEventAt: 0,
  lastPlaybackTime: 0,
  playerSupportsCommands: false,
  playerLoadedAt: 0,
  serverProgressTimer: null,
  serverProgressStartedAt: 0,
  serverProgressBaseTimestamp: 0,
  settings: readJson(settingsKey, {
    autoPlay: false,
    nextEpisode: true,
    autoNextSmart: true,
    preferredServer: "videasy",
    serverOrder: defaultServerOrder
  }),
  progress: {},
  bookmarks: readJson(getBookmarksKey(null), {}),
  reports: readJson(reportsKey, []),
  session: null,
  item: null,
  autoSyncTimer: null,
  lastSyncAt: 0,
  lastAutoNextKey: ""
};

boot();

async function boot() {
  syncProgressState();
  initConfiguredTmdb();
  initSharedNavSearch({ getProgress: () => state.progress });
  initSharedFooterReport(() => state.session);

  state.playerServer = normalizeServerId(state.settings?.preferredServer || state.playerServer);
  state.settings.serverOrder = normalizeServerOrder(state.settings?.serverOrder);
  applyPlayerServerOrder();
  bindEvents();
  updatePlayerServerToggle();
  initHeaderNotifications();
  if (el.bookmarkMenu) {
    el.bookmarkMenu.setAttribute("hidden", "");
  }
  await initAuth();

  if (!state.id) {
    setStatus("Missing title ID.");
    return;
  }

  state.item = await fetchItemDetailsById(state.id, state.mediaType);
  if (!state.item) {
    setStatus("Title unavailable.");
    return;
  }

  hydrateInfo();
  await hydrateEpisodeControls();
  loadPlayer();
  deferSecondaryWatchContent();
}

function bindEvents() {
  el.prevEpisodeBtn.addEventListener("click", playPrevEpisode);
  el.nextEpisodeBtn.addEventListener("click", playNextEpisode);

  if (el.playerServer1) {
    el.playerServer1.addEventListener("click", () => setPlayerServer("videasy"));
  }
  if (el.playerServer2) {
    el.playerServer2.addEventListener("click", () => setPlayerServer("vidrock"));
  }
  if (el.playerServer3) {
    el.playerServer3.addEventListener("click", () => setPlayerServer("vidking"));
  }

  el.seasonSelect.addEventListener("change", async () => {
    state.season = Number(el.seasonSelect.value) || 1;
    state.episode = 1;
    await refillEpisodeGrid();
    updateWatchLocation();
    loadPlayer();
  });

  if (el.watchAccountBtn) {
    el.watchAccountBtn.addEventListener("click", () => {
      if (state.session?.user) {
        toggleWatchAccountMenu();
      } else {
        openSharedAuthModal("login");
      }
    });
  }


  if (el.watchAccountSettings) {
    el.watchAccountSettings.addEventListener("click", () => {
      closeWatchAccountMenu();
      openSettingsModal();
    });
  }
  ensureWatchReportMenuItem();

  if (el.watchSignOutBtn) {
    el.watchSignOutBtn.addEventListener("click", () => {
      clearStoredSession();
      state.session = null;
      syncProgressState();
      closeWatchAccountMenu();
      document.getElementById("notificationsWrap")?.setAttribute("hidden", "");
      renderWatchAccountUI();
    });
  }

  el.relatedPrevBtn.addEventListener("click", () => {
    el.relatedRail.scrollBy({ left: -320, behavior: "smooth" });
  });
  el.relatedNextBtn.addEventListener("click", () => {
    el.relatedRail.scrollBy({ left: 320, behavior: "smooth" });
  });

  el.bookmarkTrigger.addEventListener("click", () => {
    const hidden = el.bookmarkMenu.hasAttribute("hidden");
    if (hidden) {
      el.bookmarkMenu.removeAttribute("hidden");
      el.bookmarkTrigger.classList.add("active");
      el.bookmarkTrigger.setAttribute("aria-expanded", "true");
    } else {
      el.bookmarkMenu.setAttribute("hidden", "");
      el.bookmarkTrigger.classList.remove("active");
      el.bookmarkTrigger.setAttribute("aria-expanded", "false");
    }
    updateMenuScrimVisibility();
  });

  [...document.querySelectorAll(".bookmark-option")].forEach((node) => {
    node.addEventListener("click", () => {
      saveBookmark(node.dataset.status);
      el.bookmarkMenu.setAttribute("hidden", "");
    });
  });

  document.addEventListener("click", (event) => {
    if (el.watchAccountMenuWrap && !el.watchAccountMenuWrap.contains(event.target)) {
      closeWatchAccountMenu();
    }
    if (!el.bookmarkMenu.contains(event.target) && !el.bookmarkTrigger.contains(event.target)) {
      el.bookmarkMenu.setAttribute("hidden", "");
      el.bookmarkTrigger.classList.remove("active");
      el.bookmarkTrigger.setAttribute("aria-expanded", "false");
    }
    updateMenuScrimVisibility();
  });

  el.reportTrigger.addEventListener("click", openReportDialog);

  el.playerFrame?.addEventListener("load", () => {
    state.playerLoadedAt = Date.now();
  });

  el.cancelReport.addEventListener("click", () => {
    el.reportDialog.close("cancel");
  });

  el.reportForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitReport();
  });

  window.addEventListener("message", onPlayerMessage);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      persistFallbackProgressSnapshot();
      queueAutoSync(true);
    }
  });
  window.addEventListener("beforeunload", () => {
    persistFallbackProgressSnapshot();
    queueAutoSync(true);
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== "cinerune:session") return;
    void initAuth();
  });
  window.addEventListener("cinerune:session-updated", async (event) => {
    state.session = event.detail || null;
    state.progress = {};
    state.bookmarks = {};
    if (el.sideProgress) el.sideProgress.textContent = "Checking saved progress...";
    syncProgressState();
    state.bookmarks = readJson(getBookmarksKey(state.session), {});
    if (state.session?.user) {
      state.bookmarks = await syncBookmarksWithCloud(state.session, state.bookmarks);
      localStorage.setItem(getBookmarksKey(state.session), JSON.stringify(state.bookmarks));
    }
    if (state.item) hydrateInfo();
    syncBookmarkButton();
    renderWatchAccountUI();
  });
  window.addEventListener("cinerune:settings-updated", (event) => {
    state.settings = {
      ...state.settings,
      ...(event.detail || {})
    };
    state.settings.serverOrder = normalizeServerOrder(state.settings.serverOrder);
    state.playerServer = normalizeServerId(state.settings.preferredServer || state.playerServer);
    applyPlayerServerOrder();
    updatePlayerServerToggle();
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== settingsKey) return;
    state.settings = readJson(settingsKey, state.settings);
    state.settings.serverOrder = normalizeServerOrder(state.settings.serverOrder);
    applyPlayerServerOrder();
    updatePlayerServerToggle();
  });
}


function hydrateInfo() {
  const item = state.item;

  el.watchTagline.textContent = `Home / ${item.mediaType === "movie" ? "Movies" : "TV"} / ${item.title}`;
  el.watchTitle.textContent = item.title;
  el.watchMeta.innerHTML = [
    '<span class="badge imdb">IMDb</span>',
    '<span class="badge">HD</span>',
    `<span class="badge">${item.mediaType === "movie" ? "Movie" : "TV"}</span>`,
    item.year ? `<span class="badge">${item.year}</span>` : ""
  ].join("");

  setPosterImage(el.sidePoster, item);
  el.sidePoster.alt = `${item.title} poster`;
  el.sidePlot.textContent = item.plot || "No overview available.";
  el.sideType.textContent = item.released ? `Released: ${item.released}` : "";
  el.sideGenre.textContent = item.genre ? `Genres: ${item.genre}` : "";
  el.sideRuntime.textContent = item.runtime ? `Runtime: ${item.runtime}` : "";

  if (item.rating) {
    el.sideRating.textContent = `${item.rating} / 10`;
    renderStars(item.rating);
  } else {
    el.sideRating.textContent = "No rating";
    renderStars(0);
  }

  const resume = getSavedProgress();
  const resumeTimestamp = normalizePlaybackTimestamp(resume?.timestamp, resume?.duration);
  el.sideProgress.textContent = resumeTimestamp
    ? `Resume: ${formatSeconds(resumeTimestamp)} (${Math.round(Number(resume.progress || 0))}%)`
    : "No saved progress yet.";

  syncBookmarkButton();
}

async function hydrateEpisodeControls() {
  if (state.mediaType !== "tv") {
    el.tvControls.setAttribute("hidden", "");
    return;
  }

  el.tvControls.removeAttribute("hidden");

  el.seasonSelect.innerHTML = "";
  const totalSeasons = Math.max(1, Number(seasonCount(state.id) || state.item.totalSeasons || 1));
  for (let season = 1; season <= totalSeasons; season += 1) {
    const option = document.createElement("option");
    option.value = String(season);
    option.textContent = `Season ${season}`;
    option.selected = season === state.season;
    el.seasonSelect.appendChild(option);
  }

  await refillEpisodeGrid();
}

function deferSecondaryWatchContent() {
  const load = () => {
    renderRelated().catch(() => {
      if (el.relatedRail) el.relatedRail.innerHTML = "";
    });
  };

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(load, { timeout: 1500 });
  } else {
    window.setTimeout(load, 250);
  }
}

async function refillEpisodeGrid() {
  if (!el.episodeGrid) return;
  const episodes = await fetchSeasonEpisodes(state.id, state.season, { forceRefresh: true });
  const totalEpisodes = episodes.length;

  state.episode = totalEpisodes > 0
    ? Math.min(Math.max(Number(state.episode || 1), 1), totalEpisodes)
    : 1;

  el.episodeGrid.innerHTML = "";
  const fragment = document.createDocumentFragment();

  episodes.forEach((episodeInfo) => {
    const episode = Number(episodeInfo.episodeNumber || 0);
    if (!episode) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "episode-pill";
    button.dataset.episode = String(episode);
    if (episodeInfo.airDate) {
      const dateText = formatEpisodeDate(episodeInfo.airDate);
      button.title = dateText ? `Aired ${dateText}` : `Air date: ${episodeInfo.airDate}`;
      button.dataset.airDate = dateText || episodeInfo.airDate;
      button.setAttribute("aria-label", `${episodeInfo.name || `Episode ${episode}`}, aired ${dateText || episodeInfo.airDate}`);
    }
    button.textContent = `EP${episode}: ${episodeInfo.name || `Episode ${episode}`}`;
    button.classList.toggle("active", episode === state.episode);
    button.addEventListener("click", () => playEpisode(episode));
    fragment.appendChild(button);
  });

  el.episodeGrid.appendChild(fragment);
  if (el.episodeCountText) {
    el.episodeCountText.textContent = totalEpisodes > 0
      ? `Season ${state.season} has ${totalEpisodes} episode${totalEpisodes === 1 ? "" : "s"}.`
      : `Season ${state.season} has no episodes yet.`;
  }
}

function formatEpisodeDate(value) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function playEpisode(episode) {
  state.episode = Number(episode) || 1;
  syncEpisodeSelection();
  updateWatchLocation();
  loadPlayer();
}

async function playPrevEpisode() {
  if (state.mediaType !== "tv") return;
  if (state.episode > 1) {
    state.episode -= 1;
  } else if (state.season > 1) {
    state.season -= 1;
    state.episode = Math.max(1, await episodeCount(state.id, state.season));
  }
  await hydrateEpisodeControls();
  updateWatchLocation();
  loadPlayer();
}

async function playNextEpisode() {
  if (state.mediaType !== "tv") return;
  const totalEpisodes = await episodeCount(state.id, state.season);
  const totalSeasons = Math.max(1, Number(seasonCount(state.id) || state.item.totalSeasons || 1));

  if (totalEpisodes < 1) {
    setStatus(`Season ${state.season} has no episodes yet.`);
    return;
  }

  if (state.episode < totalEpisodes) {
    state.episode += 1;
  } else if (state.season < totalSeasons) {
    state.season += 1;
    state.episode = 1;
  }

  await hydrateEpisodeControls();
  updateWatchLocation();
  loadPlayer();
}

async function syncEpisodeSelection() {
  if (state.mediaType !== "tv") return;
  if (el.seasonSelect && Number(el.seasonSelect.value) !== Number(state.season)) {
    el.seasonSelect.value = String(state.season);
    await refillEpisodeGrid();
    return;
  }
  if (el.episodeGrid) {
    [...el.episodeGrid.querySelectorAll(".episode-pill")].forEach((node) => {
      node.classList.toggle("active", Number(node.dataset.episode) === Number(state.episode));
    });
  }
}

function loadPlayer() {
  clearResumeTimers();
  stopFallbackProgress({ persist: true });
  state.lastPlayerEventAt = 0;
  state.lastPlaybackTime = 0;
  state.resumeConfirmed = false;
  state.resumeSeekAttempts = 0;
  el.playerFrame.src = "";
  const serverId = normalizeServerId(state.playerServer);
  state.playerSupportsCommands = false;
  state.playerLoadedAt = 0;

  const shouldUseSavedResume = state.resumeMode && !state.resumeAttempted && !state.serverSwitchInProgress;
  const resume = shouldUseSavedResume ? getSavedProgress() : null;
  let appliedResume = false;
  if (state.serverSwitchInProgress) {
    appliedResume = state.resumeTarget > 0;
  } else {
    state.resumeTarget = 0;
    const resumeTimestamp = normalizePlaybackTimestamp(resume?.timestamp, resume?.duration);
    if (resumeTimestamp > 0 && Number(resume.progress || 0) < 98) {
      const duration = Number(resume.duration || 0);
      let safeTimestamp = resumeTimestamp;
      if (duration > 0) {
        safeTimestamp = Math.min(Math.max(safeTimestamp, 0), Math.max(duration - 5, 0));
      }
      const minRemaining = duration > 0 ? 30 : 0;
      if (safeTimestamp > 2 && (duration === 0 || safeTimestamp < duration - minRemaining)) {
        appliedResume = true;
        state.resumeTarget = safeTimestamp;
      }
    }
  }

  if (state.resumeMode && !appliedResume) {
    state.resumeMode = false;
    state.resumeAttempted = true;
  }

  const url = buildPlayerUrl(serverId);
  el.playerFrame.src = url.toString();
  scheduleResumeSeek(appliedResume);
  ensureProgressEntry();
  startFallbackProgress();
  state.serverSwitchInProgress = false;

    // Do not show a transient "Player loaded" message to users.
}

function clearResumeTimers() {
  if (state.resumeSeekTimer) {
    window.clearTimeout(state.resumeSeekTimer);
    state.resumeSeekTimer = null;
  }
  if (state.resumeFallbackTimer) {
    window.clearTimeout(state.resumeFallbackTimer);
    state.resumeFallbackTimer = null;
  }
}

function scheduleResumeSeek(appliedResume) {
  if (!state.playerSupportsCommands || !state.resumeMode || !appliedResume) return;

  const startedAt = Date.now();
  const target = Number(state.resumeTarget || 0);

  const attemptSeek = () => {
    if (!state.resumeMode || !target) return;
    if (state.resumeConfirmed) return;

    state.resumeSeekAttempts += 1;
    sendPlayerCommand("seek", { time: target });
    sendPlayerCommand("play");

    if (state.resumeSeekAttempts < 8) {
      state.resumeSeekTimer = window.setTimeout(attemptSeek, 900);
    }
  };

  state.resumeSeekTimer = window.setTimeout(attemptSeek, 1800);
  state.resumeFallbackTimer = window.setTimeout(() => {
    const noEvents = state.lastPlayerEventAt < startedAt;
    const missedTarget = target > 0 && state.lastPlaybackTime < target - 6;
    const stuckAtResumeFrame = state.resumeConfirmed && state.lastPlaybackTime < target + 4;
    if (noEvents || missedTarget || stuckAtResumeFrame) {
      state.resumeMode = false;
      state.resumeAttempted = true;
      state.resumeTarget = 0;
      state.resumeConfirmed = false;
      state.lastPlaybackTime = 0;
      state.lastPlayerEventAt = 0;
      loadPlayer();
    }
  }, 14000);
}

function sendPlayerCommand(command, payload = {}) {
  if (!state.playerSupportsCommands) return;
  const target = el.playerFrame?.contentWindow;
  if (!target) return;

  const message = { command, ...payload };
  target.postMessage(message, "*");
  target.postMessage({ type: "PLAYER_COMMAND", ...message }, "*");
}


async function renderRelated() {
  const related = await fetchRelatedById(state.id, state.mediaType);
  const fragment = document.createDocumentFragment();

  related.forEach((item) => {
    const card = document.createElement("article");
    card.className = "poster-card";

    const link = document.createElement("a");
    link.className = "poster-btn";

    const image = document.createElement("img");
    image.className = "poster-img";
    setPosterImage(image, item);
    image.alt = `${item.title} poster`;
    image.loading = "lazy";
    image.decoding = "async";

    const badge = document.createElement("span");
    badge.className = "badge-hd";
    badge.textContent = "HD";

    const meta = document.createElement("div");
    meta.className = "poster-meta";

    const title = document.createElement("h4");
    title.className = "poster-title";
    title.textContent = item.title;

    const sub = document.createElement("p");
    sub.className = "poster-sub";
    sub.textContent = `${item.mediaType === "movie" ? "Movie" : "TV"}${item.year ? ` | ${item.year}` : ""}`;

    meta.append(title, sub);
    link.append(image, badge, meta);

    link.href = buildResumableWatchHref(item, state.progress);

    card.appendChild(link);
    fragment.appendChild(card);
  });

  el.relatedRail.innerHTML = "";
  el.relatedRail.appendChild(fragment);
  initDragScroll();
}

function saveBookmark(status) {
  if (!state.item) return;
  const key = `${state.mediaType}:${state.id}`;
  const current = state.bookmarks[key] || null;

  if (status === "clear" || current?.status === status) {
    delete state.bookmarks[key];
    localStorage.setItem(getBookmarksKey(state.session), JSON.stringify(state.bookmarks));
    void deleteBookmarkFromCloud(state.session, state.mediaType, state.id);
    syncBookmarkButton();
    showBookmarkToast("Removed");
    setStatus("Bookmark removed.");
    return;
  }

  const normalizedStatus = ["watching", "watched", "plan", "dropped"].includes(status) ? status : "watching";

  state.bookmarks[key] = {
    id: state.id,
    mediaType: state.mediaType,
    status: normalizedStatus,
    title: state.item.title,
    poster: state.item.poster,
    updatedAt: Date.now()
  };

  localStorage.setItem(getBookmarksKey(state.session), JSON.stringify(state.bookmarks));
  void pushBookmarksToCloud(state.session, state.bookmarks);
  syncBookmarkButton();
  showBookmarkToast(`Marked ${labelForStatus(normalizedStatus)}`);
  setStatus(`Saved to ${labelForStatus(normalizedStatus)}.`);
}

function submitReport() {
  const message = sanitizeText(el.reportMessage.value, REPORT_LIMIT);
  if (el.reportMessage.value !== message) {
    el.reportMessage.value = message;
  }
  if (!message) {
    animateReportValidation();
    setStatus("Write a report message first.");
    return;
  }

  const report = {
    id: state.id,
    contentId: state.id,
    mediaType: state.mediaType,
    title: state.item?.title || titleById(state.id, state.mediaType) || `Title ${state.id}`,
    poster: state.item?.poster || posterById(state.id, state.mediaType) || "",
    message,
    page: window.location.pathname,
    createdAt: Date.now()
  };

  state.reports.unshift(report);
  localStorage.setItem(reportsKey, JSON.stringify(state.reports.slice(0, 200)));
  void submitReportToServer(report);
  el.reportDialog.close("submit");
  setStatus("Report submitted. Thank you.");
}

function openReportDialog() {
  el.reportMessage.value = "";
  el.reportMessage.classList.remove("field-shake");
  el.reportDialog.showModal();
}

function animateReportValidation() {
  if (!el.reportMessage) return;
  el.reportMessage.classList.remove("field-shake");
  void el.reportMessage.offsetWidth;
  el.reportMessage.classList.add("field-shake");
  el.reportMessage.focus();
}

async function submitReportToServer(report) {
  try {
    const session = await ensureSession();
    await apiRequest("/report", {
      method: "POST",
      headers: authHeaders(session),
      body: report
    });
  } catch {
    // Local report storage is the fallback if the reports table is not configured.
  }
}

function getSavedProgress() {
  const key = `${state.mediaType}:${state.id}:${state.season}:${state.episode}`;
  return state.progress[key] || null;
}

function syncProgressState() {
  const activeKey = getProgressKey(state.session);
  let progress = readJson(activeKey, null);

  if (!progress && !state.session?.user) {
    const legacy = readJson(legacyProgressKey, null);
    if (legacy && typeof legacy === "object") {
      progress = legacy;
      localStorage.setItem(activeKey, JSON.stringify(legacy));
    }
  }

  state.progress = progress && typeof progress === "object" ? progress : {};
}

function syncBookmarkButton() {
  if (!el.bookmarkTrigger || !el.bookmarkMenu || !state.item) return;

  if (!state.session?.user) {
    el.bookmarkTrigger.setAttribute("hidden", "");
    el.bookmarkMenu.setAttribute("hidden", "");
    el.bookmarkTrigger.classList.remove("active");
    el.bookmarkTrigger.setAttribute("aria-expanded", "false");
    return;
  } else {
    el.bookmarkTrigger.removeAttribute("hidden");
  }

  const current = state.bookmarks[`${state.mediaType}:${state.id}`] || null;
  const removeOption = el.bookmarkMenu.querySelector(".bookmark-clear");
  if (removeOption) {
    removeOption.toggleAttribute("hidden", !current);
  }
  el.bookmarkTrigger.classList.toggle("active", Boolean(current) || !el.bookmarkMenu.hasAttribute("hidden"));
  el.bookmarkTrigger.setAttribute("aria-expanded", el.bookmarkMenu.hasAttribute("hidden") ? "false" : "true");

  [...el.bookmarkMenu.querySelectorAll(".bookmark-option")].forEach((node) => {
    node.classList.toggle("active", node.dataset.status === current?.status);
  });
}

function showBookmarkToast(message) {
  if (!el.bookmarkToast) return;
  el.bookmarkToast.textContent = message;
  el.bookmarkToast.removeAttribute("hidden");
  window.clearTimeout(showBookmarkToast.timer);
  showBookmarkToast.timer = window.setTimeout(() => {
    if (el.bookmarkToast) el.bookmarkToast.setAttribute("hidden", "");
  }, 1200);
}

async function onPlayerMessage(event) {
  if (!event?.data) return;

  const allowedOrigins = new Set([
    "https://www.vidking.net",
    "https://vidking.net",
    "https://vidrock.net",
    "https://player.videasy.net"
  ]);
  if (event.origin && !allowedOrigins.has(event.origin)) return;

  let parsed = event.data;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return;
    }
  }

  let data = null;
  let eventType = "timeupdate";

  if (parsed?.type === "PLAYER_EVENT" && parsed?.data) {
    data = { ...parsed.data };
    eventType = data.event || eventType;
  } else if (parsed?.type === "MEDIA_DATA" && parsed?.data) {
    data = { ...parsed.data };
  } else if (parsed && typeof parsed === "object" && parsed.id && parsed.type) {
    data = { ...parsed };
  }

  if (!data) return;

  if (!state.playerSupportsCommands) {
    state.playerSupportsCommands = true;
    if (state.resumeMode && state.resumeTarget > 0 && !state.resumeConfirmed && state.resumeSeekAttempts === 0) {
      scheduleResumeSeek(true);
    }
  }

  const mediaType = data.mediaType || data.type;
  if (mediaType !== "movie" && mediaType !== "tv") return;

  const id = Number(data.id || data.tmdbId || 0);
  if (!id) return;

  const season = Number(data.season || data.last_season_watched || state.season || 1);
  const episode = Number(data.episode || data.last_episode_watched || state.episode || 1);
  const key = `${mediaType}:${id}:${season}:${episode}`;
  const isCurrentTitle = mediaType === state.mediaType && id === Number(state.id);
  const durationValue = Number(data.duration || data.progress?.duration || 0) || 0;
  const incomingTimestamp = normalizePlaybackTimestamp(data.currentTime ?? data.timestamp ?? 0, durationValue);
  let incomingProgress = Number(data.progress || 0) || 0;
  if (!incomingProgress && durationValue > 0 && incomingTimestamp > 0) {
    incomingProgress = (incomingTimestamp / durationValue) * 100;
  }
  const existing = state.progress[key] || null;

  if (
    existing
    && eventType !== "ended"
    && Number(existing.timestamp || 0) > 20
    && Number(existing.progress || 0) < 98
    && incomingTimestamp < 5
    && incomingProgress <= 1
    && !state.serverSwitchInProgress
  ) {
    return;
  }

  state.lastPlayerEventAt = Date.now();
  stopFallbackProgress();

  if (isCurrentTitle && mediaType === "tv" && (season !== state.season || episode !== state.episode)) {
    state.season = season;
    state.episode = episode;
    await syncEpisodeSelection();
    updateWatchLocation();
  }

  if (Number.isFinite(Number(incomingTimestamp))) {
    state.lastPlaybackTime = Math.max(0, incomingTimestamp);
  }

  if (state.resumeTarget > 0 && state.lastPlaybackTime >= state.resumeTarget - 2) {
    state.resumeConfirmed = true;
  }

  if (state.resumeTarget > 0 && state.lastPlaybackTime >= state.resumeTarget + 4) {
    clearResumeTimers();
    state.resumeMode = false;
    state.resumeAttempted = true;
    state.resumeTarget = 0;
    state.resumeConfirmed = false;
  }

  state.progress[key] = {
    mediaType,
    id,
    season,
    episode,
    timestamp: incomingTimestamp,
    duration: durationValue,
    progress: incomingProgress,
    updatedAt: Date.now(),
    title: state.item?.title || titleById(id, mediaType) || `Title ${id}`,
    poster: state.item?.poster || posterById(id, mediaType) || ""
  };

  if (eventType === "ended") {
    state.progress[key].timestamp = 0;
    state.progress[key].progress = 100;
  }

  localStorage.setItem(getProgressKey(state.session), JSON.stringify(state.progress));
  queueAutoSync(eventType === "ended");

  if (eventType === "ended" && mediaType === "tv" && state.settings.autoNextSmart && isCurrentTitle) {
    if (state.lastAutoNextKey === key) return;
    state.lastAutoNextKey = key;
    window.setTimeout(() => {
      if (state.lastAutoNextKey === key) state.lastAutoNextKey = "";
    }, 30000);
    await playNextEpisode();
  }
}

function startFallbackProgress() {
  if (state.playerSupportsCommands) return;
  if (state.serverProgressTimer) return;
  const key = `${state.mediaType}:${state.id}:${state.season}:${state.episode}`;
  const existing = state.progress[key] || null;
  state.serverProgressBaseTimestamp = Number(existing?.timestamp || 0);
  state.serverProgressStartedAt = Date.now();

  state.serverProgressTimer = window.setInterval(() => {
    if (state.playerSupportsCommands || state.lastPlayerEventAt) {
      stopFallbackProgress();
      return;
    }
    if (document.visibilityState === "hidden") return;
    const elapsedSeconds = Math.floor((Date.now() - state.serverProgressStartedAt) / 1000);
    const loadedLongEnough = state.playerLoadedAt && Date.now() - state.playerLoadedAt > 30000;
    if (elapsedSeconds < 35 || !loadedLongEnough) return;
    const timestamp = Math.max(0, state.serverProgressBaseTimestamp + elapsedSeconds);
    const duration = Number(existing?.duration || 0);
    const progress = duration > 0
      ? Math.max(Number(existing?.progress || 0), Math.min(95, (timestamp / duration) * 100))
      : Math.max(Number(existing?.progress || 0), Math.min(95, Math.round(timestamp / 60)));
    state.progress[key] = {
      mediaType: state.mediaType,
      id: state.id,
      season: state.season,
      episode: state.episode,
      timestamp,
      duration: Number(existing?.duration || 0),
      progress,
      updatedAt: Date.now(),
      title: state.item?.title || titleById(state.id, state.mediaType) || `Title ${state.id}`,
      poster: state.item?.poster || posterById(state.id, state.mediaType) || ""
    };
    localStorage.setItem(getProgressKey(state.session), JSON.stringify(state.progress));
    if (el.sideProgress) {
      el.sideProgress.textContent = `Resume: ${formatSeconds(timestamp)} (${Math.round(progress)}%)`;
    }
    queueAutoSync();
  }, 5000);
}

function stopFallbackProgress(options = {}) {
  if (options.persist) {
    persistFallbackProgressSnapshot();
  }
  if (state.serverProgressTimer) {
    window.clearInterval(state.serverProgressTimer);
    state.serverProgressTimer = null;
  }
  state.serverProgressStartedAt = 0;
  state.serverProgressBaseTimestamp = 0;
}

function persistFallbackProgressSnapshot() {
  if (!state.serverProgressTimer || !state.serverProgressStartedAt) return;
  if (state.playerSupportsCommands || state.lastPlayerEventAt) return;

  const elapsedSeconds = Math.floor((Date.now() - state.serverProgressStartedAt) / 1000);
  if (elapsedSeconds < 1) return;

  const key = `${state.mediaType}:${state.id}:${state.season}:${state.episode}`;
  const existing = state.progress[key] || null;
  const timestamp = Math.max(0, Number(state.serverProgressBaseTimestamp || 0) + elapsedSeconds);
  const duration = Number(existing?.duration || 0);
  const progress = duration > 0
    ? Math.max(Number(existing?.progress || 0), Math.min(95, (timestamp / duration) * 100))
    : Math.max(Number(existing?.progress || 0), Math.min(95, Math.round(timestamp / 60)));

  state.progress[key] = {
    mediaType: state.mediaType,
    id: state.id,
    season: state.season,
    episode: state.episode,
    timestamp,
    duration,
    progress,
    updatedAt: Date.now(),
    title: state.item?.title || titleById(state.id, state.mediaType) || `Title ${state.id}`,
    poster: state.item?.poster || posterById(state.id, state.mediaType) || ""
  };

  localStorage.setItem(getProgressKey(state.session), JSON.stringify(state.progress));
  queueAutoSync();
}

function updateWatchLocation() {
  if (!state.id || state.mediaType !== "tv") return;
  const url = new URL(window.location.href);
  url.searchParams.set("id", String(state.id));
  url.searchParams.set("type", "tv");
  url.searchParams.set("s", String(state.season || 1));
  url.searchParams.set("e", String(state.episode || 1));
  window.history.replaceState({}, document.title, url.toString());
}

function normalizeServerId(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "vidrock") return "vidrock";
  if (normalized === "videasy") return "videasy";
  if (normalized === "vidsrc") return "vidrock";
  return "vidking";
}

function normalizeServerOrder(value) {
  const seen = new Set();
  const order = Array.isArray(value)
    ? value.map((entry) => normalizeServerId(entry)).filter((entry) => defaultServerOrder.includes(entry))
    : [];
  return [...order, ...defaultServerOrder].filter((entry) => {
    if (seen.has(entry)) return false;
    seen.add(entry);
    return true;
  }).slice(0, defaultServerOrder.length);
}

function applyPlayerServerOrder() {
  const toggle = document.querySelector(".player-server-toggle");
  if (!toggle) return;
  const order = normalizeServerOrder(state.settings?.serverOrder);
  order.forEach((serverId) => {
    const button = toggle.querySelector(`[data-server="${serverId}"]`);
    if (button) toggle.appendChild(button);
  });
}

function setPlayerServer(serverId) {
  const normalized = normalizeServerId(serverId);
  if (state.playerServer === normalized) return;
  state.playerServer = normalized;
  if (normalized === "videasy") {
    persistCurrentPlaybackForServerSwitch();
    state.resumeMode = true;
    state.resumeAttempted = false;
    state.resumeConfirmed = false;
    state.serverSwitchInProgress = true;
  } else {
    state.resumeMode = false;
    state.resumeAttempted = true;
    state.resumeConfirmed = false;
    state.serverSwitchInProgress = false;
  }
  state.settings.preferredServer = normalized;
  localStorage.setItem(settingsKey, JSON.stringify(state.settings));
  updatePlayerServerToggle();
  loadPlayer();
}

function persistCurrentPlaybackForServerSwitch() {
  const key = `${state.mediaType}:${state.id}:${state.season}:${state.episode}`;
  const existing = state.progress[key] || null;
  const currentTimestamp = Math.max(
    normalizePlaybackTimestamp(existing?.timestamp, existing?.duration),
    normalizePlaybackTimestamp(state.lastPlaybackTime, existing?.duration),
    getFallbackPlaybackTimestamp()
  );
  state.resumeTarget = currentTimestamp > 2 ? Math.floor(currentTimestamp) : 0;
  if (currentTimestamp <= 2) {
    state.progress[key] = {
      mediaType: state.mediaType,
      id: state.id,
      season: state.season,
      episode: state.episode,
      timestamp: 0,
      duration: Number(existing?.duration || 0),
      progress: 0,
      updatedAt: Date.now(),
      title: state.item?.title || titleById(state.id, state.mediaType) || `Title ${state.id}`,
      poster: state.item?.poster || posterById(state.id, state.mediaType) || ""
    };
    localStorage.setItem(getProgressKey(state.session), JSON.stringify(state.progress));
    queueAutoSync(true);
    return;
  }

  state.progress[key] = {
    mediaType: state.mediaType,
    id: state.id,
    season: state.season,
    episode: state.episode,
    timestamp: Math.floor(currentTimestamp),
    duration: Number(existing?.duration || 0),
    progress: Number(existing?.progress || 0),
    updatedAt: Date.now(),
    title: state.item?.title || titleById(state.id, state.mediaType) || `Title ${state.id}`,
    poster: state.item?.poster || posterById(state.id, state.mediaType) || ""
  };
  localStorage.setItem(getProgressKey(state.session), JSON.stringify(state.progress));
  queueAutoSync(true);
}

function getFallbackPlaybackTimestamp() {
  if (!state.serverProgressStartedAt) return 0;
  const elapsedSeconds = Math.floor((Date.now() - state.serverProgressStartedAt) / 1000);
  return Number(state.serverProgressBaseTimestamp || 0) + Math.max(0, elapsedSeconds);
}

function updatePlayerServerToggle() {
  const normalized = normalizeServerId(state.playerServer);
  const toggle = document.querySelector(".player-server-toggle");
  const buttons = toggle ? [...toggle.querySelectorAll("[data-server]")] : [];
  const serverLabels = {
    videasy: "Videasy",
    vidrock: "Vidrock",
    vidking: "Vidking"
  };
  buttons.forEach((button, index) => {
    const serverId = normalizeServerId(button.dataset.server);
    button.classList.toggle("active", normalized === serverId);
    button.title = serverLabels[serverId] || serverId;
    const label = button.querySelector("span:last-child");
    if (label) label.textContent = `Server ${index + 1}`;
  });
}

function buildPlayerUrl(serverId) {
  const normalized = normalizeServerId(serverId);
  if (normalized === "vidrock") {
    const base = state.mediaType === "movie"
      ? `${VIDROCK_BASE}/movie/${state.id}`
      : `${VIDROCK_BASE}/tv/${state.id}/${state.season}/${state.episode}`;
    const url = new URL(base);
    url.searchParams.set("autoplay", state.settings.autoPlay || state.resumeMode ? "true" : "false");
    if (state.mediaType === "tv") {
      url.searchParams.set("autonext", state.settings.nextEpisode ? "true" : "false");
    }
    if (state.resumeTarget > 0) {
      url.searchParams.set("progress", String(Math.floor(state.resumeTarget)));
    }
    return url;
  }

  if (normalized === "videasy") {
    const base = state.mediaType === "movie"
      ? `${VIDEASY_BASE}/movie/${state.id}`
      : `${VIDEASY_BASE}/tv/${state.id}/${state.season}/${state.episode}`;
    const url = new URL(base);
    if (state.mediaType === "tv") {
      url.searchParams.set("autoplayNextEpisode", state.settings.nextEpisode ? "true" : "false");
      url.searchParams.set("episodeSelector", "true");
    }
    if (state.resumeTarget > 0) {
      url.searchParams.set("progress", String(Math.floor(state.resumeTarget)));
    }
    return url;
  }

  const baseUrl = state.mediaType === "movie"
    ? `${PLAYER_BASE}/movie/${state.id}`
    : `${PLAYER_BASE}/tv/${state.id}/${state.season}/${state.episode}`;
  const url = new URL(baseUrl);
  if (state.settings.autoPlay || state.resumeMode) {
    url.searchParams.set("autoPlay", "true");
  }
  if (state.resumeTarget > 0) {
    url.searchParams.set("progress", String(Math.floor(state.resumeTarget)));
  }
  if (state.serverSwitchInProgress) {
    url.searchParams.set("_t", String(Date.now()));
  }
  if (state.mediaType === "tv") {
    if (state.settings.nextEpisode) {
      url.searchParams.set("nextEpisode", "true");
    }
    url.searchParams.set("episodeSelector", "true");
  }
  return url;
}

function ensureProgressEntry() {
  if (!state.item) return;
  const key = `${state.mediaType}:${state.id}:${state.season}:${state.episode}`;
  const existing = state.progress[key];
  if (!existing) return;
  if (Number(existing.progress || 0) > 0 || Number(existing.timestamp || 0) > 0) return;

  state.progress[key] = {
    mediaType: state.mediaType,
    id: state.id,
    season: state.season,
    episode: state.episode,
    timestamp: Number(existing?.timestamp || 0),
    duration: Number(existing?.duration || 0),
    progress: Number(existing?.progress || 0),
    updatedAt: Date.now(),
    title: state.item?.title || titleById(state.id, state.mediaType) || `Title ${state.id}`,
    poster: state.item?.poster || posterById(state.id, state.mediaType) || ""
  };

  localStorage.setItem(getProgressKey(state.session), JSON.stringify(state.progress));
}

async function initAuth() {
  try {
    const session = await ensureSession();
    state.session = session;
    syncProgressState();
    state.bookmarks = readJson(getBookmarksKey(session), {});
    if (state.session?.user) {
      state.bookmarks = await syncBookmarksWithCloud(state.session, state.bookmarks);
      localStorage.setItem(getBookmarksKey(state.session), JSON.stringify(state.bookmarks));
    }
    syncBookmarkButton();
    renderWatchAccountUI();
    if (state.session?.user) queueAutoSync(true);
  } catch {
    // ignore auth errors on watch page
  }
}

function renderWatchAccountUI() {
  if (!el.watchAccountBtn) return;

  if (state.session?.user) {
    const avatarId = normalizeAvatarId(state.session.user.user_metadata?.avatarId || "none");
    if (el.watchAccountAvatar) {
      el.watchAccountAvatar.removeAttribute("hidden");
      setAccountAvatarImage(el.watchAccountAvatar, avatarId);
      el.watchAccountAvatar.alt = "Selected avatar";
    }
    if (el.watchAccountLabel) el.watchAccountLabel.textContent = state.session.user.user_metadata?.username || "Account";
    el.watchAccountBtn.classList.add("active");
    if (el.watchListsLink) el.watchListsLink.removeAttribute("hidden");
  } else {
    if (el.watchAccountAvatar) {
      el.watchAccountAvatar.setAttribute("hidden", "");
      el.watchAccountAvatar.removeAttribute("src");
      el.watchAccountAvatar.alt = "";
    }
    if (el.watchAccountLabel) el.watchAccountLabel.textContent = "Login";
    el.watchAccountBtn.classList.remove("active");
    closeWatchAccountMenu();
    if (el.watchListsLink) el.watchListsLink.setAttribute("hidden", "");
  }
}

function ensureWatchReportMenuItem() {
  if (!el.watchAccountMenu || el.watchAccountMenu.querySelector("[data-open-report]")) return;
  const button = document.createElement("button");
  button.className = "account-menu-item";
  button.type = "button";
  button.dataset.openReport = "true";
  button.innerHTML = `
    <span class="menu-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M8 6l-2-2"/><path d="M16 6l2-2"/><path d="M9 9h6"/><path d="M8 13h8"/><path d="M9 17h6"/><rect x="7" y="6" width="10" height="14" rx="5"/><path d="M3 13h4"/><path d="M17 13h4"/></svg>
    </span>
    <span>Report</span>
  `;
  el.watchAccountMenu.insertBefore(button, el.watchSignOutBtn || null);
  button.addEventListener("click", () => {
    closeWatchAccountMenu();
    openReportDialog();
  });
}

function setAccountAvatarImage(image, avatarId) {
  image.referrerPolicy = "no-referrer";
  image.onerror = () => {
    image.onerror = null;
    image.src = avatarDataUri({ id: avatarId, label: "Selected avatar" });
  };
  image.src = avatarSrcById(avatarId);
}


function toggleWatchAccountMenu() {
  if (!el.watchAccountMenu) return;
  const hidden = el.watchAccountMenu.hasAttribute("hidden");
  if (hidden) {
    el.watchAccountMenu.removeAttribute("hidden");
    el.watchAccountBtn?.setAttribute("aria-expanded", "true");
    updateMenuScrimVisibility();
  } else {
    closeWatchAccountMenu();
  }
}

function closeWatchAccountMenu() {
  if (!el.watchAccountMenu) return;
  el.watchAccountMenu.setAttribute("hidden", "");
  el.watchAccountBtn?.setAttribute("aria-expanded", "false");
  updateMenuScrimVisibility();
}

function getMenuScrim() {
  let scrim = document.getElementById("menuScrim");
  if (!scrim) {
    scrim = document.createElement("div");
    scrim.id = "menuScrim";
    scrim.className = "menu-scrim";
    scrim.setAttribute("hidden", "");
    document.body.appendChild(scrim);
  }
  if (scrim.dataset.scrimReady !== "1") {
    scrim.dataset.scrimReady = "1";
    scrim.addEventListener("click", () => {
      closeWatchAccountMenu();
      if (el.bookmarkMenu) {
        el.bookmarkMenu.setAttribute("hidden", "");
      }
      if (el.bookmarkTrigger) {
        el.bookmarkTrigger.classList.remove("active");
        el.bookmarkTrigger.setAttribute("aria-expanded", "false");
      }
    });
  }
  return scrim;
}

function updateMenuScrimVisibility() {
  const scrim = getMenuScrim();
  const menusOpen = [el.watchAccountMenu, el.bookmarkMenu]
    .some((menu) => menu && !menu.hasAttribute("hidden"));
  const shouldShowScrim = menusOpen && window.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
  scrim.toggleAttribute("hidden", !shouldShowScrim);
}

async function syncProgressToCloud() {
  if (!state.session?.user) return;
  const session = await ensureSession();
  if (!session) return;

  const rows = dedupeProgressRows(Object.values(state.progress))
    .filter((entry) => shouldSyncProgressEntry(entry))
    .slice(-240)
    .map((entry) => ({
    user_id: state.session.user.id,
    media_type: entry.mediaType,
    content_id: entry.id,
    season_number: entry.season || 1,
    episode_number: entry.episode || 1,
    timestamp_seconds: Math.floor(Number(entry.timestamp || 0)),
    duration_seconds: Math.floor(Number(entry.duration || 0)),
    progress_percent: Number(entry.progress || 0),
    updated_at: new Date(Number(entry.updatedAt || Date.now())).toISOString()
  }));

  if (!rows.length) {
    return;
  }

  try {
    for (let index = 0; index < rows.length; index += 15) {
      await apiRequest("/progress/push", {
        method: "POST",
        headers: authHeaders(session),
        body: { rows: rows.slice(index, index + 15) }
      });
    }
  } catch (error) {
    // Don't surface technical sync errors to the user; log for debugging instead.
    console.warn("Sync failed:", error);
    return;
  }

  state.lastSyncAt = Date.now();
}

function shouldSyncProgressEntry(entry) {
  const progress = Number(entry?.progress || 0);
  const timestamp = Number(entry?.timestamp || 0);
  return progress >= 98 || timestamp > 8 || progress > 1;
}

function dedupeProgressRows(entries) {
  const map = new Map();
  (entries || []).forEach((entry) => {
    const mediaType = entry?.mediaType === "tv" ? "tv" : "movie";
    const id = Number(entry?.id || 0);
    if (!id) return;
    const season = mediaType === "tv" ? Number(entry?.season || 1) : 1;
    const episode = mediaType === "tv" ? Number(entry?.episode || 1) : 1;
    const key = `${mediaType}:${id}:${season}:${episode}`;
    const previous = map.get(key);
    if (!previous || Number(entry?.updatedAt || 0) >= Number(previous?.updatedAt || 0)) {
      map.set(key, {
        ...entry,
        mediaType,
        id,
        season,
        episode
      });
    }
  });
  return [...map.values()].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
}

function queueAutoSync(immediate = false) {
  if (!state.session?.user) return;

  const minGapMs = 5000;
  const elapsed = Date.now() - state.lastSyncAt;
  const delay = immediate ? 0 : Math.max(1500, minGapMs - elapsed);

  if (state.autoSyncTimer) {
    clearTimeout(state.autoSyncTimer);
  }

  state.autoSyncTimer = window.setTimeout(() => {
    state.autoSyncTimer = null;
    syncProgressToCloud();
  }, delay);
}

function renderStars(score) {
  const normalized = Math.max(0, Math.min(10, Number(score) || 0));
  const full = Math.round(normalized / 2);
  el.ratingStars.textContent = `${"★".repeat(full)}${"☆".repeat(5 - full)}`;
}

function labelForStatus(status) {
  if (status === "watching") return "Watching";
  if (status === "watched") return "Watched";
  if (status === "plan") return "Plan to Watch";
  if (status === "dropped") return "Dropped";
  return "Watching";
}

function setStatus(message) {
  el.watchStatus.textContent = message;
  const lowered = String(message || "").toLowerCase();
  if (lowered.includes("saved") || lowered.includes("removed") || lowered.includes("submitted") || lowered.includes("updated")) {
    showToast(message, "success");
  } else if (lowered.includes("could not") || lowered.includes("missing") || lowered.includes("unavailable")) {
    showToast(message, "error");
  }
}
