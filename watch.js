import { apiRequest, authHeaders, clearStoredSession, ensureSession } from "./auth-client.js";
import { avatarDataUri, avatarSrcById, normalizeAvatarId } from "./shared-ui.js?v=20260502-notifications1";
import { initHeaderNotifications } from "./notifications.js?v=20260502-notifications1";
import { initDragScroll } from "./drag-scroll.js?v=20260502-ui1";
import {
  initTmdb,
  fetchItemDetailsById,
  fetchRelatedById,
  episodeCount,
  fetchSeasonEpisodes,
  seasonCount,
  titleById,
  posterById
} from "./catalog.js?v=20260501-fix1";

const PLAYER_BASE = "https://www.vidking.net/embed";
const settingsKey = "cinerune:settings";
const legacyProgressKey = "cinerune:progress";
const progressBaseKey = "cinerune:progress";
const bookmarksBaseKey = "cinerune:bookmarks";
const reportsKey = "cinerune:reports";
const REPORT_LIMIT = 500;

function getBookmarksKey(session) {
  const userId = session?.user?.id ? String(session.user.id) : "";
  return userId ? `${bookmarksBaseKey}:user:${userId}` : `${bookmarksBaseKey}:guest`;
}

function getProgressKey(session) {
  const userId = session?.user?.id ? String(session.user.id) : "";
  return userId ? `${progressBaseKey}:user:${userId}` : `${progressBaseKey}:guest`;
}

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
  cancelReport: document.getElementById("cancelReport")
};

const query = new URLSearchParams(window.location.search);

const state = {
  mediaType: query.get("type") === "tv" ? "tv" : "movie",
  id: Number(query.get("id")) || 0,
  season: Number(query.get("s")) || 1,
  episode: Number(query.get("e")) || 1,
  resumeMode: query.get("resume") === "1",
  resumeAttempted: false,
  resumeTarget: 0,
  resumeSeekTimer: null,
  resumeFallbackTimer: null,
  resumeSeekAttempts: 0,
  resumeConfirmed: false,
  lastPlayerEventAt: 0,
  lastPlaybackTime: 0,
  settings: readJson(settingsKey, {
    autoPlay: false,
    nextEpisode: true,
    autoNextSmart: true
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
  initTmdb({
    apiBase: String(window.CINERUNE_CONFIG?.apiBase || "").trim(),
    fallbackApiBase: String(window.CINERUNE_CONFIG?.fallbackApiBase || "").trim(),
    language: String(window.CINERUNE_CONFIG?.tmdbLanguage || "en-US").trim()
  });


  bindEvents();
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
  await renderRelated();
  loadPlayer();
}

function bindEvents() {
  el.prevEpisodeBtn.addEventListener("click", playPrevEpisode);
  el.nextEpisodeBtn.addEventListener("click", playNextEpisode);

  el.seasonSelect.addEventListener("change", async () => {
    state.season = Number(el.seasonSelect.value) || 1;
    state.episode = 1;
    await refillEpisodeGrid();
    loadPlayer();
  });

  if (el.watchAccountBtn) {
    el.watchAccountBtn.addEventListener("click", () => {
      if (state.session?.user) {
        toggleWatchAccountMenu();
      } else {
          window.location.href = "./index.html?auth=login";
      }
    });
  }


  if (el.watchAccountSettings) {
    el.watchAccountSettings.addEventListener("click", () => {
      closeWatchAccountMenu();
        window.location.href = "./index.html?modal=settings";
    });
  }

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
  });

  el.reportTrigger.addEventListener("click", () => {
    el.reportMessage.value = "";
    el.reportDialog.showModal();
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
    if (document.visibilityState === "hidden") queueAutoSync(true);
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
  el.sideProgress.textContent = resume?.timestamp
    ? `Resume: ${formatSeconds(resume.timestamp)} (${Math.round(Number(resume.progress || 0))}%)`
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

async function refillEpisodeGrid() {
  if (!el.episodeGrid) return;
  const episodes = await fetchSeasonEpisodes(state.id, state.season);
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
    button.textContent = `EP${episode}: ${episodeInfo.name || `Episode ${episode}`}`;
    button.classList.toggle("active", episode === state.episode);
    button.addEventListener("click", () => playEpisode(episode));
    fragment.appendChild(button);
  });

  el.episodeGrid.appendChild(fragment);
  el.episodeCountText.textContent = totalEpisodes > 0
    ? `Season ${state.season} has ${totalEpisodes} episode${totalEpisodes === 1 ? "" : "s"}.`
    : `Season ${state.season} has no episodes yet.`;
}

function playEpisode(episode) {
  state.episode = Number(episode) || 1;
  syncEpisodeSelection();
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
  state.lastPlayerEventAt = 0;
  state.lastPlaybackTime = 0;
  state.resumeConfirmed = false;
  state.resumeSeekAttempts = 0;
  el.playerFrame.src = "";
  const baseUrl = state.mediaType === "movie"
    ? `${PLAYER_BASE}/movie/${state.id}`
    : `${PLAYER_BASE}/tv/${state.id}/${state.season}/${state.episode}`;

  const url = new URL(baseUrl);
  if (state.settings.autoPlay || state.resumeMode) {
    url.searchParams.set("autoPlay", "true");
  }

  if (state.mediaType === "tv") {
    url.searchParams.set("nextEpisode", "true");
    url.searchParams.set("episodeSelector", "true");
  }

  const resume = state.resumeMode && !state.resumeAttempted ? getSavedProgress() : null;
  let appliedResume = false;
  state.resumeTarget = 0;
  if (resume?.timestamp > 0 && Number(resume.progress || 0) < 98) {
    const duration = Number(resume.duration || 0);
    let safeTimestamp = Math.floor(Number(resume.timestamp));
    if (duration > 0) {
      safeTimestamp = Math.min(Math.max(safeTimestamp, 0), Math.max(duration - 5, 0));
    }
    const minRemaining = duration > 0 ? 30 : 0;
    if (safeTimestamp > 2 && (duration === 0 || safeTimestamp < duration - minRemaining)) {
      appliedResume = true;
      state.resumeTarget = safeTimestamp;
    }
  }

  if (state.resumeMode && !appliedResume) {
    state.resumeMode = false;
    state.resumeAttempted = true;
  }

  el.playerFrame.src = url.toString();
  scheduleResumeSeek(appliedResume);

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
  if (!state.resumeMode || !appliedResume) return;

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

    const button = document.createElement("button");
    button.className = "poster-btn";
    button.type = "button";

    const image = document.createElement("img");
    image.className = "poster-img";
    setPosterImage(image, item);
    image.alt = `${item.title} poster`;
    image.loading = "lazy";

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
    button.append(image, badge, meta);

    button.addEventListener("click", () => {
      const url = new URL("./watch.html", window.location.href);
      url.searchParams.set("id", String(item.id));
      url.searchParams.set("type", item.mediaType);
      if (item.mediaType === "tv") {
        url.searchParams.set("s", "1");
        url.searchParams.set("e", "1");
      }
      window.location.href = url.toString();
    });

    card.appendChild(button);
    fragment.appendChild(card);
  });

  el.relatedRail.innerHTML = "";
  el.relatedRail.appendChild(fragment);
  initDragScroll();
}

function setPosterImage(image, item) {
  if (!image) return;
  const fallback = buildPosterPlaceholder(item?.title);
  image.loading = "eager";
  image.decoding = "async";
  image.onerror = () => {
    image.onerror = null;
    image.src = fallback;
  };
  image.src = item?.poster || fallback;
}

function buildPosterPlaceholder(title) {
  const safeTitle = escapeHtml(String(title || "Cinerune").slice(0, 28));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="#123a5c"/><stop offset="100%" stop-color="#071528"/></linearGradient></defs><rect width="300" height="450" fill="url(#g)"/><rect x="22" y="22" width="256" height="406" rx="18" fill="rgba(255,255,255,0.045)" stroke="rgba(126,216,255,0.18)"/><text x="150" y="214" fill="#e8f1fb" font-family="Arial, sans-serif" font-size="20" font-weight="700" text-anchor="middle">${safeTitle}</text><text x="150" y="246" fill="#9fb6d0" font-family="Arial, sans-serif" font-size="12" text-anchor="middle">Poster loading unavailable</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function saveBookmark(status) {
  if (!state.item) return;
  const key = `${state.mediaType}:${state.id}`;
  const current = state.bookmarks[key] || null;

  if (status === "clear" || current?.status === status) {
    delete state.bookmarks[key];
    localStorage.setItem(getBookmarksKey(state.session), JSON.stringify(state.bookmarks));
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
    setStatus("Write a report message first.");
    return;
  }

  state.reports.unshift({
    id: state.id,
    mediaType: state.mediaType,
    title: state.item?.title || titleById(state.id, state.mediaType) || `Title ${state.id}`,
    poster: state.item?.poster || posterById(state.id, state.mediaType) || "",
    message,
    createdAt: Date.now()
  });

  localStorage.setItem(reportsKey, JSON.stringify(state.reports.slice(0, 200)));
  el.reportDialog.close("submit");
  setStatus("Report submitted. Thank you.");
}

function sanitizeText(value, maxLen) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return trimmed.slice(0, maxLen);
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

  const current = state.bookmarks[`${state.mediaType}:${state.id}`] || null;
  el.bookmarkTrigger.textContent = "Bookmark";
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

  let parsed = event.data;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return;
    }
  }

  if (parsed?.type !== "PLAYER_EVENT" || !parsed?.data) return;
  const data = parsed.data;
  if (!data.id || !data.mediaType) return;

  const mediaType = data.mediaType === "tv" ? "tv" : "movie";
  const id = Number(data.id);
  const season = Number(data.season) || state.season || 1;
  const episode = Number(data.episode) || state.episode || 1;
  const key = `${mediaType}:${id}:${season}:${episode}`;
  const isCurrentTitle = mediaType === state.mediaType && id === Number(state.id);
  state.lastPlayerEventAt = Date.now();

  if (isCurrentTitle && mediaType === "tv" && (season !== state.season || episode !== state.episode)) {
    state.season = season;
    state.episode = episode;
    await syncEpisodeSelection();
  }

  if (Number.isFinite(Number(data.currentTime))) {
    state.lastPlaybackTime = Math.max(0, Number(data.currentTime) || 0);
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
    timestamp: Number(data.currentTime) || 0,
    duration: Number(data.duration) || 0,
    progress: Number(data.progress) || 0,
    updatedAt: Date.now(),
    title: state.item?.title || titleById(id, mediaType) || `Title ${id}`,
    poster: state.item?.poster || posterById(id, mediaType) || ""
  };

  if (data.event === "ended") {
    state.progress[key].timestamp = 0;
    state.progress[key].progress = 100;
  }

  localStorage.setItem(getProgressKey(state.session), JSON.stringify(state.progress));
  queueAutoSync(data.event === "ended");

  if (data.event === "ended" && mediaType === "tv" && state.settings.autoNextSmart && isCurrentTitle) {
    if (state.lastAutoNextKey === key) return;
    state.lastAutoNextKey = key;
    window.setTimeout(() => {
      if (state.lastAutoNextKey === key) state.lastAutoNextKey = "";
    }, 8000);
    await playNextEpisode();
  }
}

async function initAuth() {
  try {
    const session = await ensureSession();
    state.session = session;
    syncProgressState();
    state.bookmarks = readJson(getBookmarksKey(session), {});
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
    const avatarId = normalizeAvatarId(state.session.user.user_metadata?.avatarId || readJson("cinerune:avatar-choice", "luffy"));
    if (el.watchAccountAvatar) {
      el.watchAccountAvatar.removeAttribute("hidden");
      setAccountAvatarImage(el.watchAccountAvatar, avatarId);
      el.watchAccountAvatar.alt = "Selected avatar";
    }
    if (el.watchAccountLabel) el.watchAccountLabel.textContent = "Account";
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
  } else {
    closeWatchAccountMenu();
  }
}

function closeWatchAccountMenu() {
  if (!el.watchAccountMenu) return;
  el.watchAccountMenu.setAttribute("hidden", "");
  el.watchAccountBtn?.setAttribute("aria-expanded", "false");
}

async function syncProgressToCloud() {
  if (!state.session?.user) return;
  const session = await ensureSession();
  if (!session) return;

  const rows = Object.values(state.progress).slice(-240).map((entry) => ({
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

function queueAutoSync(immediate = false) {
  if (!state.session?.user) return;

  const minGapMs = 15000;
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

function formatSeconds(value) {
  const total = Math.max(0, Math.floor(Number(value || 0)));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
