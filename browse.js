import {
  initTmdb,
  fetchTitlesByGenre,
  fetchTitlesByCountry
} from "./catalog.js?v=20260423b";

const query = new URLSearchParams(window.location.search);
const mode = query.get("mode") === "country" ? "country" : "genre";
const value = String(query.get("value") || "").trim();
const name = String(query.get("name") || "").trim();

const el = {
  browseTitle: document.getElementById("browseTitle"),
  browseMoviesGrid: document.getElementById("browseMoviesGrid"),
  browseTvGrid: document.getElementById("browseTvGrid"),
  posterCardTemplate: document.getElementById("posterCardTemplate")
};

boot();

async function boot() {
  initTmdb({
    apiKey: String(window.CINERUNE_CONFIG?.tmdbApiKey || "").trim(),
    readAccessToken: String(window.CINERUNE_CONFIG?.tmdbReadAccessToken || "").trim(),
    language: String(window.CINERUNE_CONFIG?.tmdbLanguage || "en-US").trim()
  });

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
