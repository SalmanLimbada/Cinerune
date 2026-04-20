import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import {
  initTmdb,
  fetchHomeCatalog,
  searchCatalog,
  titleById,
  posterById,
  fetchItemsByIds
} from "./catalog.js";

const progressKey = "cinerune:progress";
const bookmarksKey = "cinerune:bookmarks";

const el = {
  toggleAuth: document.getElementById("toggleAuth"),
  authPanel: document.getElementById("authPanel"),
  signedOutView: document.getElementById("signedOutView"),
  signedInView: document.getElementById("signedInView"),
  authIdentifier: document.getElementById("authIdentifier"),
  authPassword: document.getElementById("authPassword"),
  signInBtn: document.getElementById("signInBtn"),
  signUpBtn: document.getElementById("signUpBtn"),
  signOutBtn: document.getElementById("signOutBtn"),
  syncNowBtn: document.getElementById("syncNowBtn"),
  authHint: document.getElementById("authHint"),
  authUserEmail: document.getElementById("authUserEmail"),
  heroSection: document.getElementById("heroSection"),
  heroType: document.getElementById("heroType"),
  heroTitle: document.getElementById("heroTitle"),
  heroMeta: document.getElementById("heroMeta"),
  heroDesc: document.getElementById("heroDesc"),
  heroWatchBtn: document.getElementById("heroWatchBtn"),
  continueSection: document.getElementById("continueSection"),
  continueGrid: document.getElementById("continueGrid"),
  recommendedGrid: document.getElementById("recommendedGrid"),
  latestMoviesGrid: document.getElementById("latestMoviesGrid"),
  showRecommendedAll: document.getElementById("showRecommendedAll"),
  showRecommendedMovies: document.getElementById("showRecommendedMovies"),
  showRecommendedTv: document.getElementById("showRecommendedTv"),
  searchInput: document.getElementById("searchInput"),
  statusLine: document.getElementById("statusLine"),
  cloudState: document.getElementById("cloudState"),
  folderWatching: document.getElementById("folderWatching"),
  folderWatched: document.getElementById("folderWatched"),
  folderPlan: document.getElementById("folderPlan"),
  folderDropped: document.getElementById("folderDropped"),
  posterCardTemplate: document.getElementById("posterCardTemplate")
};

const state = {
  progress: readJson(progressKey, {}),
  bookmarks: readJson(bookmarksKey, {}),
  supabase: null,
  session: null,
  cloudEnabled: false,
  homeData: {
    hero: null,
    recommended: [],
    latestMovies: []
  },
  recommendedFilter: "all",
  searchTerm: ""
};

boot();

async function boot() {
  bindEvents();

  initTmdb({
    apiKey: String(window.CINERUNE_CONFIG?.tmdbApiKey || "").trim(),
    readAccessToken: String(window.CINERUNE_CONFIG?.tmdbReadAccessToken || "").trim(),
    language: String(window.CINERUNE_CONFIG?.tmdbLanguage || "en-US").trim()
  });

  await initAuth();
  await refreshHome();
  await hydrateContinueRow();
  renderBookmarkFolders();
  registerServiceWorker();
}

function bindEvents() {
  el.toggleAuth.addEventListener("click", () => {
    const hidden = el.authPanel.hasAttribute("hidden");
    if (hidden) {
      el.authPanel.removeAttribute("hidden");
      renderBookmarkFolders();
    } else {
      el.authPanel.setAttribute("hidden", "");
    }
  });

  el.signInBtn.addEventListener("click", signIn);
  el.signUpBtn.addEventListener("click", signUp);
  el.signOutBtn.addEventListener("click", signOut);
  el.syncNowBtn.addEventListener("click", forceSyncNow);

  el.showRecommendedAll.addEventListener("click", () => {
    state.recommendedFilter = "all";
    renderRecommended();
  });
  el.showRecommendedMovies.addEventListener("click", () => {
    state.recommendedFilter = "movie";
    renderRecommended();
  });
  el.showRecommendedTv.addEventListener("click", () => {
    state.recommendedFilter = "tv";
    renderRecommended();
  });

  el.searchInput.addEventListener("input", debounce(async () => {
    state.searchTerm = el.searchInput.value.trim();
    if (!state.searchTerm) {
      renderRecommended();
      renderLatestMovies();
      setStatus("Home feed loaded.");
      return;
    }

    try {
      const result = await searchCatalog(state.searchTerm);
      const merged = [...result.movies, ...result.tv].slice(0, 24);
      renderPosterCards(el.recommendedGrid, merged);
      renderPosterCards(el.latestMoviesGrid, result.movies.slice(0, 16));
      setStatus(`Search results for \"${state.searchTerm}\"`);
    } catch (error) {
      setStatus(`Search failed: ${error.message}`);
    }
  }, 280));
}

async function refreshHome() {
  try {
    const data = await fetchHomeCatalog();
    state.homeData.hero = data.hero;
    state.homeData.recommended = data.recommended;
    state.homeData.latestMovies = data.latestMovies;

    renderHero();
    renderRecommended();
    renderLatestMovies();
    setStatus("Home feed loaded.");
  } catch (error) {
    setStatus(`Failed to load TMDB feeds: ${error.message}`);
  }
}

function renderHero() {
  const item = state.homeData.hero;
  if (!item) return;

  el.heroType.textContent = item.mediaType === "movie" ? "Featured Movie" : "Featured Series";
  el.heroTitle.textContent = item.title;
  el.heroMeta.textContent = [item.year, item.genre || (item.mediaType === "movie" ? "Movie" : "TV Series")]
    .filter(Boolean)
    .join(" | ");
  el.heroDesc.textContent = item.plot || "No overview available.";

  const backdrop = item.backdrop || item.poster;
  el.heroSection.style.background = `linear-gradient(90deg, rgba(7,15,31,0.9), rgba(7,15,31,0.45)), url('${backdrop}') center/cover no-repeat`;

  el.heroWatchBtn.onclick = () => {
    openWatchPage(item.id, item.mediaType, 1, 1);
  };
}

function renderRecommended() {
  const all = state.homeData.recommended || [];
  const filtered = state.recommendedFilter === "all"
    ? all
    : all.filter((item) => item.mediaType === state.recommendedFilter);

  el.showRecommendedAll.classList.toggle("active", state.recommendedFilter === "all");
  el.showRecommendedMovies.classList.toggle("active", state.recommendedFilter === "movie");
  el.showRecommendedTv.classList.toggle("active", state.recommendedFilter === "tv");

  renderPosterCards(el.recommendedGrid, filtered.slice(0, 24));
}

function renderLatestMovies() {
  renderPosterCards(el.latestMoviesGrid, (state.homeData.latestMovies || []).slice(0, 18));
}

async function hydrateContinueRow() {
  const entries = Object.values(state.progress)
    .filter((entry) => Number(entry.timestamp || 0) > 20 && Number(entry.progress || 0) < 98)
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
    .slice(0, 14);

  if (!entries.length) {
    el.continueSection.setAttribute("hidden", "");
    el.continueGrid.innerHTML = "";
    return;
  }

  const apiItems = await fetchItemsByIds(entries);
  const byKey = new Map(apiItems.map((item) => [`${item.mediaType}:${item.id}`, item]));

  const items = entries.map((entry) => {
    const key = `${entry.mediaType}:${entry.id}`;
    const apiItem = byKey.get(key);
    return {
      id: entry.id,
      mediaType: entry.mediaType,
      title: apiItem?.title || entry.title || titleById(entry.id, entry.mediaType) || `Title ${entry.id}`,
      poster: apiItem?.poster || entry.poster || posterById(entry.id, entry.mediaType) || "",
      year: apiItem?.year || "",
      progressMeta: entry.mediaType === "tv"
        ? `S${entry.season || 1} E${entry.episode || 1} • ${formatSeconds(entry.timestamp)}`
        : `${Math.round(Number(entry.progress || 0))}% • ${formatSeconds(entry.timestamp)}`
    };
  });

  el.continueSection.removeAttribute("hidden");
  renderPosterCards(el.continueGrid, items, { showProgressMeta: true, rowMode: true });
}

function renderPosterCards(container, items, options = {}) {
  container.innerHTML = "";
  const fragment = document.createDocumentFragment();

  items.forEach((item) => {
    if (!item?.poster) return;

    const node = el.posterCardTemplate.content.firstElementChild.cloneNode(true);
    const button = node.querySelector(".poster-btn");
    const image = node.querySelector(".poster-img");
    const title = node.querySelector(".poster-title");
    const sub = node.querySelector(".poster-sub");

    image.src = item.poster;
    image.alt = `${item.title} poster`;
    title.textContent = item.title;

    if (options.showProgressMeta && item.progressMeta) {
      sub.textContent = item.progressMeta;
    } else {
      const typeLabel = item.mediaType === "movie" ? "Movie" : "TV";
      sub.textContent = [typeLabel, item.year].filter(Boolean).join(" | ");
    }

    button.addEventListener("click", () => {
      openWatchPage(item.id, item.mediaType, item.defaultSeason || 1, item.defaultEpisode || 1);
    });

    fragment.appendChild(node);
  });

  container.appendChild(fragment);
}

function renderBookmarkFolders() {
  const entries = Object.values(state.bookmarks)
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));

  renderFolder(el.folderWatching, entries.filter((entry) => entry.status === "watching"));
  renderFolder(el.folderWatched, entries.filter((entry) => entry.status === "watched"));
  renderFolder(el.folderPlan, entries.filter((entry) => entry.status === "plan"));
  renderFolder(el.folderDropped, entries.filter((entry) => entry.status === "dropped"));
}

function renderFolder(container, entries) {
  if (!container) return;
  if (!entries.length) {
    container.innerHTML = '<p class="tiny muted">Empty</p>';
    return;
  }

  const html = entries.slice(0, 8)
    .map((entry) => `<button class="folder-item" data-id="${entry.id}" data-type="${entry.mediaType}">${escapeHtml(entry.title)}</button>`)
    .join("");

  container.innerHTML = html;

  [...container.querySelectorAll(".folder-item")].forEach((node) => {
    node.addEventListener("click", () => {
      openWatchPage(Number(node.dataset.id), node.dataset.type, 1, 1);
    });
  });
}

function openWatchPage(id, mediaType, season, episode) {
  const url = new URL("./watch.html", window.location.href);
  url.searchParams.set("id", String(id));
  url.searchParams.set("type", mediaType === "tv" ? "tv" : "movie");
  if (mediaType === "tv") {
    url.searchParams.set("s", String(season || 1));
    url.searchParams.set("e", String(episode || 1));
  }
  window.location.href = url.toString();
}

async function initAuth() {
  const config = window.CINERUNE_CONFIG || {};
  const supabaseUrl = String(config.supabaseUrl || "").trim();
  const supabasePublishableKey = String(config.supabasePublishableKey || config.supabaseAnonKey || "").trim();

  if (!supabaseUrl || !supabasePublishableKey) {
    setAuthHint("Cloud auth is disabled. Add Supabase keys in config.js.");
    updateCloudState("Cloud sync: off");
    renderAuthUI();
    return;
  }

  try {
    state.supabase = createClient(supabaseUrl, supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    });

    const { data } = await state.supabase.auth.getSession();
    state.session = data?.session || null;
    state.cloudEnabled = true;

    state.supabase.auth.onAuthStateChange((_event, session) => {
      state.session = session;
      renderAuthUI();
      renderBookmarkFolders();
      if (session?.user) {
        pullCloudProgress();
      }
    });

    renderAuthUI();
    if (state.session?.user) {
      await pullCloudProgress();
    }
  } catch (error) {
    setAuthHint(`Supabase init failed: ${error.message}`);
    updateCloudState("Cloud sync: error");
  }
}

function renderAuthUI() {
  const signedIn = Boolean(state.session?.user);
  el.signedOutView.toggleAttribute("hidden", signedIn);
  el.signedInView.toggleAttribute("hidden", !signedIn);
  el.toggleAuth.textContent = signedIn ? "Account" : "Login";

  if (signedIn) {
    const user = state.session.user;
    el.authUserEmail.textContent = user.user_metadata?.username || user.email || user.id;
    updateCloudState("Cloud sync: connected");
    setAuthHint("Logged in.");
  } else {
    updateCloudState(state.cloudEnabled ? "Cloud sync: ready (login required)" : "Cloud sync: off");
  }
}

async function signIn() {
  if (!state.supabase) return;

  const identifier = String(el.authIdentifier.value || "").trim().toLowerCase();
  const password = String(el.authPassword.value || "");
  if (!identifier || !password) {
    setAuthHint("Enter username/email and password.");
    return;
  }

  const email = identifier.includes("@") ? identifier : `${identifier}@cinerune.user`;
  const { error } = await state.supabase.auth.signInWithPassword({ email, password });
  if (error) {
    setAuthHint(`Sign in failed: ${error.message}`);
    return;
  }

  setAuthHint("Signed in.");
}

async function signUp() {
  if (!state.supabase) return;

  const identifier = String(el.authIdentifier.value || "").trim().toLowerCase();
  const password = String(el.authPassword.value || "");
  if (!identifier || password.length < 6) {
    setAuthHint("Provide username/email and password (6+ chars).");
    return;
  }

  const isEmail = identifier.includes("@");
  const email = isEmail ? identifier : `${identifier}@cinerune.user`;

  const payload = {
    email,
    password,
    options: isEmail ? {} : { data: { username: identifier } }
  };

  const { error } = await state.supabase.auth.signUp(payload);
  if (error) {
    setAuthHint(`Sign up failed: ${error.message}`);
    return;
  }

  setAuthHint("Account created. If email confirmations are enabled, verify and sign in.");
}

async function signOut() {
  if (!state.supabase) return;
  await state.supabase.auth.signOut();
  setAuthHint("Signed out.");
}

async function forceSyncNow() {
  await syncProgressToCloud();
}

async function syncProgressToCloud() {
  if (!state.session?.user || !state.supabase) {
    setStatus("Login required for cloud sync.");
    return;
  }

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
    setStatus("No local progress to sync.");
    return;
  }

  const { error } = await state.supabase
    .from("watch_progress")
    .upsert(rows, { onConflict: "user_id,media_type,content_id,season_number,episode_number" });

  if (error) {
    setStatus(`Cloud sync failed: ${error.message}`);
    return;
  }

  setStatus("Cloud progress synced.");
}

async function pullCloudProgress() {
  if (!state.session?.user || !state.supabase) return;

  const { data, error } = await state.supabase
    .from("watch_progress")
    .select("media_type,content_id,season_number,episode_number,timestamp_seconds,duration_seconds,progress_percent,updated_at")
    .eq("user_id", state.session.user.id)
    .order("updated_at", { ascending: false })
    .limit(500);

  if (error) {
    setStatus(`Cloud pull failed: ${error.message}`);
    return;
  }

  (data || []).forEach((row) => {
    const mediaType = row.media_type === "tv" ? "tv" : "movie";
    const id = Number(row.content_id);
    const season = Number(row.season_number) || 1;
    const episode = Number(row.episode_number) || 1;
    const key = `${mediaType}:${id}:${season}:${episode}`;

    state.progress[key] = {
      mediaType,
      id,
      season,
      episode,
      timestamp: Number(row.timestamp_seconds) || 0,
      duration: Number(row.duration_seconds) || 0,
      progress: Number(row.progress_percent) || 0,
      updatedAt: Date.parse(row.updated_at || "") || Date.now(),
      title: titleById(id, mediaType) || `Title ${id}`,
      poster: posterById(id, mediaType) || ""
    };
  });

  localStorage.setItem(progressKey, JSON.stringify(state.progress));
  await hydrateContinueRow();
  setStatus("Cloud progress loaded.");
}

function setStatus(message) {
  el.statusLine.textContent = message;
}

function setAuthHint(message) {
  el.authHint.textContent = message;
}

function updateCloudState(message) {
  el.cloudState.textContent = message;
}

function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
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

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
