import {
  initTmdb,
  fetchGenreOptions,
  fetchCountryOptions,
  fetchItemsByIds,
  titleById,
  posterById
} from "./catalog.js?v=20260427c";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const bookmarksBaseKey = "cinerune:bookmarks";

function getBookmarksKey(session) {
  const userId = session?.user?.id ? String(session.user.id) : "";
  return userId ? `${bookmarksBaseKey}:user:${userId}` : `${bookmarksBaseKey}:guest`;
}

const el = {
  listsGenreExplorer: document.getElementById("listsGenreExplorer"),
  listsCountryExplorer: document.getElementById("listsCountryExplorer"),
  listsMegaMenuPanel: document.getElementById("listsMegaMenuPanel"),
  listsMegaMenuTitle: document.getElementById("listsMegaMenuTitle"),
  listsMegaMenuGrid: document.getElementById("listsMegaMenuGrid"),
  listsStatus: document.getElementById("listsStatus"),
  listWatching: document.getElementById("listWatching"),
  listWatched: document.getElementById("listWatched"),
  listPlan: document.getElementById("listPlan"),
  listDropped: document.getElementById("listDropped"),
  posterCardTemplate: document.getElementById("posterCardTemplate")
};

const state = {
  supabase: null,
  session: null,
  genreOptions: [],
  countryOptions: [],
  explorerMode: "genre"
};

boot();

async function boot() {
  initTmdb({
    apiKey: String(window.CINERUNE_CONFIG?.tmdbApiKey || "").trim(),
    readAccessToken: String(window.CINERUNE_CONFIG?.tmdbReadAccessToken || "").trim(),
    language: String(window.CINERUNE_CONFIG?.tmdbLanguage || "en-US").trim()
  });

  bindMegaMenu();
  const [genresResult, countriesResult] = await Promise.allSettled([
    fetchGenreOptions(),
    fetchCountryOptions()
  ]);
  state.genreOptions = genresResult.status === "fulfilled" ? [...(genresResult.value.movie || []), ...(genresResult.value.tv || [])] : [];
  state.countryOptions = countriesResult.status === "fulfilled" ? (countriesResult.value || []) : [];

  await initAuth();

  const bookmarks = Object.values(readJson(getBookmarksKey(state.session), {}))
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));

  if (!bookmarks.length) {
    el.listsStatus.textContent = "No saved titles yet.";
    renderEmpty(el.listWatching);
    renderEmpty(el.listWatched);
    renderEmpty(el.listPlan);
    renderEmpty(el.listDropped);
    return;
  }

  const hydrated = await hydrateBookmarks(bookmarks);

  renderList(el.listWatching, hydrated.filter((item) => item.status === "watching"));
  renderList(el.listWatched, hydrated.filter((item) => item.status === "watched"));
  renderList(el.listPlan, hydrated.filter((item) => item.status === "plan"));
  renderList(el.listDropped, hydrated.filter((item) => item.status === "dropped"));

  el.listsStatus.textContent = `${hydrated.length} saved title${hydrated.length === 1 ? "" : "s"}.`;
}

function bindMegaMenu() {
  if (el.listsGenreExplorer) {
    el.listsGenreExplorer.addEventListener("click", () => {
      state.explorerMode = "genre";
      renderListsMegaMenu();
      openListsMegaMenu();
    });
  }

  if (el.listsCountryExplorer) {
    el.listsCountryExplorer.addEventListener("click", () => {
      state.explorerMode = "country";
      renderListsMegaMenu();
      openListsMegaMenu();
    });
  }

  document.addEventListener("click", (event) => {
    if (!el.listsMegaMenuPanel || el.listsMegaMenuPanel.hasAttribute("hidden")) return;
    const clickedToggle = el.listsGenreExplorer?.contains(event.target) || el.listsCountryExplorer?.contains(event.target);
    const clickedInside = el.listsMegaMenuPanel.contains(event.target);
    if (!clickedToggle && !clickedInside) {
      closeListsMegaMenu();
    }
  });
}

function renderListsMegaMenu() {
  if (!el.listsMegaMenuTitle || !el.listsMegaMenuGrid) return;
  const isGenre = state.explorerMode === "genre";
  const options = isGenre ? state.genreOptions : state.countryOptions;
  el.listsMegaMenuTitle.textContent = isGenre ? "Genres" : "Countries";
  if (!options.length) {
    el.listsMegaMenuGrid.innerHTML = "";
    return;
  }

  el.listsMegaMenuGrid.innerHTML = options.map((entry) => {
    const value = isGenre ? entry.id : entry.code;
    const label = entry.name;
    return `
      <button class="mega-menu-item" type="button" data-mode="${state.explorerMode}" data-value="${escapeHtml(value)}" data-name="${escapeHtml(label)}">
        ${escapeHtml(label)}
      </button>
    `;
  }).join("");

  [...el.listsMegaMenuGrid.querySelectorAll(".mega-menu-item")].forEach((node) => {
    node.addEventListener("click", () => {
      openBrowsePage(node.dataset.mode, node.dataset.value, node.dataset.name);
      closeListsMegaMenu();
    });
  });
}

function openListsMegaMenu() {
  if (!el.listsMegaMenuPanel) return;
  el.listsMegaMenuPanel.removeAttribute("hidden");
}

function closeListsMegaMenu() {
  if (!el.listsMegaMenuPanel) return;
  el.listsMegaMenuPanel.setAttribute("hidden", "");
}

function openBrowsePage(mode, value, name) {
  const url = new URL("./browse.html", window.location.href);
  url.searchParams.set("mode", mode === "country" ? "country" : "genre");
  url.searchParams.set("value", String(value || ""));
  if (name) url.searchParams.set("name", String(name));
  window.location.href = url.toString();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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
  } catch {
    state.supabase = null;
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

function renderList(container, entries) {
  if (!entries.length) {
    renderEmpty(container);
    return;
  }

  container.innerHTML = "";
  const fragment = document.createDocumentFragment();

  entries.forEach((item) => {
    if (!item.poster) return;

    const node = el.posterCardTemplate.content.firstElementChild.cloneNode(true);
    const button = node.querySelector(".poster-btn");
    const image = node.querySelector(".poster-img");
    const title = node.querySelector(".poster-title");
    const sub = node.querySelector(".poster-sub");

    image.src = item.poster;
    image.alt = `${item.title} poster`;
    title.textContent = item.title;
    sub.textContent = [item.mediaType === "movie" ? "Movie" : "TV", item.year].filter(Boolean).join(" | ");

    button.addEventListener("click", () => {
      openWatchPage(item.id, item.mediaType);
    });

    fragment.appendChild(node);
  });

  container.appendChild(fragment);
}

function renderEmpty(container) {
  container.innerHTML = '<p class="tiny muted">Empty</p>';
}

function openWatchPage(id, mediaType) {
  const url = new URL("./watch.html", window.location.href);
  url.searchParams.set("id", String(id));
  url.searchParams.set("type", mediaType === "tv" ? "tv" : "movie");
  if (mediaType === "tv") {
    url.searchParams.set("s", "1");
    url.searchParams.set("e", "1");
  }
  window.location.href = url.toString();
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
