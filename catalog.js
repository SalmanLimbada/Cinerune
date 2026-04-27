let tmdbConfig = {
  apiKey: "",
  readAccessToken: "",
  language: "en-US"
};

const itemCache = new Map();
const seasonEpisodeCache = new Map();
const genreCache = {
  movie: null,
  tv: null
};
let countryCache = null;

const fallbackMovieGenres = [
  { id: 28, name: "Action" },
  { id: 12, name: "Adventure" },
  { id: 16, name: "Animation" },
  { id: 35, name: "Comedy" },
  { id: 80, name: "Crime" },
  { id: 18, name: "Drama" },
  { id: 27, name: "Horror" },
  { id: 878, name: "Sci-Fi" },
  { id: 53, name: "Thriller" },
  { id: 10749, name: "Romance" }
];

const fallbackTvGenres = [
  { id: 10759, name: "Action & Adventure" },
  { id: 16, name: "Animation" },
  { id: 35, name: "Comedy" },
  { id: 80, name: "Crime" },
  { id: 99, name: "Documentary" },
  { id: 18, name: "Drama" },
  { id: 9648, name: "Mystery" },
  { id: 10764, name: "Reality" },
  { id: 10765, name: "Sci-Fi & Fantasy" },
  { id: 10768, name: "War & Politics" }
];

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
  const randomPage = 1 + Math.floor(Math.random() * 5);
  const [trendingMovieResult, trendingTvResult, popularMovieResult, popularTvResult] = await Promise.allSettled([
    tmdbRequest("/trending/movie/week", { page: randomPage }),
    tmdbRequest("/trending/tv/week", { page: randomPage }),
    tmdbRequest("/movie/popular", { page: randomPage }),
    tmdbRequest("/tv/popular", { page: randomPage })
  ]);

  const trendingMovies = trendingMovieResult.status === "fulfilled"
    ? normalizeList(trendingMovieResult.value.results || [])
    : [];
  const trendingTv = trendingTvResult.status === "fulfilled"
    ? normalizeList(trendingTvResult.value.results || [])
    : [];

  const popularMovies = popularMovieResult.status === "fulfilled"
    ? normalizeList(popularMovieResult.value.results || [])
    : [];
  const popularTv = popularTvResult.status === "fulfilled"
    ? normalizeList(popularTvResult.value.results || [])
    : [];

  const trendingRaw = dedupeByKey([...trendingMovies, ...trendingTv]);
  const popularRaw = dedupeByKey([...popularMovies, ...popularTv]);

  const recommended = dedupeByKey([
    ...popularRaw,
    ...trendingRaw
  ]).sort((a, b) => Number(b.popularity || 0) - Number(a.popularity || 0));

  const trending = trendingRaw.length
    ? trendingRaw
    : recommended.slice(0, 24);

  const popular = popularRaw.length
    ? popularRaw
    : recommended.slice(0, 24);

  const hero = trending.find((item) => item.backdrop && item.poster)
    || popular.find((item) => item.backdrop && item.poster)
    || trending[0]
    || popular[0]
    || recommended[0]
    || null;

  const combined = [...recommended, ...trending, ...popular, ...(hero ? [hero] : [])];
  cacheItems(combined);

  catalog = dedupeByKey(combined);

  return {
    hero,
    recommended,
    trending,
    popular
  };
}

export async function fetchRecommendedFromHistory(entries = [], limit = 24) {
  const seeds = dedupeHistoryEntries(entries).slice(0, 12);
  if (!seeds.length) return [];

  const hydratedSeeds = (await Promise.all(seeds.map(async (entry) => {
    const mediaType = entry.mediaType === "tv" ? "tv" : "movie";
    const id = Number(entry.id || 0);
    if (!id) return null;

    try {
      return getItemById(id, mediaType) || await fetchItemDetailsById(id, mediaType);
    } catch {
      return getItemById(id, mediaType) || null;
    }
  }))).filter(Boolean);

  if (!hydratedSeeds.length) return [];

  const genreWeights = new Map();
  const seenKeys = new Set(seeds.map((entry) => `${entry.mediaType === "tv" ? "tv" : "movie"}:${Number(entry.id || 0)}`));

  hydratedSeeds.forEach((item, index) => {
    const recencyBoost = Math.max(1, hydratedSeeds.length - index);
    const popularityBoost = Math.max(1, Math.round(Number(item.popularity || 0) / 50));
    const weight = recencyBoost + popularityBoost;
    (item.genreIds || []).forEach((genreId) => {
      genreWeights.set(genreId, (genreWeights.get(genreId) || 0) + weight);
    });
  });

  const topGenres = [...genreWeights.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([genreId]) => genreId);

  if (!topGenres.length) return [];

  const preferredMediaType = pickPreferredMediaType(seeds);
  const requestTypes = preferredMediaType === "mixed"
    ? ["movie", "tv"]
    : [preferredMediaType, preferredMediaType === "movie" ? "tv" : "movie"];

  const requests = [];
  requestTypes.forEach((mediaType) => {
    topGenres.slice(0, 3).forEach((genreId, index) => {
      requests.push(
        tmdbRequest(mediaType === "movie" ? "/discover/movie" : "/discover/tv", {
          with_genres: genreId,
          include_adult: "false",
          sort_by: "popularity.desc",
          page: index + 1
        }).catch(() => ({ results: [] }))
      );
    });
  });

  const responseSets = await Promise.all(requests);
  const candidates = dedupeByKey(responseSets.flatMap((result) => normalizeList(result.results || [])))
    .filter((item) => !seenKeys.has(`${item.mediaType}:${item.id}`))
    .sort((a, b) => scoreRecommendationCandidate(b, genreWeights, preferredMediaType) - scoreRecommendationCandidate(a, genreWeights, preferredMediaType))
    .slice(0, limit);

  cacheItems(candidates);
  return candidates;
}

export async function fetchGenreOptions() {
  const [movieResult, tvResult] = await Promise.allSettled([fetchGenres("movie"), fetchGenres("tv")]);
  const movie = movieResult.status === "fulfilled" && movieResult.value.length
    ? movieResult.value
    : fallbackMovieGenres;
  const tv = tvResult.status === "fulfilled" && tvResult.value.length
    ? tvResult.value
    : fallbackTvGenres;
  return {
    movie,
    tv
  };
}

export async function fetchCountryOptions() {
  if (countryCache) return countryCache;

  let countries = [];
  try {
    const data = await tmdbRequest("/configuration/countries");
    countries = (data || [])
      .map((entry) => ({
        code: String(entry.iso_3166_1 || "").trim().toUpperCase(),
        name: String(entry.english_name || entry.native_name || "").trim()
      }))
      .filter((entry) => entry.code && entry.name)
      .slice(0, 60);
  } catch {
    countries = [
      { code: "US", name: "United States" },
      { code: "GB", name: "United Kingdom" },
      { code: "KR", name: "South Korea" },
      { code: "JP", name: "Japan" },
      { code: "IN", name: "India" },
      { code: "FR", name: "France" },
      { code: "DE", name: "Germany" },
      { code: "ES", name: "Spain" },
      { code: "IT", name: "Italy" },
      { code: "TR", name: "Turkey" }
    ];
  }

  countryCache = countries;
  return countries;
}

export async function fetchTitlesByGenre(genreId, page = 1) {
  const genre = Number(genreId || 0);
  if (!genre) return { movies: [], tv: [] };

  const [movieData, tvData] = await Promise.all([
    tmdbRequest("/discover/movie", {
      with_genres: genre,
      include_adult: "false",
      sort_by: "popularity.desc",
      page
    }),
    tmdbRequest("/discover/tv", {
      with_genres: genre,
      include_adult: "false",
      sort_by: "popularity.desc",
      page
    })
  ]);

  const movies = normalizeList(movieData.results || []);
  const tv = normalizeList(tvData.results || []);
  cacheItems([...movies, ...tv]);
  return { movies, tv };
}

export async function fetchTitlesByCountry(countryCode, page = 1) {
  const code = String(countryCode || "").trim().toUpperCase();
  if (!code) return { movies: [], tv: [] };

  const [movieData, tvData] = await Promise.all([
    tmdbRequest("/discover/movie", {
      region: code,
      include_adult: "false",
      sort_by: "popularity.desc",
      page
    }),
    tmdbRequest("/discover/tv", {
      with_origin_country: code,
      include_adult: "false",
      sort_by: "popularity.desc",
      page
    })
  ]);

  const movies = normalizeList(movieData.results || []);
  const tv = normalizeList(tvData.results || []);
  cacheItems([...movies, ...tv]);
  return { movies, tv };
}

export async function fetchGenreSections() {
  const [movieGenres, tvGenres] = await Promise.all([
    fetchGenres("movie"),
    fetchGenres("tv")
  ]);

  const pickMovie = movieGenres.slice(0, 3);
  const pickTv = tvGenres.slice(0, 3);

  const sectionDefs = [
    ...pickMovie.map((genre) => ({ ...genre, mediaType: "movie" })),
    ...pickTv.map((genre) => ({ ...genre, mediaType: "tv" }))
  ];

  const requests = sectionDefs.map(async (section) => {
    const path = section.mediaType === "movie" ? "/discover/movie" : "/discover/tv";
    const data = await tmdbRequest(path, {
      with_genres: section.id,
      sort_by: "popularity.desc",
      include_adult: "false",
      page: 1
    });

    const items = normalizeList(data.results || []).slice(0, 18);
    cacheItems(items);

    return {
      key: `${section.mediaType}:${section.id}`,
      title: section.mediaType === "movie" ? `${section.name} Movies` : `${section.name} TV Series`,
      mediaType: section.mediaType,
      genreId: section.id,
      items
    };
  });

  return Promise.all(requests);
}

export async function searchCatalog(query) {
  const text = String(query || "").trim();
  if (!text) return { movies: [], tv: [] };

  const data = await tmdbRequest("/search/multi", { query: text, include_adult: "false" });
  const normalized = normalizeList(data.results || [])
    .sort((a, b) => Number(b.popularity || 0) - Number(a.popularity || 0));
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
    .filter((item) => item && item.title && (item.poster || item.backdrop));
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
  const genreIds = Array.isArray(item.genres)
    ? item.genres.map((entry) => Number(entry.id)).filter((id) => id > 0)
    : Array.isArray(item.genre_ids)
      ? item.genre_ids.map((id) => Number(id)).filter((id) => id > 0)
      : [];

  const runtimeMinutes = mediaType === "movie"
    ? Number(item.runtime || 0)
    : Number((item.episode_run_time || [])[0] || 0);

  return {
    id,
    mediaType,
    title: title || `Title ${id}`,
    year,
    poster: posterPath
      ? `https://image.tmdb.org/t/p/w500${posterPath}`
      : backdropPath
        ? `https://image.tmdb.org/t/p/w780${backdropPath}`
        : "",
    backdrop: backdropPath ? `https://image.tmdb.org/t/p/original${backdropPath}` : "",
    genre,
    genreIds,
    runtime: runtimeMinutes > 0 ? `${runtimeMinutes} min` : "",
    plot: String(item.overview || "").trim(),
    rating: Number.isFinite(Number(item.vote_average)) && Number(item.vote_average) > 0
      ? Number(item.vote_average).toFixed(1)
      : "",
    released: date || "",
    popularity: Number(item.popularity || 0),
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

async function fetchGenres(mediaType) {
  const normalized = mediaType === "tv" ? "tv" : "movie";
  if (genreCache[normalized]) return genreCache[normalized];

  let genres = [];
  try {
    const data = await tmdbRequest(`/genre/${normalized}/list`);
    genres = (data?.genres || [])
      .map((genre) => ({ id: Number(genre.id), name: String(genre.name || "").trim() }))
      .filter((genre) => genre.id > 0 && genre.name)
      .slice(0, 20);
  } catch {
    genres = normalized === "tv" ? fallbackTvGenres : fallbackMovieGenres;
  }

  genreCache[normalized] = genres;
  return genres;
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

function dedupeHistoryEntries(entries) {
  const map = new Map();
  entries.forEach((entry) => {
    const mediaType = entry?.mediaType === "tv" ? "tv" : "movie";
    const id = Number(entry?.id || 0);
    if (!id) return;
    const season = Number(entry?.season || 1);
    const episode = Number(entry?.episode || 1);
    const updatedAt = Number(entry?.updatedAt || 0);
    const progress = Number(entry?.progress || 0);
    const score = updatedAt + progress * 1000;
    const key = `${mediaType}:${id}:${mediaType === "tv" ? `${season}:${episode}` : "movie"}`;
    const previous = map.get(key);
    if (!previous || score > previous.score) {
      map.set(key, { ...entry, mediaType, id, score });
    }
  });

  return [...map.values()].sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
}

function pickPreferredMediaType(entries) {
  let movieCount = 0;
  let tvCount = 0;
  entries.forEach((entry) => {
    if (entry.mediaType === "tv") tvCount += 1;
    else movieCount += 1;
  });

  if (movieCount === tvCount) return "mixed";
  return movieCount > tvCount ? "movie" : "tv";
}

function scoreRecommendationCandidate(item, genreWeights, preferredMediaType) {
  const genreScore = (item.genreIds || []).reduce((sum, genreId) => sum + Number(genreWeights.get(genreId) || 0), 0);
  const mediaTypeBoost = preferredMediaType === "mixed" || preferredMediaType === item.mediaType ? 20 : 0;
  return genreScore + mediaTypeBoost + Number(item.popularity || 0);
}
