import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const VIDKING_BASE = "https://www.vidking.net/embed";

const catalog = [
  { id: 872585, mediaType: "movie", title: "Oppenheimer", year: 2023, poster: "https://image.tmdb.org/t/p/w500/ptpr0kGAckfQkJeJIt8st5dglvd.jpg", tags: ["recommended", "trending-movie"] },
  { id: 693134, mediaType: "movie", title: "Dune: Part Two", year: 2024, poster: "https://image.tmdb.org/t/p/w500/8b8R8l88Qje9dn9OE8PY05Nxl1X.jpg", tags: ["recommended", "trending-movie"] },
  { id: 603692, mediaType: "movie", title: "John Wick: Chapter 4", year: 2023, poster: "https://image.tmdb.org/t/p/w500/vZloFAK7NmvMGKE7VkF5UHaz0I.jpg", tags: ["trending-movie"] },
  { id: 940721, mediaType: "movie", title: "Godzilla Minus One", year: 2023, poster: "https://image.tmdb.org/t/p/w500/hfTyu2VPBqLRPo2DauW8q7bh9bm.jpg", tags: ["recommended", "trending-movie"] },
  { id: 346698, mediaType: "movie", title: "Barbie", year: 2023, poster: "https://image.tmdb.org/t/p/w500/iuFNMS8U5cb6xfzi51Dbkovj7vM.jpg", tags: ["trending-movie"] },
  { id: 569094, mediaType: "movie", title: "Spider-Man: Across the Spider-Verse", year: 2023, poster: "https://image.tmdb.org/t/p/w500/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg", tags: ["recommended", "trending-movie"] },
  { id: 447365, mediaType: "movie", title: "Guardians of the Galaxy Vol. 3", year: 2023, poster: "https://image.tmdb.org/t/p/w500/r2J02Z2OpNTctfOSN1Ydgii51I3.jpg", tags: ["trending-movie"] },
  { id: 533535, mediaType: "movie", title: "Deadpool & Wolverine", year: 2024, poster: "https://image.tmdb.org/t/p/w500/8cdWjvZQUExUUTzyp4t6EDMubfO.jpg", tags: ["recommended", "trending-movie"] },
  { id: 1399, mediaType: "tv", title: "Game of Thrones", year: 2011, poster: "https://image.tmdb.org/t/p/w500/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg", tags: ["recommended", "popular-tv"], season: 1, episode: 1 },
  { id: 94997, mediaType: "tv", title: "House of the Dragon", year: 2022, poster: "https://image.tmdb.org/t/p/w500/z2yahl2uefxDCl0nogcRBstwruJ.jpg", tags: ["popular-tv"] },
  { id: 1396, mediaType: "tv", title: "Breaking Bad", year: 2008, poster: "https://image.tmdb.org/t/p/w500/3xnWaLQjelJDDF7LT1WBo6f4BRe.jpg", tags: ["popular-tv", "recommended"] },
  { id: 71446, mediaType: "tv", title: "Money Heist", year: 2017, poster: "https://image.tmdb.org/t/p/w500/reEMJA1uzscCbkpeRJeTT2bjqUp.jpg", tags: ["popular-tv"] },
  { id: 60574, mediaType: "tv", title: "Peaky Blinders", year: 2013, poster: "https://image.tmdb.org/t/p/w500/vUUqzWa2LnHIVqkaKVlVGkVcZIW.jpg", tags: ["popular-tv", "recommended"] },
  { id: 1398, mediaType: "tv", title: "The Sopranos", year: 1999, poster: "https://image.tmdb.org/t/p/w500/rTc7ZXdroqjkKivFPvCPX0Ru7uw.jpg", tags: ["popular-tv"] },
  { id: 615, mediaType: "tv", title: "Futurama", year: 1999, poster: "https://image.tmdb.org/t/p/w500/5MwsjTfn6u7xW7vR7f6x9jvM2W2.jpg", tags: ["popular-tv"] },
  { id: 60625, mediaType: "tv", title: "Rick and Morty", year: 2013, poster: "https://image.tmdb.org/t/p/w500/8kOWDBK6XlPUzckuHDo3wwVRFwt.jpg", tags: ["popular-tv", "recommended"] }
];

const settingsKey = "cinerune:settings";
const progressKey = "cinerune:progress";

const el = {
  toggleSettings: document.getElementById("toggleSettings"),
  toggleAuth: document.getElementById("toggleAuth"),
  settingsPanel: document.getElementById("settingsPanel"),
  authPanel: document.getElementById("authPanel"),
  signedOutView: document.getElementById("signedOutView"),
  signedInView: document.getElementById("signedInView"),
  authIdentifier: document.getElementById("authIdentifier"),
  authPassword: document.getElementById("authPassword"),
  signInBtn: document.getElementById("signInBtn"),
  signUpBtn: document.getElementById("signUpBtn"),
  signOutBtn: document.getElementById("signOutBtn"),
  syncNowBtn: document.getElementById("syncNowBtn"),
  authUserEmail: document.getElementById("authUserEmail"),
  authHint: document.getElementById("authHint"),
  cloudState: document.getElementById("cloudState"),
  colorInput: document.getElementById("colorInput"),
  autoplayInput: document.getElementById("autoplayInput"),
  nextEpisodeInput: document.getElementById("nextEpisodeInput"),
  episodeSelectorInput: document.getElementById("episodeSelectorInput"),
  autoNextSmartInput: document.getElementById("autoNextSmartInput"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),
  searchInput: document.getElementById("searchInput"),
  statusLine: document.getElementById("statusLine"),
  playerFrame: document.getElementById("playerFrame"),
  playerTitle: document.getElementById("playerTitle"),
  playerMeta: document.getElementById("playerMeta"),
  continueSection: document.getElementById("continueSection"),
  continueGrid: document.getElementById("continueGrid"),
  recommendedGrid: document.getElementById("recommendedGrid"),
  movieGrid: document.getElementById("movieGrid"),
  tvGrid: document.getElementById("tvGrid"),
  cardTemplate: document.getElementById("cardTemplate"),
  continueTemplate: document.getElementById("continueTemplate")
};

const state = {
  settings: readJson(settingsKey, {
    color: "0dcaf0",
    autoPlay: false,
    nextEpisode: true,
    episodeSelector: true,
    autoNextSmart: true
  }),
  progress: readJson(progressKey, {}),
  supabase: null,
  session: null,
  cloudEnabled: false,
  currentPlayback: null,
  syncTimer: null,
  syncQueued: false,
  searchTerm: ""
};

boot();

async function boot() {
  hydrateSettingsUI();
  bindEvents();
  await initAuth();
  renderHome();
  registerServiceWorker();
}

function bindEvents() {
  el.toggleSettings.addEventListener("click", () => togglePanel(el.settingsPanel));
  el.toggleAuth.addEventListener("click", () => togglePanel(el.authPanel));

  el.saveSettingsBtn.addEventListener("click", () => {
    state.settings = {
      color: sanitizeColor(el.colorInput.value),
      autoPlay: el.autoplayInput.checked,
      nextEpisode: el.nextEpisodeInput.checked,
      episodeSelector: el.episodeSelectorInput.checked,
      autoNextSmart: el.autoNextSmartInput.checked
    };
    localStorage.setItem(settingsKey, JSON.stringify(state.settings));
    setStatus("Settings saved.");
  });

  el.searchInput.addEventListener("input", () => {
    state.searchTerm = el.searchInput.value.trim().toLowerCase();
    renderHome();
  });

  el.signInBtn.addEventListener("click", signIn);
  el.signUpBtn.addEventListener("click", signUp);
  el.signOutBtn.addEventListener("click", signOut);
  el.syncNowBtn.addEventListener("click", forceSyncNow);

  window.addEventListener("message", onPlayerMessage);
}

function togglePanel(panel) {
  const isHidden = panel.hasAttribute("hidden");
  if (isHidden) panel.removeAttribute("hidden");
  else panel.setAttribute("hidden", "");
}

function renderHome() {
  const filter = state.searchTerm;
  const filtered = filter
    ? catalog.filter((item) => item.title.toLowerCase().includes(filter))
    : catalog;

  renderCards(el.recommendedGrid, filtered.filter((item) => item.tags.includes("recommended")).slice(0, 10));
  renderCards(el.movieGrid, filtered.filter((item) => item.mediaType === "movie").slice(0, 14));
  renderCards(el.tvGrid, filtered.filter((item) => item.mediaType === "tv").slice(0, 14));

  renderContinueWatching();
  setStatus(filter ? `Showing results for "${state.searchTerm}"` : "Ready.");
}

function renderCards(container, items) {
  container.innerHTML = "";
  const fragment = document.createDocumentFragment();

  items.forEach((item, index) => {
    const node = el.cardTemplate.content.firstElementChild.cloneNode(true);
    node.style.animationDelay = `${Math.min(index * 24, 360)}ms`;

    const button = node.querySelector(".card-btn");
    const poster = node.querySelector(".poster");
    const title = node.querySelector(".title");
    const meta = node.querySelector(".meta");

    poster.src = item.poster;
    poster.alt = `${item.title} poster`;
    title.textContent = item.title;

    if (item.mediaType === "tv") {
      meta.textContent = `TV Series | ${item.year}`;
    } else {
      meta.textContent = `Movie | ${item.year}`;
    }

    button.addEventListener("click", () => {
      playItem(item, {
        mediaType: item.mediaType,
        season: item.season || 1,
        episode: item.episode || 1
      });
    });

    fragment.appendChild(node);
  });

  container.appendChild(fragment);
}

function renderContinueWatching() {
  const entries = Object.values(state.progress)
    .filter((entry) => entry.timestamp > 20 && entry.progress < 98)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 8);

  if (!entries.length) {
    el.continueSection.setAttribute("hidden", "");
    el.continueGrid.innerHTML = "";
    return;
  }

  el.continueSection.removeAttribute("hidden");
  el.continueGrid.innerHTML = "";

  const fragment = document.createDocumentFragment();

  entries.forEach((entry) => {
    const node = el.continueTemplate.content.firstElementChild.cloneNode(true);
    const btn = node.querySelector(".continue-btn");
    const poster = node.querySelector(".continue-poster");
    const title = node.querySelector(".continue-title");
    const meta = node.querySelector(".continue-meta");

    const fallbackTitle = entry.mediaType === "movie"
      ? `Movie #${entry.id}`
      : `TV #${entry.id} S${entry.season}E${entry.episode}`;

    poster.src = entry.poster || makePosterPlaceholder(fallbackTitle);
    poster.alt = `${fallbackTitle} poster`;
    title.textContent = entry.title || fallbackTitle;

    if (entry.mediaType === "tv") {
      meta.textContent = `Resume at ${formatSeconds(entry.timestamp)} | S${entry.season}E${entry.episode}`;
    } else {
      meta.textContent = `Resume at ${formatSeconds(entry.timestamp)} | ${Math.round(entry.progress)}%`;
    }

    btn.addEventListener("click", () => {
      playItem(
        {
          id: entry.id,
          title: entry.title || fallbackTitle,
          mediaType: entry.mediaType,
          poster: entry.poster
        },
        { mediaType: entry.mediaType, season: entry.season, episode: entry.episode }
      );
    });

    fragment.appendChild(node);
  });

  el.continueGrid.appendChild(fragment);
}

function playItem(item, overrides = {}) {
  const mediaType = overrides.mediaType || item.mediaType || "movie";
  const id = Number(item.id);
  if (!id) {
    setStatus("Invalid title ID.");
    return;
  }

  const season = Number(overrides.season || item.season || 1);
  const episode = Number(overrides.episode || item.episode || 1);
  const title = item.title || `Title #${id}`;
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
    el.playerMeta.textContent = resume ? `Resume ${formatSeconds(resume.timestamp)}` : "Movie";
  } else {
    const resumeText = resume ? `, resume ${formatSeconds(resume.timestamp)}` : "";
    el.playerMeta.textContent = `S${season} E${episode}${resumeText}`;
  }

  state.currentPlayback = {
    mediaType,
    id,
    season,
    episode,
    title,
    poster: item.poster || findPosterById(id)
  };

  setStatus(`Now playing: ${title}`);
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
  const season = Number(data.season) || state.currentPlayback?.season || 1;
  const episode = Number(data.episode) || state.currentPlayback?.episode || 1;

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
    updatedAt: Date.now(),
    title: state.currentPlayback?.title || findTitleById(id) || `Title #${id}`,
    poster: state.currentPlayback?.poster || findPosterById(id)
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
      {
        id,
        title: state.currentPlayback?.title || findTitleById(id) || `TV #${id}`,
        mediaType: "tv",
        poster: state.currentPlayback?.poster || findPosterById(id)
      },
      { mediaType: "tv", season, episode: nextEpisode }
    );
    setStatus(`Auto-next: S${season}E${nextEpisode}`);
  }

  if (data.event === "timeupdate" || data.event === "ended") {
    renderContinueWatching();
  }
}

function progressId(mediaType, id, season, episode) {
  return `${mediaType}:${id}:${season || 1}:${episode || 1}`;
}

function getSavedProgress(mediaType, id, season, episode) {
  const key = progressId(mediaType, id, season, episode);
  return state.progress[key] || null;
}

function findTitleById(id) {
  const match = catalog.find((item) => item.id === Number(id));
  return match?.title || null;
}

function findPosterById(id) {
  const match = catalog.find((item) => item.id === Number(id));
  return match?.poster || null;
}

async function initAuth() {
  const config = window.CINERUNE_CONFIG || {};
  const supabaseUrl = String(config.supabaseUrl || "").trim();
  const supabasePublishableKey = String(config.supabasePublishableKey || config.supabaseAnonKey || "").trim();

  if (!supabaseUrl || !supabasePublishableKey) {
    setAuthHint("Set Supabase values in config.js to enable account sync.", true);
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
    updateCloudState(state.session?.user ? "Cloud sync: connected" : "Cloud sync: ready (login required)");

    if (state.session?.user) {
      await pullCloudProgress();
    }
  } catch (error) {
    console.error("Supabase init failed", error);
    setAuthHint("Supabase init failed. Check URL/key and refresh.", true);
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
    const username = user.user_metadata?.username;
    el.authUserEmail.textContent = username || user.email || user.id;
    setAuthHint("Signed in. Progress sync is active.");
    updateCloudState("Cloud sync: connected");
  } else {
    setAuthHint(state.cloudEnabled ? "Ready. Sign in or create account." : "Set Supabase values in config.js to enable account sync.", !state.cloudEnabled);
    updateCloudState(state.cloudEnabled ? "Cloud sync: ready (login required)" : "Cloud sync: off");
  }
}

function normalizeIdentifier(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return { error: "Enter username or email." };

  if (value.includes("@")) {
    return { email: value, username: null };
  }

  const username = value.replace(/[^a-z0-9._-]/g, "");
  if (username.length < 3) {
    return { error: "Username must be at least 3 characters." };
  }

  return {
    email: `${username}@cinerune.user`,
    username
  };
}

async function signIn() {
  if (!state.supabase) {
    setAuthHint("Cloud auth is not configured in config.js.", true);
    return;
  }

  const normalized = normalizeIdentifier(el.authIdentifier.value);
  if (normalized.error) {
    setAuthHint(normalized.error, true);
    return;
  }

  const password = el.authPassword.value;
  if (!password) {
    setAuthHint("Enter password.", true);
    return;
  }

  try {
    setAuthHint("Signing in...");
    const { error } = await state.supabase.auth.signInWithPassword({
      email: normalized.email,
      password
    });

    if (error) {
      setAuthHint(`Sign in failed: ${error.message}`, true);
      return;
    }

    setAuthHint("Signed in. Syncing cloud progress...");
    await pullCloudProgress();
  } catch (error) {
    setAuthHint(`Sign in failed: ${error?.message || "Unexpected error"}`, true);
  }
}

async function signUp() {
  if (!state.supabase) {
    setAuthHint("Cloud auth is not configured in config.js.", true);
    return;
  }

  const normalized = normalizeIdentifier(el.authIdentifier.value);
  if (normalized.error) {
    setAuthHint(normalized.error, true);
    return;
  }

  const password = el.authPassword.value;
  if (!password || password.length < 6) {
    setAuthHint("Password must be at least 6 characters.", true);
    return;
  }

  try {
    setAuthHint("Creating account...");
    const payload = {
      email: normalized.email,
      password,
      options: {}
    };

    if (normalized.username) {
      payload.options.data = { username: normalized.username };
    }

    const { error } = await state.supabase.auth.signUp(payload);

    if (error) {
      setAuthHint(`Sign up failed: ${error.message}`, true);
      return;
    }

    setAuthHint("Account created. If email confirmation is on, confirm then sign in.");
  } catch (error) {
    setAuthHint(`Sign up failed: ${error?.message || "Unexpected error"}`, true);
  }
}

async function signOut() {
  if (!state.supabase) return;

  const { error } = await state.supabase.auth.signOut();
  if (error) {
    setAuthHint(`Sign out failed: ${error.message}`, true);
    return;
  }

  setAuthHint("Signed out.");
  setStatus("Signed out.");
}

function queueCloudSync() {
  if (!state.session?.user || !state.supabase) return;
  state.syncQueued = true;
  window.clearTimeout(state.syncTimer);
  state.syncTimer = window.setTimeout(() => {
    syncProgressToCloud();
  }, 900);
}

async function forceSyncNow() {
  state.syncQueued = true;
  await syncProgressToCloud();
}

async function syncProgressToCloud() {
  if (!state.session?.user || !state.supabase || !state.syncQueued) return;

  const userId = state.session.user.id;
  const rows = Object.values(state.progress).slice(-160).map((entry) => ({
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
  setStatus("Progress synced.");
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
    const id = Number(row.content_id);
    const season = Number(row.season_number) || 1;
    const episode = Number(row.episode_number) || 1;
    const key = progressId(row.media_type, id, season, episode);
    const updatedAt = Date.parse(row.updated_at || "") || Date.now();
    const local = state.progress[key];

    if (!local || updatedAt > (local.updatedAt || 0)) {
      state.progress[key] = {
        mediaType: row.media_type,
        id,
        season,
        episode,
        timestamp: Number(row.timestamp_seconds) || 0,
        duration: Number(row.duration_seconds) || 0,
        progress: Number(row.progress_percent) || 0,
        updatedAt,
        title: findTitleById(id) || `Title #${id}`,
        poster: findPosterById(id)
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

function sanitizeColor(input) {
  const clean = String(input || "").trim().replace(/^#/, "").toLowerCase();
  return /^[0-9a-f]{6}$/.test(clean) ? clean : "0dcaf0";
}

function hydrateSettingsUI() {
  el.colorInput.value = sanitizeColor(state.settings.color);
  el.autoplayInput.checked = Boolean(state.settings.autoPlay);
  el.nextEpisodeInput.checked = Boolean(state.settings.nextEpisode);
  el.episodeSelectorInput.checked = Boolean(state.settings.episodeSelector);
  el.autoNextSmartInput.checked = Boolean(state.settings.autoNextSmart);
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function setStatus(message) {
  el.statusLine.textContent = message;
}

function updateCloudState(message) {
  el.cloudState.textContent = message;
}

function setAuthHint(message, isError = false) {
  el.authHint.textContent = message;
  el.authHint.style.color = isError ? "#b42318" : "";
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
  const safe = encodeURIComponent(text.slice(0, 24));
  return `https://placehold.co/300x450/f3f4f6/111827?text=${safe}`;
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("Service worker registration failed", error);
    });
  });
}
