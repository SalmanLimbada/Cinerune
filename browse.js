import {
  initTmdb,
  fetchGenreOptions,
  fetchCountryOptions,
  fetchTitlesByGenre,
  fetchTitlesByCountry
} from "./catalog.js?v=20260427c";

const query = new URLSearchParams(window.location.search);
const mode = query.get("mode") === "country" ? "country" : "genre";
const value = String(query.get("value") || "").trim();
const name = String(query.get("name") || "").trim();

const el = {
  browseGenreExplorer: document.getElementById("browseGenreExplorer"),
  browseCountryExplorer: document.getElementById("browseCountryExplorer"),
  browseMegaMenuPanel: document.getElementById("browseMegaMenuPanel"),
  browseMegaMenuTitle: document.getElementById("browseMegaMenuTitle"),
  browseMegaMenuGrid: document.getElementById("browseMegaMenuGrid"),
  browseTitle: document.getElementById("browseTitle"),
  browseMoviesGrid: document.getElementById("browseMoviesGrid"),
  browseTvGrid: document.getElementById("browseTvGrid"),
  posterCardTemplate: document.getElementById("posterCardTemplate")
};

const state = {
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

  if (!value) {
    el.browseTitle.textContent = "Browse";
    return;
  }

  el.browseTitle.textContent = `${mode === "country" ? "Country" : "Genre"}: ${name || value}`;

  try {
    const data = mode === "country"
      ? await fetchTitlesByCountry(value, 1)
      : await fetchTitlesByGenre(Number(value), 1);

    renderPosterCards(el.browseMoviesGrid, data.movies || []);
    renderPosterCards(el.browseTvGrid, data.tv || []);
  } catch {
    el.browseMoviesGrid.innerHTML = "";
    el.browseTvGrid.innerHTML = "";
  }
}

function bindMegaMenu() {
  if (el.browseGenreExplorer) {
    el.browseGenreExplorer.addEventListener("click", () => {
      state.explorerMode = "genre";
      renderBrowseMegaMenu();
      openBrowseMegaMenu();
    });
  }

  if (el.browseCountryExplorer) {
    el.browseCountryExplorer.addEventListener("click", () => {
      state.explorerMode = "country";
      renderBrowseMegaMenu();
      openBrowseMegaMenu();
    });
  }

  document.addEventListener("click", (event) => {
    if (!el.browseMegaMenuPanel || el.browseMegaMenuPanel.hasAttribute("hidden")) return;
    const clickedToggle = el.browseGenreExplorer?.contains(event.target) || el.browseCountryExplorer?.contains(event.target);
    const clickedInside = el.browseMegaMenuPanel.contains(event.target);
    if (!clickedToggle && !clickedInside) {
      closeBrowseMegaMenu();
    }
  });
}

function renderBrowseMegaMenu() {
  if (!el.browseMegaMenuTitle || !el.browseMegaMenuGrid) return;
  const isGenre = state.explorerMode === "genre";
  const options = isGenre ? state.genreOptions : state.countryOptions;
  el.browseMegaMenuTitle.textContent = isGenre ? "Genres" : "Countries";
  if (!options.length) {
    el.browseMegaMenuGrid.innerHTML = "";
    return;
  }

  el.browseMegaMenuGrid.innerHTML = options.map((entry) => {
    const value = isGenre ? entry.id : entry.code;
    const label = entry.name;
    return `
      <button class="mega-menu-item" type="button" data-mode="${state.explorerMode}" data-value="${escapeHtml(value)}" data-name="${escapeHtml(label)}">
        ${escapeHtml(label)}
      </button>
    `;
  }).join("");

  [...el.browseMegaMenuGrid.querySelectorAll(".mega-menu-item")].forEach((node) => {
    node.addEventListener("click", () => {
      openBrowsePage(node.dataset.mode, node.dataset.value, node.dataset.name);
      closeBrowseMegaMenu();
    });
  });
}

function openBrowseMegaMenu() {
  if (!el.browseMegaMenuPanel) return;
  el.browseMegaMenuPanel.removeAttribute("hidden");
}

function closeBrowseMegaMenu() {
  if (!el.browseMegaMenuPanel) return;
  el.browseMegaMenuPanel.setAttribute("hidden", "");
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

function renderPosterCards(container, items) {
  container.innerHTML = "";
  const fragment = document.createDocumentFragment();

  items.slice(0, 24).forEach((item) => {
    if (!item?.poster) return;

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
      const url = new URL("./watch.html", window.location.href);
      url.searchParams.set("id", String(item.id));
      url.searchParams.set("type", item.mediaType === "tv" ? "tv" : "movie");
      if (item.mediaType === "tv") {
        url.searchParams.set("s", "1");
        url.searchParams.set("e", "1");
      }
      window.location.href = url.toString();
    });

    fragment.appendChild(node);
  });

  container.appendChild(fragment);
}
