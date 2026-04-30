import {
  initTmdb,
  fetchTopRated
} from "./catalog.js?v=20260427c";

const query = new URLSearchParams(window.location.search);
const mediaType = query.get("type") === "tv" ? "tv" : "movie";

const el = {
  topRatedTitle: document.getElementById("topRatedTitle"),
  topRatedStatus: document.getElementById("topRatedStatus"),
  topRatedGrid: document.getElementById("topRatedGrid"),
  topRatedMoviesLink: document.getElementById("topRatedMoviesLink"),
  topRatedTvLink: document.getElementById("topRatedTvLink"),
  posterCardTemplate: document.getElementById("posterCardTemplate")
};

boot();

async function boot() {
  initTmdb({
    apiBase: String(window.CINERUNE_CONFIG?.apiBase || "").trim(),
    language: String(window.CINERUNE_CONFIG?.tmdbLanguage || "en-US").trim()
  });

  el.topRatedTitle.textContent = mediaType === "tv" ? "Top Rated TV Shows" : "Top Rated Movies";
  el.topRatedMoviesLink.classList.toggle("active", mediaType === "movie");
  el.topRatedTvLink.classList.toggle("active", mediaType === "tv");

  try {
    const items = await fetchTopRated(mediaType, 3);
    renderPosterCards(items.slice(0, 60));
    el.topRatedStatus.textContent = `${Math.min(items.length, 60)} top rated ${mediaType === "tv" ? "TV shows" : "movies"} right now.`;
  } catch {
    renderPosterCards([]);
    el.topRatedStatus.textContent = "Could not load top rated titles right now.";
  }
}

function renderPosterCards(items) {
  el.topRatedGrid.innerHTML = "";
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
    sub.textContent = [item.mediaType === "movie" ? "Movie" : "TV", item.year, item.rating ? `${item.rating}/10` : ""]
      .filter(Boolean)
      .join(" | ");

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

  el.topRatedGrid.appendChild(fragment);
}
