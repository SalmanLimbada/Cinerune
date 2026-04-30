const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_BODY_BYTES = 4096;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "*";

    if (!url.pathname.startsWith("/api/")) {
      if (env.ASSETS?.fetch) {
        return env.ASSETS.fetch(request);
      }
      return new Response("Frontend assets are not configured.", { status: 500 });
    }

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }), origin);
    }

    try {
      if (url.pathname.startsWith("/api/tmdb/")) {
        return withCors(await handleTmdbProxy(request, env, url), origin);
      }

      if (url.pathname === "/api/auth/login") {
        return withCors(await handleAuthLogin(request, env), origin);
      }

      if (url.pathname === "/api/auth/signup") {
        return withCors(await handleAuthSignup(request, env), origin);
      }

      if (url.pathname === "/api/auth/refresh") {
        return withCors(await handleAuthRefresh(request, env), origin);
      }

      if (url.pathname === "/api/auth/logout") {
        return withCors(await handleAuthLogout(request, env), origin);
      }

      if (url.pathname === "/api/auth/update") {
        return withCors(await handleAuthUpdate(request, env), origin);
      }

      if (url.pathname === "/api/progress/pull") {
        return withCors(await handleProgressPull(request, env, url), origin);
      }

      if (url.pathname === "/api/progress/push") {
        return withCors(await handleProgressPush(request, env), origin);
      }

      return withCors(jsonResponse({ error: "Not found" }, 404), origin);
    } catch (error) {
      return withCors(jsonResponse({ error: error?.message || "Server error" }, 500), origin);
    }
  }
};

async function handleTmdbProxy(request, env, url) {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!env.TMDB_READ_TOKEN) {
    return jsonResponse({ error: "TMDB token missing" }, 500);
  }

  const tmdbPath = url.pathname.replace("/api/tmdb", "");
  const tmdbUrl = new URL(`https://api.themoviedb.org/3${tmdbPath}`);
  url.searchParams.forEach((value, key) => {
    tmdbUrl.searchParams.set(key, value);
  });

  const response = await fetch(tmdbUrl.toString(), {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${env.TMDB_READ_TOKEN}`
    }
  });

  return proxyJson(response);
}

async function handleAuthLogin(request, env) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const payload = await readJson(request);
  const identifier = normalizeIdentifier(payload?.identifier);
  const password = String(payload?.password || "");

  if (!identifier || !isValidPassword(password)) {
    return jsonResponse({ error: "Invalid credentials." }, 400);
  }

  const limiterKey = buildLimiterKey(request, "login", identifier);
  const limited = await checkRateLimit(env, limiterKey);
  if (limited.blocked) {
    return jsonResponse({ error: "Too many attempts. Try again later." }, 429, {
      "Retry-After": String(limited.retryAfter)
    });
  }

  const email = identifier.includes("@") ? identifier : `${identifier}@cinerune.user`;
  return proxySupabaseAuth(env, "/auth/v1/token?grant_type=password", {
    email,
    password
  });
}

async function handleAuthSignup(request, env) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const payload = await readJson(request);
  const username = normalizeUsername(payload?.username);
  const password = String(payload?.password || "");
  const avatarId = normalizeAvatarId(payload?.avatarId);

  if (!username || !isValidPassword(password)) {
    return jsonResponse({ error: "Invalid sign up details." }, 400);
  }

  const limiterKey = buildLimiterKey(request, "signup", username);
  const limited = await checkRateLimit(env, limiterKey);
  if (limited.blocked) {
    return jsonResponse({ error: "Too many attempts. Try again later." }, 429, {
      "Retry-After": String(limited.retryAfter)
    });
  }

  return proxySupabaseAuth(env, "/auth/v1/signup", {
    email: `${username}@cinerune.user`,
    password,
    data: { username, avatarId }
  });
}

async function handleAuthRefresh(request, env) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const payload = await readJson(request);
  const refreshToken = String(payload?.refresh_token || "");
  if (!refreshToken) {
    return jsonResponse({ error: "Missing refresh token." }, 400);
  }

  return proxySupabaseAuth(env, "/auth/v1/token?grant_type=refresh_token", {
    refresh_token: refreshToken
  });
}

async function handleAuthLogout(request, env) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const token = getBearerToken(request);
  if (!token) {
    return jsonResponse({ error: "Missing token." }, 401);
  }

  return proxySupabaseAuth(env, "/auth/v1/logout", null, token);
}

async function handleAuthUpdate(request, env) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const token = getBearerToken(request);
  if (!token) {
    return jsonResponse({ error: "Missing token." }, 401);
  }

  const payload = await readJson(request);
  const avatarId = normalizeAvatarId(payload?.avatarId);
  if (!avatarId) {
    return jsonResponse({ error: "Invalid payload." }, 400);
  }

  return proxySupabaseAuth(env, "/auth/v1/user", { data: { avatarId } }, token, "PUT");
}

async function handleProgressPull(request, env, url) {
  if (request.method !== "GET" && request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const token = getBearerToken(request);
  if (!token) {
    return jsonResponse({ error: "Missing token." }, 401);
  }

  const limitParam = request.method === "POST"
    ? Number((await readJson(request))?.limit || 500)
    : Number(url.searchParams.get("limit") || 500);
  const limit = Math.max(1, Math.min(500, limitParam));

  const apiUrl = new URL(`${env.SUPABASE_URL}/rest/v1/watch_progress`);
  apiUrl.searchParams.set("select", "media_type,content_id,season_number,episode_number,timestamp_seconds,duration_seconds,progress_percent,updated_at");
  apiUrl.searchParams.set("order", "updated_at.desc");
  apiUrl.searchParams.set("limit", String(limit));

  const response = await fetch(apiUrl.toString(), {
    headers: supabaseHeaders(env, token)
  });

  return proxyJson(response);
}

async function handleProgressPush(request, env) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const token = getBearerToken(request);
  if (!token) {
    return jsonResponse({ error: "Missing token." }, 401);
  }

  const payload = await readJson(request);
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];

  if (!rows.length || rows.length > 240) {
    return jsonResponse({ error: "Invalid payload." }, 400);
  }

  const apiUrl = `${env.SUPABASE_URL}/rest/v1/watch_progress`;
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      ...supabaseHeaders(env, token),
      Prefer: "resolution=merge-duplicates,return=minimal",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(rows)
  });

  if (!response.ok) {
    return proxyJson(response);
  }

  return jsonResponse({ ok: true });
}

function buildLimiterKey(request, action, identifier) {
  const ip = request.headers.get("CF-Connecting-IP")
    || request.headers.get("X-Forwarded-For")
    || "unknown";
  return `rl:${action}:${ip}:${identifier}`;
}

async function checkRateLimit(env, key) {
  const now = Date.now();
  const existing = await env.RATE_LIMIT_KV.get(key, "json");

  if (!existing || now >= existing.resetAt) {
    const record = { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
    await env.RATE_LIMIT_KV.put(key, JSON.stringify(record), {
      expirationTtl: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)
    });
    return { blocked: false, retryAfter: 0 };
  }

  if (existing.count >= RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((existing.resetAt - now) / 1000);
    return { blocked: true, retryAfter: Math.max(1, retryAfter) };
  }

  const record = { ...existing, count: existing.count + 1 };
  await env.RATE_LIMIT_KV.put(key, JSON.stringify(record), {
    expirationTtl: Math.ceil((existing.resetAt - now) / 1000)
  });

  return { blocked: false, retryAfter: 0 };
}

async function proxySupabaseAuth(env, path, payload, token, method = "POST") {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return jsonResponse({ error: "Supabase config missing." }, 500);
  }

  const response = await fetch(`${env.SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: token ? `Bearer ${token}` : `Bearer ${env.SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json"
    },
    body: payload ? JSON.stringify(payload) : undefined
  });

  return proxyJson(response);
}

function supabaseHeaders(env, token) {
  return {
    apikey: env.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    Accept: "application/json"
  };
}

function getBearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

function normalizeIdentifier(value) {
  const trimmed = String(value || "").trim().toLowerCase();
  if (!trimmed || trimmed.length > 80) return "";
  if (trimmed.includes("@")) {
    return /.+@.+\..+/.test(trimmed) ? trimmed : "";
  }
  return /^[a-z0-9._-]{3,24}$/.test(trimmed) ? trimmed : "";
}

function normalizeUsername(value) {
  const trimmed = String(value || "").trim().toLowerCase();
  return /^[a-z0-9._-]{3,24}$/.test(trimmed) ? trimmed : "";
}

function normalizeAvatarId(value) {
  const trimmed = String(value || "").trim();
  return trimmed && trimmed.length <= 40 ? trimmed : "";
}

function isValidPassword(value) {
  return typeof value === "string" && value.length >= 6 && value.length <= 128;
}

async function readJson(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length && length > MAX_BODY_BYTES) {
    throw new Error("Payload too large");
  }

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    throw new Error("Payload too large");
  }

  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON");
  }
}

function jsonResponse(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers
    }
  });
}

async function proxyJson(response) {
  const text = await response.text();
  return new Response(text || "{}", {
    status: response.status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function withCors(response, origin) {
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.headers.set("Vary", "Origin");
  return response;
}
