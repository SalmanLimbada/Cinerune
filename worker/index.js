const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_BY_ACTION = {
  login: 10,
  signup: 30
};
const MAX_BODY_BYTES = 65536;
const AUTH_RATE_LIMIT_DISABLED_VALUE = "true";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "*";

    if (!url.pathname.startsWith("/api/")) {
      if (env.ASSETS?.fetch) {
        const cleanPath = url.pathname.replace(/\/+$/, "") || "/";
        const cleanRoutes = {
          "/": "/index.html",
          "/index": "/index.html",
          "/browse": "/browse.html",
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

      if (url.pathname === "/api/auth/me") {
        return withCors(await handleAuthMe(request, env), origin);
      }

      if (url.pathname === "/api/auth/forgot") {
        return withCors(await handleAuthForgot(request, env), origin);
      }

      if (url.pathname === "/api/auth/add-email") {
        return withCors(await handleAuthAddEmail(request, env), origin);
      }

      if (url.pathname === "/api/auth/logout") {
        return withCors(await handleAuthLogout(request, env), origin);
      }

      if (url.pathname === "/api/auth/update") {
        return withCors(await handleAuthUpdate(request, env), origin);
      }

      if (url.pathname === "/api/auth/delete") {
        return withCors(await handleAuthDelete(request, env), origin);
      }

      if (url.pathname === "/api/progress/pull") {
        return withCors(await handleProgressPull(request, env, url), origin);
      }

      if (url.pathname === "/api/progress/push") {
        return withCors(await handleProgressPush(request, env), origin);
      }

      if (url.pathname === "/api/report") {
        return withCors(await handleReportSubmit(request, env), origin);
      }

      return withCors(jsonResponse({ error: "Not found" }, 404), origin);
    } catch (error) {
      const message = error?.message || "Server error";
      const status = message === "Payload too large" ? 413 : 500;
      return withCors(jsonResponse({ error: message }, status), origin);
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
        await storeLoginAliases(env, identifier, email);
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

  const existingEmail = env.RATE_LIMIT_KV?.get ? await env.RATE_LIMIT_KV.get(loginAliasKey(username)) : null;
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
    await storeLoginAliases(env, username, loginEmail);
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
    await storeLoginAliases(env, user.user_metadata.username, user.email);
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

  const currentUser = await fetchSupabaseUser(env, token);
  if (!currentUser?.id) {
    return jsonResponse({ error: "Could not verify user." }, 401);
  }

  const payload = await readJson(request);
  const avatarId = payload?.avatarId === undefined ? "" : normalizeAvatarId(payload?.avatarId);
  const username = payload?.username === undefined ? "" : normalizeUsername(payload?.username);
  const email = payload?.email === undefined ? undefined : normalizeEmail(payload?.email, false);
  const password = payload?.password === undefined ? "" : String(payload?.password || "");
  const currentPassword = String(payload?.currentPassword || "");
  const recoveryMode = payload?.recovery === true;

  const update = {};
  const data = {};

  if (payload?.avatarId !== undefined) {
    if (!avatarId) return jsonResponse({ error: "Invalid avatar." }, 400);
    data.avatarId = avatarId;
  }

  if (payload?.username !== undefined) {
    if (!username) return jsonResponse({ error: "Invalid username." }, 400);
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
    update.data = data;
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
      await storeLoginAliases(env, username, currentUser.email);
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
      aliasEmail
    );
  }
  return response;
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

  const apiUrl = new URL(`${env.SUPABASE_URL}/rest/v1/watch_progress`);
  apiUrl.searchParams.set("on_conflict", "user_id,media_type,content_id,season_number,episode_number");
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

async function handleReportSubmit(request, env) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
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

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
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
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
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
  const existing = await env.RATE_LIMIT_KV.get(key, "json");

  if (!existing || now >= existing.resetAt) {
    const record = { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
    await env.RATE_LIMIT_KV.put(key, JSON.stringify(record), {
      expirationTtl: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)
    });
    return { blocked: false, retryAfter: 0 };
  }

  if (existing.count >= maxAttempts) {
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

  const key = loginAliasKey(identifier);
  const mapped = env.RATE_LIMIT_KV?.get ? await env.RATE_LIMIT_KV.get(key) : "";
  return mapped || internalEmailForUsername(identifier);
}

async function resolveLoginEmails(env, identifier) {
  if (!identifier) return [];
  if (identifier.includes("@")) return [identifier];

  const internalEmail = internalEmailForUsername(identifier);
  const legacyInternalEmail = `${identifier}@cinerune.user`;
  const mapped = env.RATE_LIMIT_KV?.get ? await env.RATE_LIMIT_KV.get(loginAliasKey(identifier)) : "";
  return [mapped, internalEmail, legacyInternalEmail].filter((email, index, emails) => {
    const normalized = normalizeEmail(email, false);
    return normalized && emails.indexOf(email) === index;
  });
}

async function storeLoginAliases(env, username, email) {
  const normalizedUsername = normalizeUsername(username);
  const normalizedEmail = normalizeEmail(email, false);
  if (!env.RATE_LIMIT_KV?.put || !normalizedUsername || !normalizedEmail) return;
  await env.RATE_LIMIT_KV.put(loginAliasKey(normalizedUsername), normalizedEmail);
}

async function deleteLoginAlias(env, username) {
  const normalizedUsername = normalizeUsername(username);
  if (!env.RATE_LIMIT_KV?.delete || !normalizedUsername) return;
  await env.RATE_LIMIT_KV.delete(loginAliasKey(normalizedUsername));
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

async function proxyJson(response) {
  const text = await response.text();
  return new Response(text || "{}", {
    status: response.status,
    headers: {
      "Content-Type": "application/json"
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

function withCors(response, origin) {
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.headers.set("Vary", "Origin");
  return response;
}
