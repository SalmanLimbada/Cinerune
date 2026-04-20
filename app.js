import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";
const VIDKING_BASE = "https://www.vidking.net/embed";

const defaultFeatured = {
  movie: [
    { id: 872585, title: "Oppenheimer", release_date: "2023-07-19", poster_path: "/ptpr0kGAckfQkJeJIt8st5dglvd.jpg" },
    { id: 693134, title: "Dune: Part Two", release_date: "2024-02-27", poster_path: "/8b8R8l88Qje9dn9OE8PY05Nxl1X.jpg" },
    { id: 603692, title: "John Wick: Chapter 4", release_date: "2023-03-22", poster_path: "/vZloFAK7NmvMGKE7VkF5UHaz0I.jpg" }
  ],
  tv: [
    { id: 1399, name: "Game of Thrones", first_air_date: "2011-04-17", poster_path: "/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg" },
    { id: 94997, name: "House of the Dragon", first_air_date: "2022-08-21", poster_path: "/z2yahl2uefxDCl0nogcRBstwruJ.jpg" },
    { id: 1396, name: "Breaking Bad", first_air_date: "2008-01-20", poster_path: "/3xnWaLQjelJDDF7LT1WBo6f4BRe.jpg" }
  ]
};

const settingsKey = "cinerune:settings";
const progressKey = "cinerune:progress";

const el = {
  toggleSettings: document.getElementById("toggleSettings"),
  toggleAuth: document.getElementById("toggleAuth"),
  settingsPanel: document.getElementById("settingsPanel"),
  authPanel: document.getElementById("authPanel"),
  signedOutView: document.getElementById("signedOutView"),
  signedInView: document.getElementById("signedInView"),
  authEmail: document.getElementById("authEmail"),
  authPassword: document.getElementById("authPassword"),
  signInBtn: document.getElementById("signInBtn"),
  signUpBtn: document.getElementById("signUpBtn"),
  signOutBtn: document.getElementById("signOutBtn"),
  syncNowBtn: document.getElementById("syncNowBtn"),
  authUserEmail: document.getElementById("authUserEmail"),
  authHint: document.getElementById("authHint"),
  cloudState: document.getElementById("cloudState"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  colorInput: document.getElementById("colorInput"),
  autoplayInput: document.getElementById("autoplayInput"),
  nextEpisodeInput: document.getElementById("nextEpisodeInput"),
  episodeSelectorInput: document.getElementById("episodeSelectorInput"),
  autoNextSmartInput: document.getElementById("autoNextSmartInput"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),
  tabs: [...document.querySelectorAll(".tab")],
  searchInput: document.getElementById("searchInput"),
  statusLine: document.getElementById("statusLine"),
  results: document.getElementById("results"),
  cardTemplate: document.getElementById("cardTemplate"),
  playerFrame: document.getElementById("playerFrame"),
  playerTitle: document.getElementById("playerTitle"),
  playerMeta: document.getElementById("playerMeta"),
  manualId: document.getElementById("manualId"),
  manualSeason: document.getElementById("manualSeason"),
  manualEpisode: document.getElementById("manualEpisode"),
  manualPlayBtn: document.getElementById("manualPlayBtn"),
  continueWrap: document.getElementById("continueWrap"),
  continueGrid: document.getElementById("continueGrid")
};

const state = {
  mediaType: "movie",
  settings: readJson(settingsKey, {
    apiKey: "",
    color: "0dcaf0",
    autoPlay: false,
    nextEpisode: true,
    episodeSelector: true,
    autoNextSmart: true
  }),
  progress: readJson(progressKey, {}),
  searchTimer: null,
  abortController: null,
  supabase: null,
  session: null,
  cloudEnabled: false,
  currentPlayback: null,
  syncTimer: null,
  syncQueued: false
};

boot();

async function boot() {
  hydrateSettingsUI();
  bindEvents();
  await initAuth();
  renderContinueWatching();
  loadInitialContent();
  registerServiceWorker();
}

function bindEvents() {
  el.toggleSettings.addEventListener("click", () => {
    togglePanel(el.settingsPanel);
  });

  el.toggleAuth.addEventListener("click", () => {
    togglePanel(el.authPanel);
  });

  el.saveSettingsBtn.addEventListener("click", () => {
    state.settings = {
      apiKey: el.apiKeyInput.value.trim(),
      color: sanitizeColor(el.colorInput.value),
      autoPlay: el.autoplayInput.checked,
      nextEpisode: el.nextEpisodeInput.checked,
      episodeSelector: el.episodeSelectorInput.checked,
      autoNextSmart: el.autoNextSmartInput.checked
    };

    localStorage.setItem(settingsKey, JSON.stringify(state.settings));
    el.colorInput.value = state.settings.color;
    setStatus("Settings saved. Reloading content...");
    loadInitialContent();
  });

  el.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      if (state.mediaType === tab.dataset.type) return;
      setMediaType(tab.dataset.type);
      loadInitialContent();
    });
  });

  el.searchInput.addEventListener("input", () => {
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => {
      const query = el.searchInput.value.trim();
      if (!query) {
        loadInitialContent();
        return;
      }
      searchContent(query);
    }, 250);
  });

  el.manualPlayBtn.addEventListener("click", () => {
    const id = Number(el.manualId.value);
    const season = Number(el.manualSeason.value) || 1;
    const episode = Number(el.manualEpisode.value) || 1;
    if (!id) {
      setStatus("Enter a valid TMDB ID first.");
      return;
    }

    const item = state.mediaType === "movie"
      ? { id, title: `Movie #${id}` }
      : { id, name: `TV Show #${id}`, season, episode };
    playItem(item, { season, episode, mediaType: state.mediaType });
  });

  el.signInBtn.addEventListener("click", signIn);
  el.signUpBtn.addEventListener("click", signUp);
  el.signOutBtn.addEventListener("click", signOut);
  el.syncNowBtn.addEventListener("click", syncProgressToCloud);

  window.addEventListener("message", onPlayerMessage);
}

function togglePanel(panel) {
  const isHidden = panel.hasAttribute("hidden");
  if (isHidden) {
    panel.removeAttribute("hidden");
  } else {
    panel.setAttribute("hidden", "");
  }
}

async function initAuth() {
  const config = window.CINERUNE_CONFIG || {};
  const supabaseUrl = String(config.supabaseUrl || "").trim();
  const supabasePublishableKey = String(
    config.supabasePublishableKey || config.supabaseAnonKey || ""
  ).trim();

  if (!supabaseUrl || !supabasePublishableKey) {
    el.authHint.textContent = "Set Supabase values in config.js to enable account sync.";
    updateCloudState("Cloud sync: off (missing config)");
    return;
  }

  try {
    state.supabase = createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    });

    const { data, error } = await state.supabase.auth.getSession();
    if (error) {
      console.warn("Auth session fetch failed", error.message);
    }
    state.session = data?.session || null;
    state.cloudEnabled = true;

    state.supabase.auth.onAuthStateChange((_event, session) => {
      state.session = session;
      renderAuthUI();
      if (session?.user) {
        pullCloudProgress();
      }
    });

    renderAuthUI();
    updateCloudState(state.session?.user ? "Cloud sync: connected" : "Cloud sync: configured (login required)");

    if (state.session?.user) {
      await pullCloudProgress();
    }
  } catch (error) {
    console.error("Supabase init failed", error);
    updateCloudState("Cloud sync: error");
  }
}

function renderAuthUI() {
  const user = state.session?.user;
  const signedIn = Boolean(user);

  el.signedOutView.toggleAttribute("hidden", signedIn);
  el.signedInView.toggleAttribute("hidden", !signedIn);
  el.toggleAuth.textContent = signedIn ? "Account" : "Login";

  if (signedIn) {
    el.authUserEmail.textContent = user.email || user.id;
    updateCloudState("Cloud sync: connected");
  } else {
    updateCloudState(state.cloudEnabled ? "Cloud sync: configured (login required)" : "Cloud sync: off");
  }
}

async function signIn() {
  if (!state.supabase) {
    setStatus("Cloud auth is not configured in config.js.");
    return;
  }

  const email = el.authEmail.value.trim();
  const password = el.authPassword.value;
  if (!email || !password) {
    setStatus("Enter email and password.");
    return;
  }

  const { error } = await state.supabase.auth.signInWithPassword({ email, password });
  if (error) {
    setStatus(`Sign in failed: ${error.message}`);
    return;
  }

  setStatus("Signed in. Syncing cloud progress...");
  await pullCloudProgress();
}

async function signUp() {
  if (!state.supabase) {
    setStatus("Cloud auth is not configured in config.js.");
    return;
  }

  const email = el.authEmail.value.trim();
  const password = el.authPassword.value;
  if (!email || !password) {
    setStatus("Enter email and password.");
    return;
  }

  const { error } = await state.supabase.auth.signUp({ email, password });
  if (error) {
    setStatus(`Sign up failed: ${error.message}`);
    return;
  }

  setStatus("Account created. Check your email if confirmation is enabled.");
}

async function signOut() {
  if (!state.supabase) return;
  const { error } = await state.supabase.auth.signOut();
  if (error) {
    setStatus(`Sign out failed: ${error.message}`);
    return;
  }
  setStatus("Signed out.");
}

async function loadInitialContent() {
  const query = el.searchInput.value.trim();
  if (query) {
    searchContent(query);
    return;
  }

  if (!state.settings.apiKey) {
    setStatus("TMDB API key not set. Showing starter picks and manual launch.");
    renderCards(defaultFeatured[state.mediaType], state.mediaType);
    return;
  }

  setStatus("Loading trending titles...");
  const endpoint = state.mediaType === "movie" ? "/movie/popular" : "/tv/popular";
  const data = await fetchTmdb(endpoint, { page: "1" });
  if (!data?.results) {
    setStatus("Could not fetch TMDB right now. Showing starter picks.");
    renderCards(defaultFeatured[state.mediaType], state.mediaType);
    return;
  }

  renderCards(data.results, state.mediaType);
  setStatus(`Loaded ${data.results.length} titles.`);
}

async function searchContent(query) {
  if (!state.settings.apiKey) {
    const list = defaultFeatured[state.mediaType].filter((entry) => {
      const title = (entry.title || entry.name || "").toLowerCase();
      return title.includes(query.toLowerCase());
    });
    renderCards(list, state.mediaType);
    setStatus(`Offline mode: ${list.length} result(s) from starter picks.`);
    return;
  }

  setStatus(`Searching for "${query}"...`);
  const endpoint = state.mediaType === "movie" ? "/search/movie" : "/search/tv";
  const data = await fetchTmdb(endpoint, { query, page: "1", include_adult: "false" });

  if (!data?.results) {
    setStatus("Search failed. Check key/network and try again.");
    return;
  }

  renderCards(data.results, state.mediaType);
  setStatus(`Found ${data.results.length} result(s).`);
}

function renderCards(items, mediaType) {
  el.results.innerHTML = "";

  const fragment = document.createDocumentFragment();

  items.slice(0, 42).forEach((item, index) => {
    const node = el.cardTemplate.content.firstElementChild.cloneNode(true);
    node.style.animationDelay = `${Math.min(index * 26, 390)}ms`;

    const button = node.querySelector(".card-btn");
    const poster = node.querySelector(".poster");
    const title = node.querySelector(".title");
    const meta = node.querySelector(".meta");

    const displayTitle = item.title || item.name || "Untitled";
    const date = item.release_date || item.first_air_date || "Unknown date";

    poster.src = item.poster_path ? `${TMDB_IMG}${item.poster_path}` : makePosterPlaceholder(displayTitle);
    poster.alt = `${displayTitle} poster`;

    title.textContent = displayTitle;
    meta.textContent = `${mediaType.toUpperCase()} | ${date}`;

    button.addEventListener("click", () => {
      playItem(item, { mediaType });
    });

    fragment.appendChild(node);
  });

  el.results.appendChild(fragment);
}

function playItem(item, overrides = {}) {
  const mediaType = overrides.mediaType || state.mediaType;
  const id = Number(item.id);
  if (!id) {
    setStatus("This title has no valid TMDB ID.");
    return;
  }

  const season = overrides.season || Number(item.season) || 1;
  const episode = overrides.episode || Number(item.episode) || 1;

  const title = item.title || item.name || `Title #${id}`;
  const resume = getSavedProgress(mediaType, id, season, episode);

  const url = new URL(
    mediaType === "movie"
      ? `${VIDKING_BASE}/movie/${id}`
      : `${VIDKING_BASE}/tv/${id}/${season}/${episode}`
  );

  url.searchParams.set("color", state.settings.color || "0dcaf0");
  if (state.settings.autoPlay) url.searchParams.set("autoPlay", "true");
  if (mediaType === "tv" && state.settings.nextEpisode) url.searchParams.set("nextEpisode", "true");
  if (mediaType === "tv" && state.settings.episodeSelector) url.searchParams.set("episodeSelector", "true");
  if (resume?.timestamp > 0) url.searchParams.set("progress", String(Math.floor(resume.timestamp)));

  el.playerFrame.src = url.toString();
  el.playerTitle.textContent = title;

  if (mediaType === "movie") {
    el.playerMeta.textContent = resume ? `Resume at ${formatSeconds(resume.timestamp)}` : "Movie";
  } else {
    const resumeText = resume ? `, resume ${formatSeconds(resume.timestamp)}` : "";
    el.playerMeta.textContent = `S${season} E${episode}${resumeText}`;
  }

  state.currentPlayback = {
    mediaType,
    id,
    season,
    episode,
    title
  };

  setMediaType(mediaType);
  setStatus(`Now playing: ${title}`);
}

async function fetchTmdb(endpoint, params = {}) {
  if (!state.settings.apiKey) return null;

  if (state.abortController) {
    state.abortController.abort();
  }
  state.abortController = new AbortController();

  const url = new URL(`${TMDB_BASE}${endpoint}`);
  url.searchParams.set("api_key", state.settings.apiKey);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });

  try {
    const response = await fetch(url, {
      signal: state.abortController.signal,
      cache: "force-cache"
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    if (error?.name !== "AbortError") {
      console.error("TMDB request failed", error);
    }
    return null;
  }
}

function onPlayerMessage(event) {
  if (!event?.data) return;

  let parsed = event.data;
  if (typeof event.data === "string") {
    try {
      parsed = JSON.parse(event.data);
    } catch {
      return;
    }
  }

  if (parsed?.type !== "PLAYER_EVENT" || !parsed?.data) return;
  const data = parsed.data;

  if (!data.id || !data.mediaType) return;

  const mediaType = data.mediaType === "tv" ? "tv" : "movie";
  const id = Number(data.id);
  const season = Number(data.season) || 1;
  const episode = Number(data.episode) || 1;

  const key = progressId(mediaType, id, season, episode);
  const timestamp = Number(data.currentTime) || 0;

  state.progress[key] = {
    mediaType,
    id,
    season,
    episode,
    timestamp,
    duration: Number(data.duration) || 0,
    progress: Number(data.progress) || 0,
    updatedAt: Date.now()
  };

  if (data.event === "ended") {
    state.progress[key].timestamp = 0;
    state.progress[key].progress = 100;
  }

  localStorage.setItem(progressKey, JSON.stringify(state.progress));
  queueCloudSync();

  if (data.event === "ended" && mediaType === "tv" && state.settings.autoNextSmart) {
    const nextEpisode = episode + 1;
    playItem(
      { id, name: state.currentPlayback?.title || `TV #${id}` },
      { mediaType: "tv", season, episode: nextEpisode }
    );
    setStatus(`Auto-next: S${season}E${nextEpisode}`);
  }

  if (data.event === "timeupdate" || data.event === "ended") {
    renderContinueWatching();
  }
}

function queueCloudSync() {
  if (!state.session?.user || !state.supabase) return;
  state.syncQueued = true;
  window.clearTimeout(state.syncTimer);
  state.syncTimer = window.setTimeout(() => {
    syncProgressToCloud();
  }, 800);
}

async function syncProgressToCloud() {
  if (!state.session?.user || !state.supabase || !state.syncQueued) return;

  const userId = state.session.user.id;
  const rows = Object.values(state.progress).slice(-120).map((entry) => ({
    user_id: userId,
    media_type: entry.mediaType,
    content_id: entry.id,
    season_number: entry.season || 1,
    episode_number: entry.episode || 1,
    timestamp_seconds: Math.floor(entry.timestamp || 0),
    duration_seconds: Math.floor(entry.duration || 0),
    progress_percent: Number(entry.progress || 0),
    updated_at: new Date(entry.updatedAt || Date.now()).toISOString()
  }));

  if (!rows.length) return;

  const { error } = await state.supabase
    .from("watch_progress")
    .upsert(rows, {
      onConflict: "user_id,media_type,content_id,season_number,episode_number"
    });

  if (error) {
    setStatus(`Cloud sync error: ${error.message}`);
    return;
  }

  state.syncQueued = false;
  updateCloudState("Cloud sync: connected");
}

async function pullCloudProgress() {
  if (!state.session?.user || !state.supabase) return;

  const { data, error } = await state.supabase
    .from("watch_progress")
    .select("media_type,content_id,season_number,episode_number,timestamp_seconds,duration_seconds,progress_percent,updated_at")
    .eq("user_id", state.session.user.id)
    .order("updated_at", { ascending: false })
    .limit(400);

  if (error) {
    setStatus(`Cloud read error: ${error.message}`);
    return;
  }

  let merged = 0;
  (data || []).forEach((row) => {
    const key = progressId(
      row.media_type,
      Number(row.content_id),
      Number(row.season_number) || 1,
      Number(row.episode_number) || 1
    );

    const updatedAt = Date.parse(row.updated_at || "") || Date.now();
    const local = state.progress[key];

    if (!local || updatedAt > (local.updatedAt || 0)) {
      state.progress[key] = {
        mediaType: row.media_type,
        id: Number(row.content_id),
        season: Number(row.season_number) || 1,
        episode: Number(row.episode_number) || 1,
        timestamp: Number(row.timestamp_seconds) || 0,
        duration: Number(row.duration_seconds) || 0,
        progress: Number(row.progress_percent) || 0,
        updatedAt
      };
      merged += 1;
    }
  });

  localStorage.setItem(progressKey, JSON.stringify(state.progress));
  renderContinueWatching();
  if (merged > 0) {
    setStatus(`Synced ${merged} progress item(s) from cloud.`);
  }
}

function renderContinueWatching() {
  const entries = Object.values(state.progress)
    .filter((entry) => entry.timestamp > 20 && entry.progress < 98)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 10);

  if (!entries.length) {
    el.continueWrap.setAttribute("hidden", "");
    el.continueGrid.innerHTML = "";
    return;
  }

  el.continueWrap.removeAttribute("hidden");
  el.continueGrid.innerHTML = "";

  const fragment = document.createDocumentFragment();

  entries.forEach((entry) => {
    const card = document.createElement("article");
    card.className = "continue-item";

    const btn = document.createElement("button");
    const label = entry.mediaType === "movie"
      ? `Movie #${entry.id}`
      : `TV #${entry.id} S${entry.season}E${entry.episode}`;

    btn.innerHTML = `
      <strong>${label}</strong><br>
      <span>Resume at ${formatSeconds(entry.timestamp)} (${Math.round(entry.progress)}%)</span>
    `;

    btn.addEventListener("click", () => {
      playItem(
        entry.mediaType === "movie"
          ? { id: entry.id, title: `Movie #${entry.id}` }
          : { id: entry.id, name: `TV #${entry.id}` },
        { mediaType: entry.mediaType, season: entry.season, episode: entry.episode }
      );
    });

    card.appendChild(btn);
    fragment.appendChild(card);
  });

  el.continueGrid.appendChild(fragment);
}

function progressId(mediaType, id, season, episode) {
  return `${mediaType}:${id}:${season || 1}:${episode || 1}`;
}

function getSavedProgress(mediaType, id, season, episode) {
  const key = progressId(mediaType, id, season, episode);
  return state.progress[key] || null;
}

function setMediaType(type) {
  state.mediaType = type;
  el.tabs.forEach((tab) => {
    const active = tab.dataset.type === type;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
}

function sanitizeColor(input) {
  const clean = String(input || "").trim().replace(/^#/, "").toLowerCase();
  return /^[0-9a-f]{6}$/.test(clean) ? clean : "0dcaf0";
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function hydrateSettingsUI() {
  el.apiKeyInput.value = state.settings.apiKey || "";
  el.colorInput.value = sanitizeColor(state.settings.color);
  el.autoplayInput.checked = Boolean(state.settings.autoPlay);
  el.nextEpisodeInput.checked = Boolean(state.settings.nextEpisode);
  el.episodeSelectorInput.checked = Boolean(state.settings.episodeSelector);
  el.autoNextSmartInput.checked = Boolean(state.settings.autoNextSmart);
}

function setStatus(message) {
  el.statusLine.textContent = message;
}

function updateCloudState(message) {
  el.cloudState.textContent = message;
}

function formatSeconds(value) {
  const total = Math.max(0, Math.floor(value || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function makePosterPlaceholder(text) {
  const safe = encodeURIComponent(text.slice(0, 22));
  return `https://placehold.co/300x450/f3f4f6/111827?text=${safe}`;
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch((error) => {
        console.warn("Service worker registration failed", error);
      });
    });
  }
}
