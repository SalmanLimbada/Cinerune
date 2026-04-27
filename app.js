import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import * as catalogApi from "./catalog.js?v=20260423b";

const initTmdb = catalogApi.initTmdb;
const fetchHomeCatalog = catalogApi.fetchHomeCatalog;
const fetchGenreOptions = catalogApi.fetchGenreOptions || (async () => ({ movie: [], tv: [] }));
const fetchCountryOptions = catalogApi.fetchCountryOptions || (async () => []);
const searchCatalog = catalogApi.searchCatalog;
const titleById = catalogApi.titleById;
const posterById = catalogApi.posterById;
const fetchItemsByIds = catalogApi.fetchItemsByIds;

const progressKey = "cinerune:progress";
const bookmarksKey = "cinerune:bookmarks";
const homeCacheKey = "cinerune:home-cache";
const avatarOptions = [
  { id: "orbit", label: "Orbit", color: "#7ad8ff" },
  { id: "ember", label: "Ember", color: "#ff8f6b" },
  { id: "mint", label: "Mint", color: "#7ef0c4" },
  { id: "sun", label: "Sun", color: "#ffd86a" },
  { id: "violet", label: "Violet", color: "#c8a7ff" },
  { id: "rose", label: "Rose", color: "#ff8dc7" }
];

const el = {
  toggleAuth: document.getElementById("toggleAuth"),
  accountMenuWrap: document.getElementById("accountMenuWrap"),
  accountMenu: document.getElementById("accountMenu"),
  openAccountSettings: document.getElementById("openAccountSettings"),
  signOutMenuBtn: document.getElementById("signOutMenuBtn"),
  authModal: document.getElementById("authModal"),
  authBackdrop: document.getElementById("authBackdrop"),
  closeAuth: document.getElementById("closeAuth"),
  signedOutView: document.getElementById("signedOutView"),
  signedInView: document.getElementById("signedInView"),
  signedInHint: document.getElementById("signedInHint"),
  authIdentifier: document.getElementById("authIdentifier"),
  authPassword: document.getElementById("authPassword"),
  signInBtn: document.getElementById("signInBtn"),
  signUpBtn: document.getElementById("signUpBtn"),
  signOutBtn: document.getElementById("signOutBtn"),
  authHint: document.getElementById("authHint"),
  authUserEmail: document.getElementById("authUserEmail"),
  authAvatarThumb: document.getElementById("authAvatarThumb"),
  authButtonLabel: document.getElementById("authButtonLabel"),
  accountAvatar: document.getElementById("accountAvatar"),
  avatarPicker: document.getElementById("avatarPicker"),
  signedInAvatarPicker: document.getElementById("signedInAvatarPicker"),
  heroSection: document.getElementById("heroSection"),
  heroType: document.getElementById("heroType"),
  heroTitle: document.getElementById("heroTitle"),
  heroMeta: document.getElementById("heroMeta"),
  heroDesc: document.getElementById("heroDesc"),
  heroWatchBtn: document.getElementById("heroWatchBtn"),
  showGenreExplorer: document.getElementById("showGenreExplorer"),
  showCountryExplorer: document.getElementById("showCountryExplorer"),
  megaMenuPanel: document.getElementById("megaMenuPanel"),
  megaMenuTitle: document.getElementById("megaMenuTitle"),
  megaMenuGrid: document.getElementById("megaMenuGrid"),
  continueSection: document.getElementById("continueSection"),
  continueGrid: document.getElementById("continueGrid"),
  recommendedGrid: document.getElementById("recommendedGrid"),
  trendingGrid: document.getElementById("trendingGrid"),
  searchInput: document.getElementById("searchInput"),
  searchSuggestions: document.getElementById("searchSuggestions"),
  searchResultsSection: document.getElementById("searchResultsSection"),
  searchResultsGrid: document.getElementById("searchResultsGrid"),
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
    trending: []
  },
  genreOptions: [],
  countryOptions: [],
  explorerMode: "genre",
  searchTerm: "",
  searchResults: [],
  autoSyncTimer: null,
  lastSyncAt: 0,
  heroRotationTimer: null
};

let selectedAvatarId = readJson("cinerune:avatar-choice", "orbit");
let authModalMode = "login";
const startupQuery = new URLSearchParams(window.location.search);
const startupAuthMode = startupQuery.get("auth") || startupQuery.get("modal");

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

  if (startupAuthMode === "settings" && state.session?.user) {
    openAuthModal(true);
  } else if (startupAuthMode === "login") {
    openAuthModal(false);
  }

  registerServiceWorker();
}

function bindEvents() {
  if (el.toggleAuth) {
    el.toggleAuth.addEventListener("click", () => {
      if (state.session?.user) {
        toggleAccountMenu();
      } else {
        openAuthModal();
      }
    });
  }

  if (el.closeAuth) {
    el.closeAuth.addEventListener("click", closeAuthModal);
  }
  if (el.authBackdrop) {
    el.authBackdrop.addEventListener("click", closeAuthModal);
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAuthModal();
  });

  if (el.signInBtn) el.signInBtn.addEventListener("click", signIn);
  if (el.signUpBtn) el.signUpBtn.addEventListener("click", signUp);
  if (el.signOutBtn) el.signOutBtn.addEventListener("click", signOut);
  if (el.signOutMenuBtn) el.signOutMenuBtn.addEventListener("click", signOut);

  if (el.openAccountSettings) {
    el.openAccountSettings.addEventListener("click", () => {
      closeAccountMenu();
      openAuthModal(true);
    });
  }

  if (el.authIdentifier) {
    el.authIdentifier.addEventListener("keydown", onAuthEnter);
  }
  if (el.authPassword) {
    el.authPassword.addEventListener("keydown", onAuthEnter);
  }

  renderAvatarPickers();

  if (el.showGenreExplorer) {
    el.showGenreExplorer.addEventListener("click", () => {
      state.explorerMode = "genre";
      renderMegaMenu();
      openMegaMenu();
    });
  }
  if (el.showCountryExplorer) {
    el.showCountryExplorer.addEventListener("click", () => {
      state.explorerMode = "country";
      renderMegaMenu();
      openMegaMenu();
    });
  }

  if (el.searchInput) {
    el.searchInput.addEventListener("input", debounce(async () => {
      state.searchTerm = el.searchInput.value.trim();
      if (!state.searchTerm) {
        state.searchResults = [];
        hideSearchSuggestions();
        hideSearchResults();
        return;
      }

      try {
        const result = await searchCatalog(state.searchTerm);
        const merged = [...result.movies, ...result.tv].slice(0, 24);
        state.searchResults = merged;
        renderSearchResults(merged);
        renderSearchSuggestions(state.searchResults);
      } catch {
        hideSearchSuggestions();
        hideSearchResults();
      }
    }, 280));

    el.searchInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const first = state.searchResults[0];
      if (!first) return;
      openWatchPage(first.id, first.mediaType, 1, 1);
    });
  }

  document.addEventListener("click", (event) => {
    if (el.accountMenuWrap && !el.accountMenuWrap.contains(event.target)) {
      closeAccountMenu();
    }
    if (!el.searchInput || !el.searchSuggestions) return;
    if (event.target === el.searchInput || el.searchSuggestions.contains(event.target)) return;
    hideSearchSuggestions();
  });

  document.addEventListener("click", (event) => {
    if (!el.megaMenuPanel || el.megaMenuPanel.hasAttribute("hidden")) return;
    const target = event.target;
    const clickedToggle = el.showGenreExplorer?.contains(target) || el.showCountryExplorer?.contains(target);
    const clickedInsidePanel = el.megaMenuPanel.contains(target);
    if (!clickedToggle && !clickedInsidePanel) {
      closeMegaMenu();
    }
  });

  window.addEventListener("storage", (event) => {
    if (event.key !== progressKey || !event.newValue) return;
    try {
      state.progress = JSON.parse(event.newValue);
      hydrateContinueRow();
      queueAutoSync();
    } catch {
      // ignore malformed storage values
    }
  });
}

async function refreshHome() {
  const [homeResult, genresResult, countriesResult] = await Promise.allSettled([
    fetchHomeCatalog(),
    fetchGenreOptions(),
    fetchCountryOptions()
  ]);

  let homeData = null;
  if (homeResult.status === "fulfilled") {
    homeData = homeResult.value;
    localStorage.setItem(homeCacheKey, JSON.stringify(homeData));
  } else {
    homeData = readJson(homeCacheKey, null);
  }

  if (!homeData) {
    renderUnavailableState();
    return;
  }

  state.homeData.hero = homeData.hero || null;
  state.homeData.recommended = homeData.recommended || [];
  state.homeData.trending = homeData.trending || [];

  const genreData = genresResult.status === "fulfilled" ? genresResult.value : { movie: [], tv: [] };
  state.genreOptions = dedupeExplorerOptions([...(genreData.movie || []), ...(genreData.tv || [])], "id");
  state.countryOptions = countriesResult.status === "fulfilled" ? (countriesResult.value || []) : [];

  renderHero();
  renderRecommended();
  renderTrending();
  renderMegaMenu();
  startHeroRotation();
}

function renderUnavailableState() {
  if (!el.heroType || !el.heroTitle || !el.heroMeta || !el.heroDesc || !el.heroSection || !el.heroWatchBtn) return;
  el.heroType.textContent = "Featured";
  el.heroTitle.textContent = "Content unavailable";
  el.heroMeta.textContent = "Please refresh in a moment";
  el.heroDesc.textContent = "We are having trouble loading this page right now.";
  el.heroSection.style.background = "linear-gradient(90deg, rgba(7,15,31,0.9), rgba(7,15,31,0.6))";
  el.heroWatchBtn.onclick = null;

  el.recommendedGrid.innerHTML = "";
  el.trendingGrid.innerHTML = "";
  if (el.megaMenuGrid) el.megaMenuGrid.innerHTML = "";
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

function startHeroRotation() {
  if (state.heroRotationTimer) {
    clearInterval(state.heroRotationTimer);
    state.heroRotationTimer = null;
  }

  const pool = dedupeById([
    state.homeData.hero,
    ...(state.homeData.recommended || []).slice(0, 8),
    ...(state.homeData.trending || []).slice(0, 8)
  ].filter(Boolean));

  if (pool.length < 2) return;

  state.heroRotationTimer = window.setInterval(() => {
    const next = pool[Math.floor(Math.random() * pool.length)];
    if (!next) return;
    state.homeData.hero = next;
    renderHero();
  }, 12000);
}

function renderRecommended() {
  if (!el.recommendedGrid) return;
  renderPosterCards(el.recommendedGrid, (state.homeData.recommended || []).slice(0, 24));
}

function renderTrending() {
  if (!el.trendingGrid) return;
  renderPosterCards(el.trendingGrid, (state.homeData.trending || []).slice(0, 24));
}

function renderMegaMenu() {
  if (!el.megaMenuTitle || !el.megaMenuGrid) return;
  const isGenre = state.explorerMode === "genre";
  const options = isGenre ? state.genreOptions : state.countryOptions;
  el.megaMenuTitle.textContent = isGenre ? "Genres" : "Countries";

  if (!options.length) {
    el.megaMenuGrid.innerHTML = "";
    return;
  }

  el.megaMenuGrid.innerHTML = options.map((entry) => {
    const value = isGenre ? entry.id : entry.code;
    const label = entry.name;
    return `
    <button class="mega-menu-item" type="button" data-mode="${state.explorerMode}" data-value="${escapeHtml(value)}" data-name="${escapeHtml(label)}">
      ${escapeHtml(label)}
    </button>
  `;
  }).join("");

  [...el.megaMenuGrid.querySelectorAll(".mega-menu-item")].forEach((node) => {
    node.addEventListener("click", () => {
      openBrowsePage(node.dataset.mode, node.dataset.value, node.dataset.name);
      closeMegaMenu();
    });
  });
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
    setAuthHint("Sign in is currently unavailable.");
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
      if (session?.user) {
        const accountAvatarId = normalizeAvatarId(session.user.user_metadata?.avatarId || selectedAvatarId);
        if (session.user.user_metadata?.avatarId !== accountAvatarId) {
          persistAvatarChoice(accountAvatarId);
        }
      }
      if (session?.user) {
        pullCloudProgress();
        queueAutoSync(true);
      }
    });

    renderAuthUI();
    if (state.session?.user) {
      await pullCloudProgress();
    }
  } catch {
    setAuthHint("Sign in is currently unavailable.");
  }
}

function renderAuthUI() {
  const signedIn = Boolean(state.session?.user);
  const settingsMode = authModalMode === "settings";
  if (settingsMode) {
    el.signedOutView.setAttribute("hidden", "");
    el.signedInView.removeAttribute("hidden");
  } else {
    el.signedOutView.toggleAttribute("hidden", signedIn);
    el.signedInView.toggleAttribute("hidden", !signedIn);
  }

  if (signedIn) {
    const user = state.session.user;
    el.authUserEmail.textContent = user.user_metadata?.username || user.email || user.id;
    const avatarId = normalizeAvatarId(user.user_metadata?.avatarId || selectedAvatarId);
    selectedAvatarId = avatarId;
    renderAvatarPickers();
    renderActiveAvatar(avatarId);
    renderAccountButton(avatarId, "Account");
    if (el.toggleAuth) el.toggleAuth.title = "Open account menu";
    if (settingsMode) {
      const signedInProfile = el.signedInView.querySelector(".signed-in-profile");
      const signedInHint = el.signedInView.querySelector("#signedInHint");
      if (signedInProfile) signedInProfile.setAttribute("hidden", "");
      if (signedInHint) signedInHint.setAttribute("hidden", "");
      const authTitle = el.authModal?.querySelector("#authTitle");
      if (authTitle) authTitle.textContent = "Settings";
    } else {
      const signedInProfile = el.signedInView.querySelector(".signed-in-profile");
      const signedInHint = el.signedInView.querySelector("#signedInHint");
      if (signedInProfile) signedInProfile.removeAttribute("hidden");
      if (signedInHint) signedInHint.removeAttribute("hidden");
      const authTitle = el.authModal?.querySelector("#authTitle");
      if (authTitle) authTitle.textContent = "Welcome Back";
    }
    setAuthHint("Welcome back.");
    el.signedInHint.textContent = "You are signed in.";
  } else {
    const avatarId = normalizeAvatarId(selectedAvatarId);
    renderActiveAvatar(avatarId);
    renderAccountButton(avatarId, "Login");
    closeAccountMenu();
    if (el.toggleAuth) el.toggleAuth.title = "Sign in";
    setAuthHint("Sign in to save your lists.");
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

  await persistAvatarChoice(selectedAvatarId);
  setAuthHint("Signed in.");
  closeAuthModal();
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
    options: isEmail ? { data: { avatarId: normalizeAvatarId(selectedAvatarId) } } : { data: { username: identifier, avatarId: normalizeAvatarId(selectedAvatarId) } }
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

function onAuthEnter(event) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  signIn();
}

function normalizeAvatarId(value) {
  const fallback = avatarOptions[0]?.id || "orbit";
  return avatarOptions.some((option) => option.id === value) ? value : fallback;
}

function renderAvatarPickers() {
  const containers = [el.avatarPicker, el.signedInAvatarPicker].filter(Boolean);
  if (!containers.length) return;

  const activeId = normalizeAvatarId(selectedAvatarId);
  containers.forEach((container) => {
    container.innerHTML = avatarOptions.map((avatar) => `
      <button class="avatar-option${avatar.id === activeId ? " active" : ""}" type="button" data-avatar="${avatar.id}" aria-label="Select ${avatar.label} avatar">
        <span class="avatar-swatch" style="--avatar-color:${avatar.color}"></span>
        <span>${avatar.label}</span>
      </button>
    `).join("");

    [...container.querySelectorAll(".avatar-option")].forEach((node) => {
      node.addEventListener("click", async () => {
        selectedAvatarId = normalizeAvatarId(node.dataset.avatar);
        localStorage.setItem("cinerune:avatar-choice", JSON.stringify(selectedAvatarId));
        renderAvatarPickers();
        renderActiveAvatar(selectedAvatarId);
        await persistAvatarChoice(selectedAvatarId);
      });
    });
  });
}

function renderActiveAvatar(avatarId) {
  if (!el.accountAvatar) return;
  const avatar = avatarOptions.find((option) => option.id === normalizeAvatarId(avatarId)) || avatarOptions[0];
  el.accountAvatar.src = avatarDataUri(avatar);
  el.accountAvatar.alt = `${avatar.label} avatar`;
}

function renderAccountButton(avatarId, label) {
  const avatar = avatarOptions.find((option) => option.id === normalizeAvatarId(avatarId)) || avatarOptions[0];
  if (el.authAvatarThumb) {
    el.authAvatarThumb.src = avatarDataUri(avatar);
    el.authAvatarThumb.alt = `${avatar.label} avatar`;
  }
  if (el.authButtonLabel) {
    el.authButtonLabel.textContent = label;
  }
}

function avatarDataUri(avatar) {
  const safeLabel = escapeHtml(avatar.label);
  const safeColor = escapeHtml(avatar.color);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="${safeLabel}">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="${safeColor}" stop-opacity="1" />
          <stop offset="100%" stop-color="#0b1425" stop-opacity="1" />
        </linearGradient>
      </defs>
      <rect width="128" height="128" rx="28" fill="url(#g)" />
      <circle cx="64" cy="52" r="22" fill="rgba(255,255,255,0.18)" />
      <path d="M28 108c8-18 24-28 36-28s28 10 36 28" fill="rgba(255,255,255,0.14)" />
      <text x="64" y="86" fill="#ffffff" font-size="22" font-family="Outfit, Arial, sans-serif" text-anchor="middle">${safeLabel.slice(0, 2).toUpperCase()}</text>
    </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

async function persistAvatarChoice(avatarId) {
  const normalized = normalizeAvatarId(avatarId);
  selectedAvatarId = normalized;
  localStorage.setItem("cinerune:avatar-choice", JSON.stringify(normalized));

  if (!state.session?.user || !state.supabase) return;

  try {
    await state.supabase.auth.updateUser({ data: { avatarId: normalized } });
  } catch {
    // ignore avatar sync errors
  }
}

function toggleAccountMenu(forceOpen) {
  if (!el.accountMenu) return;
  const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : el.accountMenu.hasAttribute("hidden");
  if (shouldOpen) {
    el.accountMenu.removeAttribute("hidden");
    el.toggleAuth?.classList.add("active");
  } else {
    closeAccountMenu();
  }
}

function closeAccountMenu() {
  if (!el.accountMenu) return;
  el.accountMenu.setAttribute("hidden", "");
  el.toggleAuth?.classList.remove("active");
}

function openAuthModal(_settingsMode = false) {
  if (!el.authModal) return;
  authModalMode = _settingsMode ? "settings" : "login";
  el.authModal.removeAttribute("hidden");
  renderAuthUI();
}

async function syncProgressToCloud() {
  if (!state.session?.user || !state.supabase) {
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
    return;
  }

  const { error } = await state.supabase
    .from("watch_progress")
    .upsert(rows, { onConflict: "user_id,media_type,content_id,season_number,episode_number" });

  if (error) {
    setStatus("Could not save progress right now.");
    return;
  }

  state.lastSyncAt = Date.now();
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
    setStatus("Could not load saved progress.");
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
  queueAutoSync(true);
}

function renderSearchSuggestions(items) {
  if (!el.searchSuggestions) return;
  const top = (items || []).slice(0, 8);
  if (!top.length) {
    hideSearchSuggestions();
    return;
  }

  el.searchSuggestions.innerHTML = top.map((item, index) => {
    const type = item.mediaType === "movie" ? "Movie" : "TV";
    const subtitle = [type, item.year, item.popularity ? `Popularity ${Math.round(item.popularity)}` : ""]
      .filter(Boolean)
      .join(" | ");
    const poster = item.poster || "";
    return `
      <button class="search-suggestion" type="button" data-id="${item.id}" data-type="${item.mediaType}" style="animation-delay:${index * 35}ms">
        <img class="search-suggestion-poster" src="${escapeHtml(poster)}" alt="${escapeHtml(item.title)} poster" loading="lazy" decoding="async" />
        <span>
          <span class="search-suggestion-title">${escapeHtml(item.title)}</span>
          <span class="search-suggestion-sub">${escapeHtml(subtitle)}</span>
        </span>
      </button>
    `;
  }).join("");

  [...el.searchSuggestions.querySelectorAll(".search-suggestion")].forEach((node) => {
    node.addEventListener("click", () => {
      openWatchPage(Number(node.dataset.id), node.dataset.type, 1, 1);
    });
  });

  el.searchSuggestions.removeAttribute("hidden");
}

function hideSearchSuggestions() {
  if (!el.searchSuggestions) return;
  el.searchSuggestions.setAttribute("hidden", "");
  el.searchSuggestions.innerHTML = "";
}

function renderSearchResults(items) {
  if (!el.searchResultsSection || !el.searchResultsGrid) return;
  const topResults = (items || []).slice(0, 16);
  if (!topResults.length) {
    hideSearchResults();
    return;
  }

  el.searchResultsSection.removeAttribute("hidden");
  renderPosterCards(el.searchResultsGrid, topResults);
}

function hideSearchResults() {
  if (!el.searchResultsSection || !el.searchResultsGrid) return;
  el.searchResultsSection.setAttribute("hidden", "");
  el.searchResultsGrid.innerHTML = "";
}

function queueAutoSync(immediate = false) {
  if (!state.session?.user || !state.supabase) return;

  const minGapMs = 15000;
  const elapsed = Date.now() - state.lastSyncAt;
  const delay = immediate ? 0 : Math.max(2000, minGapMs - elapsed);

  if (state.autoSyncTimer) {
    clearTimeout(state.autoSyncTimer);
  }

  state.autoSyncTimer = window.setTimeout(() => {
    state.autoSyncTimer = null;
    syncProgressToCloud();
  }, delay);
}

function setStatus(message) {
  void message;
}

function setAuthHint(message) {
  el.authHint.textContent = message;
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

  const host = String(window.location.hostname || "").toLowerCase();
  const isLocalHost = host === "localhost"
    || host === "127.0.0.1"
    || host === "0.0.0.0"
    || host.endsWith(".local")
    || /^\d+\.\d+\.\d+\.\d+$/.test(host);

  const isKnownProductionHost = host.endsWith("workers.dev") || host.endsWith("netlify.app");

  if (isLocalHost || !isKnownProductionHost) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    }).catch(() => {});

    if (window.caches?.keys) {
      caches.keys().then((keys) => {
        keys.forEach((key) => {
          if (key.startsWith("cinerune-static-")) {
            caches.delete(key);
          }
        });
      }).catch(() => {});
    }

    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

function cssEscape(value) {
  return String(value || "").replaceAll('"', '\\"');
}

function openBrowsePage(mode, value, name) {
  const url = new URL("./browse.html", window.location.href);
  url.searchParams.set("mode", mode === "country" ? "country" : "genre");
  url.searchParams.set("value", String(value || ""));
  if (name) url.searchParams.set("name", String(name));
  window.location.href = url.toString();
}

function dedupeExplorerOptions(items, key) {
  const map = new Map();
  items.forEach((item) => {
    const value = String(item?.[key] || "");
    if (!value) return;
    if (!map.has(value)) map.set(value, item);
  });
  return [...map.values()];
}

function dedupeById(items) {
  const map = new Map();
  items.forEach((item) => {
    map.set(`${item.mediaType}:${item.id}`, item);
  });
  return [...map.values()];
}

function closeAuthModal() {
  if (!el.authModal) return;
  el.authModal.setAttribute("hidden", "");
}

function openMegaMenu() {
  if (!el.megaMenuPanel) return;
  el.megaMenuPanel.removeAttribute("hidden");
}

function closeMegaMenu() {
  if (!el.megaMenuPanel) return;
  el.megaMenuPanel.setAttribute("hidden", "");
}
