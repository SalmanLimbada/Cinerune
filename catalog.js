let tmdbConfig = {
  apiKey: "",
  readAccessToken: "",
  language: "en-US"
};

const itemCache = new Map();
const seasonEpisodeCache = new Map();

export let catalog = [];

export function initTmdb(config = {}) {
  tmdbConfig = {
    apiKey: String(config.apiKey || "").trim(),
    readAccessToken: String(config.readAccessToken || "").trim(),
    language: String(config.language || "en-US").trim() || "en-US"
  };
}

export function getItemById(id, mediaType) {
  const key = `${mediaType}:${Number(id)}`;
  return itemCache.get(key) || null;
}

export function titleById(id, mediaType) {
  return getItemById(id, mediaType)?.title || null;
}

export function posterById(id, mediaType) {
  return getItemById(id, mediaType)?.poster || null;
}

export function seasonCount(tvId) {
  const item = getItemById(tvId, "tv");
  return Number(item?.totalSeasons || 1);
}

export async function episodeCount(tvId, season) {
  const key = `${Number(tvId)}:${Number(season)}`;
  if (seasonEpisodeCache.has(key)) return seasonEpisodeCache.get(key);

  try {
    const data = await tmdbRequest(`/tv/${Number(tvId)}/season/${Number(season)}`);
    const count = Number(data?.episodes?.length || 0) || 10;
    seasonEpisodeCache.set(key, count);
    return count;
  } catch {
    return 10;
  }
}

export async function fetchHomeCatalog() {
  const [trendingAll, trendingTv, popularMovies, nowPlaying] = await Promise.all([
    tmdbRequest("/trending/all/day"),
    tmdbRequest("/trending/tv/week"),
    tmdbRequest("/movie/popular"),
    tmdbRequest("/movie/now_playing")
  ]);

  const hero = normalizeItem((trendingAll.results || []).find((item) => item.backdrop_path && item.poster_path));
  const recommended = normalizeList(trendingTv.results || []);
  const movies = normalizeList(popularMovies.results || []);
  const latestMovies = normalizeList(nowPlaying.results || []);

  const combined = [...recommended, ...movies, ...latestMovies, ...(hero ? [hero] : [])];
  cacheItems(combined);

  catalog = dedupeByKey(combined);

  return {
    hero,
    recommended,
    movies,
    latestMovies
  };
}

export async function searchCatalog(query) {
  const text = String(query || "").trim();
  if (!text) return { movies: [], tv: [] };

  const data = await tmdbRequest("/search/multi", { query: text, include_adult: "false" });
  const normalized = normalizeList(data.results || []);
  cacheItems(normalized);

  return {
    movies: normalized.filter((item) => item.mediaType === "movie"),
    tv: normalized.filter((item) => item.mediaType === "tv")
  };
}

export async function fetchItemDetailsById(id, mediaType) {
  const normalizedType = mediaType === "tv" ? "tv" : "movie";
  const key = `${normalizedType}:${Number(id)}`;
  const cached = itemCache.get(key);
  if (cached?.plot && cached?.runtime && cached?.genre) return cached;

  const data = await tmdbRequest(`/${normalizedType}/${Number(id)}`);
  const item = normalizeItem({ ...data, media_type: normalizedType });
  if (item) {
    cacheItems([item]);
  }
  return item;
}

export async function fetchRelatedById(id, mediaType) {
  const normalizedType = mediaType === "tv" ? "tv" : "movie";
  const data = await tmdbRequest(`/${normalizedType}/${Number(id)}/recommendations`);
  const items = normalizeList(data.results || []).slice(0, 16);
  cacheItems(items);
  return items;
}

export async function fetchItemsByIds(entries = []) {
  const requests = entries.map(async (entry) => {
    const mediaType = entry.mediaType === "tv" ? "tv" : "movie";
    const id = Number(entry.id || 0);
    if (!id) return null;

    const cached = getItemById(id, mediaType);
    if (cached) return cached;

    try {
      return await fetchItemDetailsById(id, mediaType);
    } catch {
      return null;
    }
  });

  const items = (await Promise.all(requests)).filter(Boolean);
  cacheItems(items);
  return items;
}

function normalizeList(results) {
  return results
    .map((item) => normalizeItem(item))
    .filter((item) => item && item.poster && item.title);
}

function normalizeItem(item) {
  if (!item) return null;

  const mediaType = item.media_type === "tv" || (!item.title && item.name) ? "tv" : "movie";
  const id = Number(item.id || 0);
  if (!id) return null;

  const title = mediaType === "movie" ? item.title : item.name;
  const date = mediaType === "movie" ? item.release_date : item.first_air_date;
  const year = parseYear(date);
  const posterPath = item.poster_path || null;
  const backdropPath = item.backdrop_path || null;
  const genre = Array.isArray(item.genres)
    ? item.genres.map((entry) => entry.name).join(", ")
    : Array.isArray(item.genre_ids)
      ? mapGenreIds(item.genre_ids, mediaType)
      : "";

  const runtimeMinutes = mediaType === "movie"
    ? Number(item.runtime || 0)
    : Number((item.episode_run_time || [])[0] || 0);

  return {
    id,
    mediaType,
    title: title || `Title ${id}`,
    year,
    poster: posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : "",
    backdrop: backdropPath ? `https://image.tmdb.org/t/p/original${backdropPath}` : "",
    genre,
    runtime: runtimeMinutes > 0 ? `${runtimeMinutes} min` : "",
    plot: String(item.overview || "").trim(),
    rating: Number.isFinite(Number(item.vote_average)) && Number(item.vote_average) > 0
      ? Number(item.vote_average).toFixed(1)
      : "",
    released: date || "",
    totalSeasons: Number(item.number_of_seasons || 0) || undefined,
    defaultSeason: 1,
    defaultEpisode: 1
  };
}

function cacheItems(items) {
  items.forEach((item) => {
    const key = `${item.mediaType}:${item.id}`;
    const previous = itemCache.get(key) || {};
    itemCache.set(key, { ...previous, ...item });
  });
}

async function tmdbRequest(path, params = {}) {
  if (!tmdbConfig.apiKey && !tmdbConfig.readAccessToken) {
    throw new Error("TMDB config missing");
  }

  const url = new URL(`https://api.themoviedb.org/3${path}`);
  url.searchParams.set("language", tmdbConfig.language);
  if (tmdbConfig.apiKey) {
    url.searchParams.set("api_key", tmdbConfig.apiKey);
  }

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const headers = { Accept: "application/json" };
  if (tmdbConfig.readAccessToken) {
    headers.Authorization = `Bearer ${tmdbConfig.readAccessToken}`;
  }

  const response = await fetch(url.toString(), {
    headers,
    cache: "force-cache"
  });

  if (!response.ok) {
    throw new Error(`TMDB request failed (${response.status})`);
  }

  return response.json();
}

function parseYear(value) {
  const match = String(value || "").match(/\d{4}/);
  return match ? Number(match[0]) : null;
}

function dedupeByKey(items) {
  const map = new Map();
  items.forEach((item) => {
    map.set(`${item.mediaType}:${item.id}`, item);
  });
  return [...map.values()];
}

function mapGenreIds(ids, mediaType) {
  const movieGenres = {
    28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime", 99: "Documentary",
    18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
    9648: "Mystery", 10749: "Romance", 878: "Sci-Fi", 10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western"
  };
  const tvGenres = {
    10759: "Action", 16: "Animation", 35: "Comedy", 80: "Crime", 99: "Documentary", 18: "Drama",
    10751: "Family", 10762: "Kids", 9648: "Mystery", 10763: "News", 10764: "Reality", 10765: "Sci-Fi",
    10766: "Soap", 10767: "Talk", 10768: "War", 37: "Western"
  };

  const map = mediaType === "tv" ? tvGenres : movieGenres;
  const names = ids.map((id) => map[id]).filter(Boolean);
  return names.slice(0, 3).join(", ");
}
