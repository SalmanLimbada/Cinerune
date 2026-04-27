import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import {
  initTmdb,
  fetchItemDetailsById,
  fetchRelatedById,
  episodeCount,
  seasonCount,
  titleById,
  posterById
} from "./catalog.js?v=20260423b";

const PLAYER_BASE = "https://www.vidking.net/embed";
const settingsKey = "cinerune:settings";
const progressKey = "cinerune:progress";
const bookmarksBaseKey = "cinerune:bookmarks";
const reportsKey = "cinerune:reports";

function getBookmarksKey(session) {
  const userId = session?.user?.id ? String(session.user.id) : "";
  return userId ? `${bookmarksBaseKey}:user:${userId}` : `${bookmarksBaseKey}:guest`;
}

const el = {
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
  episodeSelect: document.getElementById("episodeSelect"),
  prevEpisodeBtn: document.getElementById("prevEpisodeBtn"),
  nextEpisodeBtn: document.getElementById("nextEpisodeBtn"),
  playSelectedBtn: document.getElementById("playSelectedBtn"),
  autoplayInput: document.getElementById("autoplayInput"),
  nextEpisodeInput: document.getElementById("nextEpisodeInput"),
  autoNextSmartInput: document.getElementById("autoNextSmartInput"),
  server1Btn: document.getElementById("server1Btn"),
  server2Btn: document.getElementById("server2Btn"),
  relatedRail: document.getElementById("relatedRail"),
  relatedPrevBtn: document.getElementById("relatedPrevBtn"),
  relatedNextBtn: document.getElementById("relatedNextBtn"),
  bookmarkTrigger: document.getElementById("bookmarkTrigger"),
  bookmarkCurrent: document.getElementById("bookmarkCurrent"),
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
  server: Number(query.get("server")) === 2 ? 2 : 1,
  settings: readJson(settingsKey, {
    autoPlay: false,
    nextEpisode: true,
    autoNextSmart: true
  }),
  progress: readJson(progressKey, {}),
  bookmarks: readJson(getBookmarksKey(null), {}),
  reports: readJson(reportsKey, []),
  supabase: null,
  session: null,
  item: null,
  autoSyncTimer: null,
  lastSyncAt: 0
};

boot();

async function boot() {
  initTmdb({
    apiKey: String(window.CINERUNE_CONFIG?.tmdbApiKey || "").trim(),
    readAccessToken: String(window.CINERUNE_CONFIG?.tmdbReadAccessToken || "").trim(),
    language: String(window.CINERUNE_CONFIG?.tmdbLanguage || "en-US").trim()
  });

  bindEvents();
  hydrateSettingsUI();
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
  el.autoplayInput.addEventListener("change", saveSettings);
  el.autoNextSmartInput.addEventListener("change", saveSettings);

  el.prevEpisodeBtn.addEventListener("click", playPrevEpisode);
  el.nextEpisodeBtn.addEventListener("click", playNextEpisode);
  el.playSelectedBtn.addEventListener("click", playSelectedEpisode);

  el.seasonSelect.addEventListener("change", async () => {
    state.season = Number(el.seasonSelect.value) || 1;
    await refillEpisodeSelect();
  });

  el.server1Btn.addEventListener("click", () => switchServer(1));
  el.server2Btn.addEventListener("click", () => switchServer(2));

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

function hydrateSettingsUI() {
  el.autoplayInput.checked = Boolean(state.settings.autoPlay);
  el.nextEpisodeInput.checked = Boolean(state.settings.nextEpisode);
  el.autoNextSmartInput.checked = Boolean(state.settings.autoNextSmart);
  el.server1Btn.classList.toggle("active", state.server === 1);
  el.server2Btn.classList.toggle("active", state.server === 2);
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

  el.sidePoster.src = item.poster;
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

  await refillEpisodeSelect();
}

async function refillEpisodeSelect() {
  el.episodeSelect.innerHTML = "";
  const totalEpisodes = await episodeCount(state.id, state.season);

  for (let episode = 1; episode <= totalEpisodes; episode += 1) {
    const option = document.createElement("option");
    option.value = String(episode);
    option.textContent = `Episode ${episode}`;
    option.selected = episode === state.episode;
    el.episodeSelect.appendChild(option);
  }

  el.episodeCountText.textContent = `Season ${state.season} has ${totalEpisodes} episodes.`;
}

function playSelectedEpisode() {
  state.season = Number(el.seasonSelect.value) || 1;
  state.episode = Number(el.episodeSelect.value) || 1;
  loadPlayer();
}

async function playPrevEpisode() {
  if (state.mediaType !== "tv") return;
  if (state.episode > 1) {
    state.episode -= 1;
  } else if (state.season > 1) {
    state.season -= 1;
    state.episode = await episodeCount(state.id, state.season);
  }
  await hydrateEpisodeControls();
  loadPlayer();
}

async function playNextEpisode() {
  if (state.mediaType !== "tv") return;
  const totalEpisodes = await episodeCount(state.id, state.season);
  const totalSeasons = Math.max(1, Number(seasonCount(state.id) || state.item.totalSeasons || 1));

  if (state.episode < totalEpisodes) {
    state.episode += 1;
  } else if (state.season < totalSeasons) {
    state.season += 1;
    state.episode = 1;
  }

  await hydrateEpisodeControls();
  loadPlayer();
}

function loadPlayer() {
  const baseUrl = state.mediaType === "movie"
    ? `${PLAYER_BASE}/movie/${state.id}`
    : `${PLAYER_BASE}/tv/${state.id}/${state.season}/${state.episode}`;

  const url = new URL(baseUrl);
  if (state.settings.autoPlay) url.searchParams.set("autoPlay", "true");
  if (state.mediaType === "tv") url.searchParams.set("nextEpisode", "true");
  url.searchParams.set("server", String(state.server));

  const resume = getSavedProgress();
  if (resume?.timestamp > 0) {
    url.searchParams.set("progress", String(Math.floor(Number(resume.timestamp))));
  }

  el.playerFrame.src = url.toString();

  if (state.mediaType === "tv") {
    setStatus(`Season ${state.season}, Episode ${state.episode} loaded.`);
  } else {
    setStatus("Player loaded.");
  }
}

function switchServer(serverNumber) {
  state.server = serverNumber === 2 ? 2 : 1;
  el.server1Btn.classList.toggle("active", state.server === 1);
  el.server2Btn.classList.toggle("active", state.server === 2);
  loadPlayer();
}

function saveSettings() {
  state.settings = {
    autoPlay: el.autoplayInput.checked,
    nextEpisode: true,
    autoNextSmart: el.autoNextSmartInput.checked
  };
  localStorage.setItem(settingsKey, JSON.stringify(state.settings));
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
    image.src = item.poster;
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
}

function saveBookmark(status) {
  if (!state.item) return;
  const normalizedStatus = ["watching", "watched", "plan", "dropped"].includes(status) ? status : "watching";
  const key = `${state.mediaType}:${state.id}`;

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
  setStatus(`Saved to ${labelForStatus(normalizedStatus)}.`);
}

function submitReport() {
  const message = String(el.reportMessage.value || "").trim();
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

function getSavedProgress() {
  const key = `${state.mediaType}:${state.id}:${state.season}:${state.episode}`;
  return state.progress[key] || null;
}

function syncBookmarkButton() {
  if (!el.bookmarkTrigger || !el.bookmarkMenu || !state.item) return;

  const current = state.bookmarks[`${state.mediaType}:${state.id}`] || null;
  if (el.bookmarkCurrent) {
    el.bookmarkCurrent.textContent = current?.status ? `Saved as ${labelForStatus(current.status)}` : "Not saved";
  }
  el.bookmarkTrigger.textContent = "Bookmark";
  el.bookmarkTrigger.classList.toggle("active", Boolean(current) || !el.bookmarkMenu.hasAttribute("hidden"));
  el.bookmarkTrigger.setAttribute("aria-expanded", el.bookmarkMenu.hasAttribute("hidden") ? "false" : "true");

  [...el.bookmarkMenu.querySelectorAll(".bookmark-option")].forEach((node) => {
    node.classList.toggle("active", node.dataset.status === current?.status);
  });
}

function onPlayerMessage(event) {
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

  localStorage.setItem(progressKey, JSON.stringify(state.progress));
  queueAutoSync(data.event === "ended");

  if (data.event === "ended" && mediaType === "tv" && state.settings.autoNextSmart) {
    playNextEpisode();
  }
}

async function initAuth() {
  const config = window.CINERUNE_CONFIG || {};
  const supabaseUrl = String(config.supabaseUrl || "").trim();
  const supabasePublishableKey = String(config.supabasePublishableKey || config.supabaseAnonKey || "").trim();

  if (!supabaseUrl || !supabasePublishableKey) return;

  try {
    state.supabase = createClient(supabaseUrl, supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    });

    const { data } = await state.supabase.auth.getSession();
    state.session = data?.session || null;
    if (state.session?.user) queueAutoSync(true);

    state.supabase.auth.onAuthStateChange((_event, session) => {
      state.session = session;
      state.bookmarks = readJson(getBookmarksKey(session), {});
      syncBookmarkButton();
      if (session?.user) queueAutoSync(true);
    });
  } catch {
    // ignore auth errors on watch page
  }
}

async function syncProgressToCloud() {
  if (!state.session?.user || !state.supabase) {
    return;
  }

  const rows = Object.values(state.progress).slice(-200).map((entry) => ({
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

  const { error } = await state.supabase
    .from("watch_progress")
    .upsert(rows, { onConflict: "user_id,media_type,content_id,season_number,episode_number" });

  if (error) {
    setStatus(`Sync failed: ${error.message}`);
    return;
  }

  state.lastSyncAt = Date.now();
}

function queueAutoSync(immediate = false) {
  if (!state.session?.user || !state.supabase) return;

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

function formatSeconds(value) {
  const total = Math.max(0, Math.floor(Number(value || 0)));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
