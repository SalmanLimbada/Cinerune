const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_BY_ACTION = {
  login: 10,
  signup: 30,
  forgot: 5
};
const MAX_BODY_BYTES = 65536;
const AUTH_RATE_LIMIT_DISABLED_VALUE = "true";
const REQUEST_ALIAS_CACHE = new WeakMap();

function getRequestAliasCache(request) {
  if (!request) return null;
  let cache = REQUEST_ALIAS_CACHE.get(request);
  if (!cache) {
    cache = new Map();
    REQUEST_ALIAS_CACHE.set(request, cache);
  }
  return cache;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "*";

    if (!url.pathname.startsWith("/api/")) {
      if (env.ASSETS?.fetch) {
        const cleanPath = url.pathname.replace(/\/+$/, "") || "/";
        const cleanRoutes = {
          "/": "/index.html",
          "/index": "/index.html",
          "/browse": "/browse.html",
          "/recommended": "/recommended.html",
          "/top-rated": "/top-rated.html",
          "/search": "/search.html",
          "/lists": "/lists.html",
          "/inbox": "/inbox.html",
          "/watch": "/watch.html"
        };
        const mapped = cleanRoutes[cleanPath];
        if (mapped) {
          const mappedUrl = new URL(mapped, url.origin);
          return env.ASSETS.fetch(new Request(mappedUrl.toString(), request));
        }
        const assetResponse = await env.ASSETS.fetch(request);
        if (assetResponse.status !== 404) return assetResponse;

        // Fallback for clean routes and root to keep the frontend reachable.
        const fallbackUrl = new URL("/index.html", url.origin);
        return env.ASSETS.fetch(new Request(fallbackUrl.toString(), request));
      }
      return new Response("Frontend assets are not configured.", { status: 500 });
    }

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }), origin, env, url.origin);
    }

    try {
      if (url.pathname.startsWith("/api/tmdb/")) {
        return withCors(await handleTmdbProxy(request, env, url, ctx), origin, env, url.origin);
      }

      if (url.pathname === "/api/auth/login") {
        return withCors(await handleAuthLogin(request, env), origin, env, url.origin);
      }

      if (url.pathname === "/api/auth/signup") {
        return withCors(await handleAuthSignup(request, env), origin, env, url.origin);
      }

      if (url.pathname === "/api/auth/refresh") {
        return withCors(await handleAuthRefresh(request, env), origin, env, url.origin);
      }

      if (url.pathname === "/api/auth/me") {
        return withCors(await handleAuthMe(request, env), origin, env, url.origin);
      }

      if (url.pathname === "/api/auth/forgot") {
        return withCors(await handleAuthForgot(request, env), origin, env, url.origin);
      }

      if (url.pathname === "/api/auth/add-email") {
        return withCors(await handleAuthAddEmail(request, env), origin, env, url.origin);
      }

      if (url.pathname === "/api/auth/logout") {
        return withCors(await handleAuthLogout(request, env), origin, env, url.origin);
      }

      if (url.pathname === "/api/auth/update") {
        return withCors(await handleAuthUpdate(request, env), origin, env, url.origin);
      }

      if (url.pathname === "/api/auth/delete") {
        return withCors(await handleAuthDelete(request, env), origin, env, url.origin);
      }

      if (url.pathname === "/api/notifications/read") {
        return withCors(await handleNotificationReadState(request, env), origin, env, url.origin);
      }

      if (url.pathname === "/api/progress/pull") {
        return withCors(await handleProgressPull(request, env, url), origin, env, url.origin);
      }

      if (url.pathname === "/api/progress/push") {
        return withCors(await handleProgressPush(request, env), origin, env, url.origin);
      }

      if (url.pathname === "/api/progress/delete") {
        return withCors(await handleProgressDelete(request, env), origin, env, url.origin);
      }

      if (url.pathname === "/api/bookmarks/pull") {
        return withCors(await handleBookmarksPull(request, env, url), origin, env, url.origin);
      }

      if (url.pathname === "/api/bookmarks/push") {
        return withCors(await handleBookmarksPush(request, env), origin, env, url.origin);
      }

      if (url.pathname === "/api/bookmarks/delete") {
        return withCors(await handleBookmarksDelete(request, env), origin, env, url.origin);
      }

      if (url.pathname === "/api/report") {
        return withCors(await handleReportSubmit(request, env), origin, env, url.origin);
      }

      return withCors(jsonResponse({ error: "Not found" }, 404), origin, env, url.origin);
    } catch (error) {
      const message = error?.message || "Server error";
      const status = message === "Payload too large" ? 413 : 500;
      return withCors(jsonResponse({ error: message }, status), origin, env, url.origin);
    }
  }
};

async function handleTmdbProxy(request, env, url, ctx) {
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

  const cache = typeof caches !== "undefined" ? caches.default : null;
  const cacheTtl = tmdbCacheTtlSeconds(tmdbPath);
  const cacheKey = cache ? new Request(url.toString(), { method: "GET" }) : null;
  if (cache && cacheTtl > 0) {
    const cached = await cache.match(cacheKey);
    if (cached) return new Response(cached.body, cached);
  }

  const response = await fetch(tmdbUrl.toString(), {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${env.TMDB_READ_TOKEN}`
    }
  });

  const proxied = await proxyJson(response, {
    "Cache-Control": response.ok && cacheTtl > 0
      ? `public, max-age=${cacheTtl}, s-maxage=${cacheTtl}, stale-while-revalidate=86400`
      : "no-store"
  });

  if (cache && cacheKey && response.ok && cacheTtl > 0) {
    ctx?.waitUntil(cache.put(cacheKey, proxied.clone()));
  }

  return proxied;
}

function tmdbCacheTtlSeconds(path) {
  if (path.startsWith("/search/")) return 5 * 60;
  if (path.includes("/recommendations")) return 30 * 60;
  if (path.includes("/season/")) return 30 * 60;
  if (path.startsWith("/configuration/") || path.startsWith("/genre/")) return 7 * 24 * 60 * 60;
  if (path.startsWith("/trending/")) return 15 * 60;
  if (path.startsWith("/discover/") || path.includes("/popular") || path.includes("/top_rated")) return 60 * 60;
  if (/^\/(movie|tv)\/\d+/.test(path)) return 6 * 60 * 60;
  return 30 * 60;
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

  if (!shouldBypassAuthRateLimit(env, request)) {
    const limiterKey = buildLimiterKey(request, "login", identifier);
    const limited = await checkRateLimit(env, limiterKey, RATE_LIMIT_MAX_BY_ACTION.login);
    if (limited.blocked) {
      return jsonResponse({ error: "Too many attempts. Try again later." }, 429, {
        "Retry-After": String(limited.retryAfter)
      });
    }
  }

  const emails = await resolveLoginEmails(env, identifier);
  if (!emails.length) {
    return jsonResponse({ error: "Invalid credentials." }, 400);
  }

  let lastResponse = null;
  let lastText = "";
  for (const email of emails) {
    const response = await supabasePasswordGrant(env, email, password);
    const text = await response.text();
    if (response.ok) {
      if (!identifier.includes("@") && isInternalEmail(email)) {
        await storeLoginAliases(env, identifier, email, request);
      }
      return jsonProxyFromText(text, response.status);
    }
    lastResponse = response;
    lastText = text;
  }

  return jsonProxyFromText(lastText || "{\"error\":\"Invalid credentials.\"}", lastResponse?.status || 400);
}

async function handleAuthSignup(request, env) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const payload = await readJson(request);
  const username = normalizeUsername(payload?.username);
  const email = normalizeEmail(payload?.email, true);
  const password = String(payload?.password || "");
  const avatarId = normalizeAvatarId(payload?.avatarId) || "none";

  if (!username || email === null || !isValidPassword(password)) {
    return jsonResponse({ error: "Invalid sign up details." }, 400);
  }

  if (!shouldBypassAuthRateLimit(env, request)) {
    const limiterKey = buildLimiterKey(request, "signup", username);
    const limited = await checkRateLimit(env, limiterKey, RATE_LIMIT_MAX_BY_ACTION.signup);
    if (limited.blocked) {
      return jsonResponse({ error: "Too many attempts. Try again later." }, 429, {
        "Retry-After": String(limited.retryAfter)
      });
    }
  }

  const existingEmail = await getLoginAlias(env, username);
  if (existingEmail) {
    if (!env.SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse({ error: "Username is already taken." }, 400);
    }
    const existingUser = await fetchSupabaseUserByEmail(env, existingEmail);
    if (existingUser?.id) {
      return jsonResponse({ error: "Username is already taken." }, 400);
    }
    await deleteLoginAlias(env, username);
  }

  const loginEmail = email || internalEmailForUsername(username);
  const signupPayload = {
    email: loginEmail,
    password,
    data: {
      username,
      name: username,
      display_name: username,
      full_name: username,
      avatarId,
      email: email || undefined
    }
  };
  const response = !email && env.SUPABASE_SERVICE_ROLE_KEY
    ? await createInternalSupabaseUser(env, signupPayload)
    : await proxySupabaseAuth(env, "/auth/v1/signup", signupPayload);
  if (response.ok) {
    await storeLoginAliases(env, username, loginEmail, request);
  }
  return response;
}

async function handleAuthDelete(request, env) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Account deletion is not configured." }, 500);
  }

  const token = getBearerToken(request);
  if (!token) {
    return jsonResponse({ error: "Missing token." }, 401);
  }
  const currentUser = await fetchSupabaseUser(env, token);
  if (!currentUser?.id) {
    return jsonResponse({ error: "Could not verify user." }, 401);
  }

  await deleteUserProgress(env, currentUser.id);
  await deleteUserBookmarks(env, currentUser.id);
  await deleteLoginAlias(env, currentUser.user_metadata?.username);

  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(currentUser.id)}`, {
    method: "DELETE",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    return proxyJson(response);
  }

  return jsonResponse({ ok: true });
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

async function handleAuthMe(request, env) {
  if (request.method !== "GET" && request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const token = getBearerToken(request);
  if (!token) {
    return jsonResponse({ error: "Missing token." }, 401);
  }

  const user = await fetchSupabaseUser(env, token);
  if (!user?.id) {
    return jsonResponse({ error: "Could not verify user." }, 401);
  }

  if (user.user_metadata?.username && user.email) {
    await storeLoginAliases(env, user.user_metadata.username, user.email, request);
  }

  return jsonResponse({ user });
}

async function handleAuthForgot(request, env) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const payload = await readJson(request);
  const identifier = normalizeIdentifier(payload?.identifier);
  if (!identifier) {
    return jsonResponse({ ok: true });
  }

  if (!shouldBypassAuthRateLimit(env, request)) {
    const limiterKey = buildLimiterKey(request, "forgot", identifier);
    const limited = await checkRateLimit(env, limiterKey, RATE_LIMIT_MAX_BY_ACTION.forgot);
    if (limited.blocked) {
      return jsonResponse({ error: "Too many attempts. Try again later." }, 429, {
        "Retry-After": String(limited.retryAfter)
      });
    }
  }

  const emails = await resolveLoginEmails(env, identifier);
  if (!emails.length) {
    return jsonResponse({ ok: true });
  }

  let internalEmail = "";
  for (const email of emails) {
    if (isInternalEmail(email)) {
      internalEmail = email;
      continue;
    }
    const sent = await sendRecoveryEmail(request, env, email);
    if (sent) {
      return jsonResponse({ ok: true });
    }
  }

  if (internalEmail) {
    return jsonResponse({ needsEmail: true, username: extractUsername(internalEmail) });
  }

  return jsonResponse({ ok: true });
}

async function handleAuthAddEmail(request, env) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const payload = await readJson(request);
  const username = normalizeUsername(payload?.username);
  const email = normalizeEmail(payload?.email, false);
  const password = String(payload?.password || "");

  if (!username || !email || !isValidPassword(password)) {
    return jsonResponse({ error: "Invalid details." }, 400);
  }

  const loginEmails = await resolveLoginEmails(env, username);
  let loginPayload = null;
  for (const loginEmail of loginEmails) {
    const loginResponse = await supabasePasswordGrant(env, loginEmail, password);
    const loginText = await loginResponse.text();
    if (loginResponse.ok) {
      loginPayload = safeParseJson(loginText) || {};
      break;
    }
  }
  if (!loginPayload) {
    return jsonResponse({ error: "Username or password is incorrect." }, 403);
  }

  const token = loginPayload.access_token;
  if (!token) {
    return jsonResponse({ error: "Could not verify account." }, 403);
  }

  return updateUserEmailWithConfirmation(env, token, {
    email,
    data: {
      username,
      name: username,
      display_name: username,
      full_name: username,
      email
    }
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

  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return jsonResponse({ error: "Supabase config missing." }, 500);
  }

  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/logout`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });

  if (response.ok || response.status === 204) {
    return jsonResponse({ ok: true });
  }

  const body = await response.text().catch(() => "");
  return jsonResponse({ error: body || "Logout failed." }, response.status || 500);
}

async function handleAuthUpdate(request, env) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const token = getBearerToken(request);
  if (!token) {
    return jsonResponse({ error: "Missing token." }, 401);
  }

  const currentUser = await fetchSupabaseUser(env, token);
  if (!currentUser?.id) {
    return jsonResponse({ error: "Could not verify user." }, 401);
  }

  const payload = await readJson(request);
  const avatarId = payload?.avatarId === undefined ? "" : normalizeAvatarId(payload?.avatarId);
  const username = payload?.username === undefined ? "" : normalizeUsername(payload?.username);
  const email = payload?.email === undefined ? undefined : normalizeEmail(payload?.email, false);
  const password = payload?.password === undefined ? "" : String(payload?.password || "");
  const preferredServer = payload?.preferredServer === undefined ? "" : normalizeServerId(payload?.preferredServer);
  const notificationReadIds = payload?.notificationReadIds === undefined ? null : normalizeStringList(payload?.notificationReadIds, 200, 160);
  const currentPassword = String(payload?.currentPassword || "");
  const recoveryMode = payload?.recovery === true;

  const update = {};
  const data = {};

  if (payload?.avatarId !== undefined) {
    if (!avatarId) return jsonResponse({ error: "Invalid avatar." }, 400);
    data.avatarId = avatarId;
  }

  if (payload?.preferredServer !== undefined) {
    if (!preferredServer) return jsonResponse({ error: "Invalid preferred server." }, 400);
    data.preferredServer = preferredServer;
  }

  if (payload?.notificationReadIds !== undefined) {
    data.notificationReadIds = notificationReadIds;
  }

  if (payload?.username !== undefined) {
    if (!username) return jsonResponse({ error: "Invalid username." }, 400);
    if (username !== normalizeUsername(currentUser.user_metadata?.username)) {
      const existingEmail = await getLoginAlias(env, username);
      if (existingEmail && normalizeEmail(existingEmail, false) !== normalizeEmail(currentUser.email, false)) {
        if (!env.SUPABASE_SERVICE_ROLE_KEY) {
          return jsonResponse({ error: "Username is already taken." }, 400);
        }
        const existingUser = await fetchSupabaseUserByEmail(env, existingEmail);
        if (existingUser?.id && existingUser.id !== currentUser.id) {
          return jsonResponse({ error: "Username is already taken." }, 400);
        }
      }
    }
    data.username = username;
    data.name = username;
    data.display_name = username;
    data.full_name = username;
    if (isInternalEmail(currentUser.email)) {
      update.email = internalEmailForUsername(username);
    }
  }

  if (payload?.email !== undefined) {
    if (!email) return jsonResponse({ error: "Invalid email." }, 400);
    update.email = email;
    data.email = email;
  }

  if (payload?.password !== undefined) {
    if (!isValidPassword(password)) return jsonResponse({ error: "Invalid password." }, 400);
    if (!recoveryMode) {
      if (!isValidPassword(currentPassword)) return jsonResponse({ error: "Enter your old password." }, 400);
      const verified = await verifyCurrentPassword(env, currentUser.email, currentPassword);
      if (!verified) return jsonResponse({ error: "Old password is incorrect." }, 403);
    }
    update.password = password;
  }

  if (Object.keys(data).length) {
    update.data = {
      ...(currentUser.user_metadata || {}),
      ...data
    };
  }

  if (!Object.keys(update).length) {
    return jsonResponse({ error: "Invalid payload." }, 400);
  }

  const supabaseResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    method: "PUT",
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(update)
  });

  const responseText = await supabaseResponse.text();

  // Handle 422 (Unprocessable Entity) - usually duplicate email
  if (supabaseResponse.status === 422 && update.email) {
    return jsonResponse({ error: "This email is already in use." }, 422);
  }

  if (!supabaseResponse.ok && update.email) {
    const confirmationText = responseText.toLowerCase();
    if (
      supabaseResponse.status === 400
      || confirmationText.includes("confirm")
      || confirmationText.includes("confirmation")
      || confirmationText.includes("verify")
      || confirmationText.includes("change your email")
    ) {
      return jsonResponse({ ok: true, pendingEmailConfirmation: true, message: "Check your email to confirm the change." });
    }
  }

  const supabasePayload = safeParseJson(responseText) || {};
  const confirmedEmail = normalizeEmail(supabasePayload.email, false);
  if (supabaseResponse.ok && update.email && confirmedEmail !== update.email) {
    if (username) {
      await storeLoginAliases(env, username, currentUser.email, request);
    }
    return jsonResponse({
      ok: true,
      pendingEmailConfirmation: true,
      user: supabasePayload,
      message: "Check your email to confirm the change."
    });
  }

  // Proxy other responses through normally
  const response = new Response(responseText || "{}", {
    status: supabaseResponse.status,
    headers: {
      "Content-Type": "application/json"
    }
  });

  if (supabaseResponse.ok && (username || update.email)) {
    const aliasEmail = update.email && confirmedEmail === update.email
      ? update.email
      : currentUser.email;
    await storeLoginAliases(
      env,
      username || currentUser.user_metadata?.username,
      aliasEmail,
      request
    );
  }
  return response;
}

async function handleNotificationReadState(request, env) {
  if (request.method !== "GET" && request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const token = getBearerToken(request);
  if (!token) {
    return jsonResponse({ error: "Missing token." }, 401);
  }

  const currentUser = await fetchSupabaseUser(env, token);
  if (!currentUser?.id) {
    return jsonResponse({ error: "Could not verify user." }, 401);
  }

  const currentIds = normalizeStringList(currentUser.user_metadata?.notificationReadIds, 500, 180);
  if (request.method === "GET") {
    return jsonResponse({ notificationReadIds: currentIds });
  }

  const payload = await readJson(request);
  const incomingIds = normalizeStringList(payload?.notificationReadIds, 500, 180);
  const merged = [...new Set([...currentIds, ...incomingIds])].slice(-500);
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    method: "PUT",
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      data: {
        ...(currentUser.user_metadata || {}),
        notificationReadIds: merged
      }
    })
  });

  if (!response.ok) return proxyJson(response);
  return jsonResponse({ ok: true, notificationReadIds: merged });
}

async function handleProgressPull(request, env, url) {
  if (request.method !== "GET" && request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const token = getBearerToken(request);
  if (!token) {
    return jsonResponse({ error: "Missing token." }, 401);
  }
  const user = await fetchSupabaseUser(env, token);
  if (!user?.id) {
    return jsonResponse({ error: "Could not verify user." }, 401);
  }

  const limitParam = request.method === "POST"
    ? Number((await readJson(request))?.limit || 500)
    : Number(url.searchParams.get("limit") || 500);
  const limit = Math.max(1, Math.min(500, limitParam));

  const apiUrl = new URL(`${env.SUPABASE_URL}/rest/v1/watch_progress`);
  apiUrl.searchParams.set("select", "media_type,content_id,season_number,episode_number,timestamp_seconds,duration_seconds,progress_percent,updated_at");
  apiUrl.searchParams.set("user_id", `eq.${user.id}`);
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
  const user = await fetchSupabaseUser(env, token);
  if (!user?.id) {
    return jsonResponse({ error: "Could not verify user." }, 401);
  }

  const payload = await readJson(request);
  const rows = (Array.isArray(payload?.rows) ? payload.rows : [])
    .map((row) => normalizeProgressRow(row, user.id))
    .filter(Boolean);

  if (!rows.length || rows.length > 240) {
    return jsonResponse({ error: "Invalid payload. Expected 1-240 rows.", received: Array.isArray(payload?.rows) ? payload.rows.length : 0 }, 400);
  }

  const existingProgressMap = await fetchExistingProgressRows(env, token, user.id, rows);
  const freshRows = rows.filter((row) => {
    const mediaType = row?.media_type === "tv" ? "tv" : "movie";
    const contentId = Number(row?.content_id || 0);
    if (!contentId) return false;
    const season = mediaType === "tv" ? Number(row?.season_number || 1) || 1 : 1;
    const episode = mediaType === "tv" ? Number(row?.episode_number || 1) || 1 : 1;
    const incomingUpdatedAt = Date.parse(row?.updated_at || "") || 0;
    const key = `${mediaType}:${contentId}:${season}:${episode}`;
    const existingUpdatedAt = existingProgressMap.get(key) || 0;
    return !existingUpdatedAt || incomingUpdatedAt >= existingUpdatedAt;
  });

  if (!freshRows.length) {
    return jsonResponse({ ok: true, skipped: rows.length });
  }

  const apiUrl = new URL(`${env.SUPABASE_URL}/rest/v1/watch_progress`);
  apiUrl.searchParams.set("on_conflict", "user_id,media_type,content_id,season_number,episode_number");
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      ...supabaseHeaders(env, token),
      Prefer: "resolution=merge-duplicates,return=minimal",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(freshRows)
  });

  if (!response.ok) {
    return proxyJson(response);
  }

  return jsonResponse({ ok: true });
}

async function handleBookmarksPull(request, env, url) {
  if (request.method !== "GET" && request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const token = getBearerToken(request);
  if (!token) {
    return jsonResponse({ error: "Missing token." }, 401);
  }
  const user = await fetchSupabaseUser(env, token);
  if (!user?.id) {
    return jsonResponse({ error: "Could not verify user." }, 401);
  }

  const limitParam = request.method === "POST"
    ? Number((await readJson(request))?.limit || 500)
    : Number(url.searchParams.get("limit") || 500);
  const limit = Math.max(1, Math.min(500, limitParam));

  const apiUrl = new URL(`${env.SUPABASE_URL}/rest/v1/bookmarks`);
  apiUrl.searchParams.set("select", "media_type,content_id,status,title,poster,updated_at");
  apiUrl.searchParams.set("user_id", `eq.${user.id}`);
  apiUrl.searchParams.set("order", "updated_at.desc");
  apiUrl.searchParams.set("limit", String(limit));

  const response = await fetch(apiUrl.toString(), {
    headers: supabaseHeaders(env, token)
  });

  return proxyJson(response);
}

async function handleBookmarksPush(request, env) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const token = getBearerToken(request);
  if (!token) {
    return jsonResponse({ error: "Missing token." }, 401);
  }

  const payload = await readJson(request);
  const user = await fetchSupabaseUser(env, token);
  if (!user?.id) {
    return jsonResponse({ error: "Could not verify user." }, 401);
  }
  const rows = (Array.isArray(payload?.rows) ? payload.rows : [])
    .map((row) => normalizeBookmarkRow(row, user.id))
    .filter(Boolean);

  if (!rows.length || rows.length > 240) {
    return jsonResponse({ error: "Invalid payload." }, 400);
  }

  const existingBookmarkMap = await fetchExistingBookmarkRows(env, token, user.id, rows);
  const freshRows = rows.filter((row) => {
    const mediaType = row?.media_type === "tv" ? "tv" : "movie";
    const contentId = Number(row?.content_id || 0);
    if (!contentId) return false;
    const incomingUpdatedAt = Date.parse(row?.updated_at || "") || 0;
    const key = `${mediaType}:${contentId}`;
    const existingUpdatedAt = existingBookmarkMap.get(key) || 0;
    return !existingUpdatedAt || incomingUpdatedAt >= existingUpdatedAt;
  });

  if (!freshRows.length) {
    return jsonResponse({ ok: true, skipped: rows.length });
  }

  const apiUrl = new URL(`${env.SUPABASE_URL}/rest/v1/bookmarks`);
  apiUrl.searchParams.set("on_conflict", "user_id,media_type,content_id");
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      ...supabaseHeaders(env, token),
      Prefer: "resolution=merge-duplicates,return=minimal",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(freshRows)
  });

  if (!response.ok) {
    return proxyJson(response);
  }

  return jsonResponse({ ok: true, skipped: rows.length - freshRows.length });
}

async function handleProgressDelete(request, env) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const token = getBearerToken(request);
  if (!token) {
    return jsonResponse({ error: "Missing token." }, 401);
  }

  const user = await fetchSupabaseUser(env, token);
  if (!user?.id) {
    return jsonResponse({ error: "Could not verify user." }, 401);
  }

  const payload = await readJson(request);
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  const rows = entries.map((entry) => {
    const mediaType = entry?.media_type === "tv" ? "tv" : "movie";
    const contentId = Number(entry?.content_id || 0);
    if (!contentId) return null;
    return {
      user_id: user.id,
      media_type: mediaType,
      content_id: contentId,
      season_number: mediaType === "tv" ? Number(entry?.season_number || 1) || 1 : 1,
      episode_number: mediaType === "tv" ? Number(entry?.episode_number || 1) || 1 : 1,
      timestamp_seconds: 0,
      duration_seconds: 0,
      progress_percent: 100,
      updated_at: new Date().toISOString()
    };
  }).filter(Boolean).slice(0, 240);

  if (!rows.length) {
    return jsonResponse({ error: "Invalid progress entries." }, 400);
  }

  for (const row of rows) {
    const apiUrl = new URL(`${env.SUPABASE_URL}/rest/v1/watch_progress`);
    apiUrl.searchParams.set("user_id", `eq.${user.id}`);
    apiUrl.searchParams.set("media_type", `eq.${row.media_type}`);
    apiUrl.searchParams.set("content_id", `eq.${row.content_id}`);
    apiUrl.searchParams.set("season_number", `eq.${row.season_number}`);
    apiUrl.searchParams.set("episode_number", `eq.${row.episode_number}`);

    const response = await fetch(apiUrl, {
      method: "DELETE",
      headers: {
        ...supabaseHeaders(env, token),
        Prefer: "return=minimal"
      }
    });

    if (!response.ok) {
      return proxyJson(response);
    }
  }

  return jsonResponse({ ok: true, deleted: rows.length });
}

async function shouldAcceptProgressRow(env, token, userId, row) {
  const mediaType = row?.media_type === "tv" ? "tv" : "movie";
  const contentId = Number(row?.content_id || 0);
  if (!contentId) return false;
  const season = mediaType === "tv" ? Number(row?.season_number || 1) || 1 : 1;
  const episode = mediaType === "tv" ? Number(row?.episode_number || 1) || 1 : 1;
  const incomingUpdatedAt = Date.parse(row?.updated_at || "") || 0;

  const apiUrl = new URL(`${env.SUPABASE_URL}/rest/v1/watch_progress`);
  apiUrl.searchParams.set("select", "updated_at");
  apiUrl.searchParams.set("user_id", `eq.${userId}`);
  apiUrl.searchParams.set("media_type", `eq.${mediaType}`);
  apiUrl.searchParams.set("content_id", `eq.${contentId}`);
  apiUrl.searchParams.set("season_number", `eq.${season}`);
  apiUrl.searchParams.set("episode_number", `eq.${episode}`);
  apiUrl.searchParams.set("limit", "1");

  const response = await fetch(apiUrl.toString(), {
    headers: supabaseHeaders(env, token)
  });
  if (!response.ok) return true;

  const existing = await response.json().catch(() => []);
  const existingUpdatedAt = Date.parse(existing?.[0]?.updated_at || "") || 0;
  return !existingUpdatedAt || incomingUpdatedAt >= existingUpdatedAt;
}

async function shouldAcceptBookmarkRow(env, token, userId, row) {
  const mediaType = row?.media_type === "tv" ? "tv" : "movie";
  const contentId = Number(row?.content_id || 0);
  if (!contentId) return false;
  const incomingUpdatedAt = Date.parse(row?.updated_at || "") || 0;

  const apiUrl = new URL(`${env.SUPABASE_URL}/rest/v1/bookmarks`);
  apiUrl.searchParams.set("select", "updated_at");
  apiUrl.searchParams.set("user_id", `eq.${userId}`);
  apiUrl.searchParams.set("media_type", `eq.${mediaType}`);
  apiUrl.searchParams.set("content_id", `eq.${contentId}`);
  apiUrl.searchParams.set("limit", "1");

  const response = await fetch(apiUrl.toString(), {
    headers: supabaseHeaders(env, token)
  });
  if (!response.ok) return true;

  const existing = await response.json().catch(() => []);
  const existingUpdatedAt = Date.parse(existing?.[0]?.updated_at || "") || 0;
  return !existingUpdatedAt || incomingUpdatedAt >= existingUpdatedAt;
}

async function fetchExistingProgressRows(env, token, userId, rows) {
  const ids = [...new Set((rows || []).map((row) => Number(row?.content_id || 0)).filter(Boolean))];
  const map = new Map();
  if (!ids.length) return map;

  const batchSize = 40;
  for (let index = 0; index < ids.length; index += batchSize) {
    const batch = ids.slice(index, index + batchSize).join(",");
    const apiUrl = new URL(`${env.SUPABASE_URL}/rest/v1/watch_progress`);
    apiUrl.searchParams.set("select", "media_type,content_id,season_number,episode_number,updated_at");
    apiUrl.searchParams.set("user_id", `eq.${userId}`);
    apiUrl.searchParams.set("content_id", `in.(${batch})`);
    const response = await fetch(apiUrl.toString(), {
      headers: supabaseHeaders(env, token)
    });
    if (!response.ok) continue;
    const existing = await response.json().catch(() => []);
    (existing || []).forEach((row) => {
      const mediaType = row?.media_type === "tv" ? "tv" : "movie";
      const contentId = Number(row?.content_id || 0);
      if (!contentId) return;
      const season = mediaType === "tv" ? Number(row?.season_number || 1) || 1 : 1;
      const episode = mediaType === "tv" ? Number(row?.episode_number || 1) || 1 : 1;
      const key = `${mediaType}:${contentId}:${season}:${episode}`;
      const updatedAt = Date.parse(row?.updated_at || "") || 0;
      if (!map.has(key) || updatedAt > map.get(key)) {
        map.set(key, updatedAt);
      }
    });
  }

  return map;
}

async function fetchExistingBookmarkRows(env, token, userId, rows) {
  const ids = [...new Set((rows || []).map((row) => Number(row?.content_id || 0)).filter(Boolean))];
  const map = new Map();
  if (!ids.length) return map;

  const batchSize = 60;
  for (let index = 0; index < ids.length; index += batchSize) {
    const batch = ids.slice(index, index + batchSize).join(",");
    const apiUrl = new URL(`${env.SUPABASE_URL}/rest/v1/bookmarks`);
    apiUrl.searchParams.set("select", "media_type,content_id,updated_at");
    apiUrl.searchParams.set("user_id", `eq.${userId}`);
    apiUrl.searchParams.set("content_id", `in.(${batch})`);
    const response = await fetch(apiUrl.toString(), {
      headers: supabaseHeaders(env, token)
    });
    if (!response.ok) continue;
    const existing = await response.json().catch(() => []);
    (existing || []).forEach((row) => {
      const mediaType = row?.media_type === "tv" ? "tv" : "movie";
      const contentId = Number(row?.content_id || 0);
      if (!contentId) return;
      const key = `${mediaType}:${contentId}`;
      const updatedAt = Date.parse(row?.updated_at || "") || 0;
      if (!map.has(key) || updatedAt > map.get(key)) {
        map.set(key, updatedAt);
      }
    });
  }

  return map;
}

async function handleBookmarksDelete(request, env) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const token = getBearerToken(request);
  if (!token) {
    return jsonResponse({ error: "Missing token." }, 401);
  }

  const payload = await readJson(request);
  const mediaType = payload?.media_type === "tv" ? "tv" : "movie";
  const contentId = Number(payload?.content_id || 0);
  if (!contentId) {
    return jsonResponse({ error: "Invalid bookmark." }, 400);
  }

  const user = await fetchSupabaseUser(env, token);
  if (!user?.id) {
    return jsonResponse({ error: "Could not verify user." }, 401);
  }

  // Perform a real DELETE so the bookmark is removed server-side.
  const apiUrl = new URL(`${env.SUPABASE_URL}/rest/v1/bookmarks`);
  apiUrl.searchParams.set("user_id", `eq.${user.id}`);
  apiUrl.searchParams.set("media_type", `eq.${mediaType}`);
  apiUrl.searchParams.set("content_id", `eq.${contentId}`);

  const response = await fetch(apiUrl.toString(), {
    method: "DELETE",
    headers: {
      ...supabaseHeaders(env, token),
      Prefer: "return=minimal"
    }
  });

  if (!response.ok) return proxyJson(response);
  return jsonResponse({ ok: true, deleted: 1 });
}

async function handleReportSubmit(request, env) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!shouldBypassAuthRateLimit(env, request)) {
    const ip = getClientIp(request) || "unknown";
    const limited = await checkRateLimit(env, `rl:report:${ip}`, 5);
    if (limited.blocked) {
      return jsonResponse({ error: "Too many reports. Try again later." }, 429, {
        "Retry-After": String(limited.retryAfter)
      });
    }
  }

  const payload = await readJson(request);
  const message = String(payload?.message || "").trim().slice(0, 500);
  if (!message) {
    return jsonResponse({ error: "Missing report message." }, 400);
  }

  const token = getBearerToken(request);
  let userId = "";
  if (token) {
    const user = await fetchSupabaseUser(env, token);
    userId = user?.id || "";
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !token || !userId) {
    return jsonResponse({ ok: true, stored: "local-only" });
  }

  const row = {
    user_id: userId || null,
    message,
    created_at: new Date().toISOString()
  };

  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/reports`, {
    method: "POST",
    headers: {
      ...supabaseHeaders(env, token),
      Prefer: "return=minimal",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(row)
  });

  if (!response.ok) {
    return jsonResponse({ ok: true, stored: "local-only" });
  }

  return jsonResponse({ ok: true, stored: "supabase" });
}

function buildLimiterKey(request, action, identifier) {
  const ip = getClientIp(request);
  return `rl:${action}:${ip}:${identifier}`;
}

function getClientIp(request) {
  const forwardedFor = request.headers.get("X-Forwarded-For") || "";
  return request.headers.get("CF-Connecting-IP")
    || forwardedFor.split(",")[0]?.trim()
    || "unknown";
}

function shouldBypassAuthRateLimit(env, request) {
  if (String(env.AUTH_RATE_LIMIT_DISABLED || "").toLowerCase() === AUTH_RATE_LIMIT_DISABLED_VALUE) {
    return true;
  }

  const clientIp = getClientIp(request);
  const trustedIps = String(env.AUTH_RATE_LIMIT_BYPASS_IPS || "")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);
  return trustedIps.includes(clientIp);
}

async function checkRateLimit(env, key, maxAttempts = RATE_LIMIT_MAX) {
  if (!env.RATE_LIMIT_KV?.get || !env.RATE_LIMIT_KV?.put) {
    return { blocked: false, retryAfter: 0 };
  }

  const now = Date.now();
  let existing = null;
  try {
    existing = await env.RATE_LIMIT_KV.get(key, "json");
  } catch {
    return { blocked: false, retryAfter: 0 };
  }

  if (!existing || now >= existing.resetAt) {
    const record = { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
    try {
      await env.RATE_LIMIT_KV.put(key, JSON.stringify(record), {
        expirationTtl: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)
      });
    } catch {
      return { blocked: false, retryAfter: 0 };
    }
    return { blocked: false, retryAfter: 0 };
  }

  if (existing.count >= maxAttempts) {
    const retryAfter = Math.ceil((existing.resetAt - now) / 1000);
    return { blocked: true, retryAfter: Math.max(1, retryAfter) };
  }

  const record = { ...existing, count: existing.count + 1 };
  try {
    await env.RATE_LIMIT_KV.put(key, JSON.stringify(record), {
      expirationTtl: Math.max(60, Math.ceil((existing.resetAt - now) / 1000))
    });
  } catch {
    return { blocked: false, retryAfter: 0 };
  }

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

async function supabasePasswordGrant(env, email, password) {
  return fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });
}

async function sendRecoveryEmail(request, env, email) {
  try {
    const response = await proxySupabaseAuth(env, "/auth/v1/recover", {
      email,
      redirect_to: `${getAppOrigin(request, env)}/index.html?auth=recovery`
    });
    if (!response.ok) {
      console.error("Recovery email failed:", await response.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error("Recovery error:", error);
    return false;
  }
}

async function updateUserEmailWithConfirmation(env, token, payload) {
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    method: "PUT",
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const text = await response.text();

  if (response.status === 422) {
    return jsonResponse({ error: "This email is already in use." }, 422);
  }
  if (!response.ok) {
    return jsonProxyFromText(text || "{\"error\":\"Could not update email.\"}", response.status);
  }

  const updatedUser = safeParseJson(text) || {};
  if (normalizeEmail(updatedUser.email, false) === payload.email) {
    return jsonResponse({ ok: true, user: updatedUser });
  }

  return jsonResponse({
    ok: true,
    pendingEmailConfirmation: true,
    user: updatedUser,
    message: "Check your email to confirm the address."
  });
}

async function createInternalSupabaseUser(env, payload) {
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
      user_metadata: payload.data || {}
    })
  });
  return proxyJson(response);
}

function getAppOrigin(request, env) {
  const configured = String(env.SITE_URL || "").trim();
  if (configured) return configured.replace(/\/$/, "");
  return new URL(request.url).origin;
}

async function fetchSupabaseUser(env, token) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !token) return null;
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
  });
  if (!response.ok) return null;
  return response.json();
}

async function fetchSupabaseUserByEmail(env, email) {
  const normalizedEmail = normalizeEmail(email, false);
  if (!normalizedEmail || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;

  const url = new URL(`${env.SUPABASE_URL}/auth/v1/admin/users`);
  url.searchParams.set("email", normalizedEmail);
  const response = await fetch(url.toString(), {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json"
    }
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const users = Array.isArray(payload?.users) ? payload.users : (Array.isArray(payload) ? payload : []);
  return users.find((user) => normalizeEmail(user?.email, false) === normalizedEmail) || null;
}

async function verifyCurrentPassword(env, email, password) {
  if (!email || !password) return false;
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });
  return response.ok;
}

async function resolveLoginEmail(env, identifier) {
  if (!identifier) return "";
  if (identifier.includes("@")) return identifier;

  const mapped = await getLoginAlias(env, identifier);
  return mapped || internalEmailForUsername(identifier);
}

async function resolveLoginEmails(env, identifier) {
  if (!identifier) return [];
  if (identifier.includes("@")) return [identifier];

  const internalEmail = internalEmailForUsername(identifier);
  const legacyInternalEmail = `${identifier}@cinerune.user`;
  const mapped = await getLoginAlias(env, identifier);
  return [mapped, internalEmail, legacyInternalEmail].filter((email, index, emails) => {
    const normalized = normalizeEmail(email, false);
    return normalized && emails.indexOf(email) === index;
  });
}

async function getLoginAlias(env, username) {
  const normalizedUsername = normalizeUsername(username);
  if (!env.RATE_LIMIT_KV?.get || !normalizedUsername) return "";
  try {
    return await env.RATE_LIMIT_KV.get(loginAliasKey(normalizedUsername));
  } catch {
    return "";
  }
}

async function storeLoginAliases(env, username, email, request) {
  const normalizedUsername = normalizeUsername(username);
  const normalizedEmail = normalizeEmail(email, false);
  if (!env.RATE_LIMIT_KV?.put || !normalizedUsername || !normalizedEmail) return;
  const cache = getRequestAliasCache(request);
  if (cache?.has(normalizedUsername)) {
    if (cache.get(normalizedUsername) === normalizedEmail) return;
  } else if (env.RATE_LIMIT_KV?.get) {
    try {
      const existing = await env.RATE_LIMIT_KV.get(loginAliasKey(normalizedUsername));
      if (existing === normalizedEmail) return;
    } catch {
      // Fall through to attempt the write if reads are unavailable.
    }
  }
  try {
    await env.RATE_LIMIT_KV.put(loginAliasKey(normalizedUsername), normalizedEmail);
  } catch {
    // Login can still proceed with Supabase auth if KV alias caching is temporarily unavailable.
  } finally {
    cache?.set(normalizedUsername, normalizedEmail);
  }
}

async function deleteLoginAlias(env, username) {
  const normalizedUsername = normalizeUsername(username);
  if (!env.RATE_LIMIT_KV?.delete || !normalizedUsername) return;
  try {
    await env.RATE_LIMIT_KV.delete(loginAliasKey(normalizedUsername));
  } catch {
    // Account deletion should not fail solely because KV alias cleanup is unavailable.
  }
}

async function deleteUserProgress(env, userId) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !userId) return;
  const apiUrl = new URL(`${env.SUPABASE_URL}/rest/v1/watch_progress`);
  apiUrl.searchParams.set("user_id", `eq.${userId}`);
  await fetch(apiUrl.toString(), {
    method: "DELETE",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: "return=minimal"
    }
  });
}

function loginAliasKey(username) {
  return `login:username:${username}`;
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

function normalizeEmail(value, allowBlank = false) {
  const trimmed = String(value || "").trim().toLowerCase();
  if (!trimmed) return allowBlank ? "" : null;
  if (trimmed.length > 80) return null;
  return /.+@.+\..+/.test(trimmed) ? trimmed : null;
}

function normalizeServerId(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "videasy") return "videasy";
  if (normalized === "vidrock") return "vidrock";
  if (normalized === "vidking") return "vidking";
  return "";
}

function internalEmailForUsername(username) {
  return `${username}@users.cinerune.app`;
}

function isInternalEmail(email) {
  const normalized = String(email || "").toLowerCase();
  return normalized.endsWith("@users.cinerune.app") || normalized.endsWith("@cinerune.user");
}

function extractUsername(email) {
  if (isInternalEmail(email)) {
    return email.split("@")[0];
  }
  return email;
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

function jsonProxyFromText(text, status = 200) {
  return new Response(text || "{}", {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

async function proxyJson(response, headers = {}) {
  const text = await response.text();
  return new Response(text || "{}", {
    status: response.status,
    headers: {
      "Content-Type": "application/json",
      ...headers
    }
  });
}

function normalizeStringList(value, maxItems, maxLength) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry || "").trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(-maxItems);
}

function normalizeProgressRow(row, userId) {
  const mediaType = row?.media_type === "tv" ? "tv" : "movie";
  const contentId = Number(row?.content_id || 0);
  if (!userId || !Number.isInteger(contentId) || contentId < 1) return null;
  const season = mediaType === "tv" ? clampInteger(row?.season_number, 1, 10000, 1) : 1;
  const episode = mediaType === "tv" ? clampInteger(row?.episode_number, 1, 100000, 1) : 1;
  const timestamp = clampNumber(row?.timestamp_seconds, 0, 60 * 60 * 24, 0);
  const duration = clampNumber(row?.duration_seconds, 0, 60 * 60 * 24, 0);
  const progress = clampNumber(row?.progress_percent, 0, 100, 0);
  return {
    user_id: userId,
    media_type: mediaType,
    content_id: contentId,
    season_number: season,
    episode_number: episode,
    timestamp_seconds: timestamp,
    duration_seconds: duration,
    progress_percent: progress,
    updated_at: normalizeIsoDate(row?.updated_at)
  };
}

function normalizeBookmarkRow(row, userId) {
  const mediaType = row?.media_type === "tv" ? "tv" : "movie";
  const contentId = Number(row?.content_id || 0);
  if (!userId || !Number.isInteger(contentId) || contentId < 1) return null;
  const status = ["watching", "watched", "plan", "dropped", "deleted"].includes(row?.status)
    ? row.status
    : "watching";
  return {
    user_id: userId,
    media_type: mediaType,
    content_id: contentId,
    status,
    title: String(row?.title || "").trim().slice(0, 240),
    poster: String(row?.poster || "").trim().slice(0, 600),
    updated_at: normalizeIsoDate(row?.updated_at)
  };
}

function clampInteger(value, min, max, fallback) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function normalizeIsoDate(value) {
  const timestamp = Date.parse(value || "");
  return new Date(Number.isFinite(timestamp) ? timestamp : Date.now()).toISOString();
}

async function deleteUserBookmarks(env, userId) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !userId) return;
  const apiUrl = new URL(`${env.SUPABASE_URL}/rest/v1/bookmarks`);
  apiUrl.searchParams.set("user_id", `eq.${userId}`);
  await fetch(apiUrl.toString(), {
    method: "DELETE",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: "return=minimal"
    }
  });
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function withCors(response, origin, env, requestOrigin) {
  const allowedOrigin = getAllowedCorsOrigin(origin, env, requestOrigin);
  if (!allowedOrigin) return response;
  response.headers.set("Access-Control-Allow-Origin", allowedOrigin);
  response.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.headers.set("Vary", "Origin");
  return response;
}

function getAllowedCorsOrigin(origin, env, requestOrigin) {
  const value = String(origin || "").trim();
  if (!value || value === "null" || value === "*") return requestOrigin || "";
  const allowed = new Set([
    String(env.SITE_URL || "").trim().replace(/\/$/, ""),
    String(requestOrigin || "").trim().replace(/\/$/, "")
  ].filter(Boolean));
  try {
    const parsed = new URL(value);
    const normalized = parsed.origin;
    const isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i.test(parsed.hostname)
      || parsed.hostname.endsWith(".local");
    return allowed.has(normalized) || isLocal ? normalized : "";
  } catch {
    return "";
  }
}
