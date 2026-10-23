import { createClient } from "npm:@supabase/supabase-js@2";

const GOOGLE_SCOPE = "openid email https://www.googleapis.com/auth/drive.file";
const TOKEN_SECRET_RPC = "drive_store_refresh_token";
const REFRESH_TOKEN_RPC = "drive_get_refresh_token";

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

function allowedOrigins(): Set<string> {
  const configured =
    Deno.env.get("DRIVE_ALLOWED_ORIGINS") ??
    "https://unit1-offecial-portal.vercel.app,http://localhost:5173";
  return new Set(
    configured
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function cors(origin: string | null): HeadersInit {
  const headers: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
  if (origin && allowedOrigins().has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors(req.headers.get("origin")),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function getAdmin() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getBearer(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  return header.slice(7).trim() || null;
}

async function authenticatedUser(req: Request) {
  const token = getBearer(req);
  if (!token) throw new Error("Sign in to the portal first.");
  const admin = getAdmin();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error("Your portal session is invalid or expired.");
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError || !profile) throw new Error("Your portal profile could not be verified.");
  return { admin, user: data.user, role: profile.role as string };
}

function requireAllowedOrigin(req: Request): string {
  const origin = req.headers.get("origin");
  if (!origin || !allowedOrigins().has(origin))
    throw new Error("This portal origin is not authorized for Drive access.");
  return origin;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function hashState(state: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(state));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getRedirectUri(): string {
  return `${env("SUPABASE_URL").replace(/\/$/, "")}/functions/v1/drive-oauth`;
}

function safeReturnTo(value: unknown, origin: string): string {
  if (typeof value !== "string") throw new Error("A portal return URL is required.");
  const url = new URL(value);
  if (url.origin !== origin || url.pathname !== "/manage/drive") {
    throw new Error("The Drive return URL must be this portal's Drive settings page.");
  }
  url.search = "";
  url.hash = "";
  return url.toString();
}

function addResult(returnTo: string, key: string, value: string): string {
  const url = new URL(returnTo);
  url.searchParams.set(key, value);
  return url.toString();
}

async function refreshGoogleAccessToken(admin: ReturnType<typeof getAdmin>): Promise<string> {
  const { data: refreshToken, error } = await admin.rpc(REFRESH_TOKEN_RPC);
  if (error || typeof refreshToken !== "string" || !refreshToken) {
    throw new Error("Connect the Unit Leader Google Drive account before continuing.");
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("GOOGLE_OAUTH_CLIENT_ID"),
      client_secret: env("GOOGLE_OAUTH_CLIENT_SECRET"),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || typeof result.access_token !== "string") {
    throw new Error("Google Drive authorization expired. Reconnect the Unit Leader account.");
  }
  return result.access_token;
}

async function startAuthorization(
  req: Request,
  payload: Record<string, unknown>,
): Promise<Response> {
  const origin = requireAllowedOrigin(req);
  const { admin, user, role } = await authenticatedUser(req);
  if (role !== "unit_leader") throw new Error("Only the Unit Leader can connect Google Drive.");

  const returnTo = safeReturnTo(payload.returnTo, origin);
  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  const state = encodeBase64Url(random);
  const stateHash = await hashState(state);
  const { error: cleanupError } = await admin
    .from("drive_oauth_states")
    .delete()
    .lt("expires_at", new Date().toISOString());
  if (cleanupError) throw new Error("Could not initialize the secure Google authorization flow.");
  const { error: insertError } = await admin.from("drive_oauth_states").insert({
    state_hash: stateHash,
    user_id: user.id,
    return_to: returnTo,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  if (insertError) throw new Error("Could not initialize the secure Google authorization flow.");

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.search = new URLSearchParams({
    client_id: env("GOOGLE_OAUTH_CLIENT_ID"),
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPE,
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: "true",
    state,
  }).toString();
  return json(req, 200, { authUrl: authUrl.toString() });
}

async function pickerConfig(req: Request): Promise<Response> {
  requireAllowedOrigin(req);
  const { admin, role } = await authenticatedUser(req);
  if (role !== "unit_leader") throw new Error("Only the Unit Leader can configure Drive folders.");
  const apiKey = env("DRIVE_API_KEY");
  const appId = env("DRIVE_CLOUD_PROJECT_NUMBER");
  const accessToken = await refreshGoogleAccessToken(admin);
  return json(req, 200, { accessToken, apiKey, appId });
}

async function oauthCallback(req: Request): Promise<Response> {
  const requestUrl = new URL(req.url);
  const state = requestUrl.searchParams.get("state");
  if (!state) return new Response("Missing OAuth state.", { status: 400 });

  const admin = getAdmin();
  const stateHash = await hashState(state);
  const { data: stateRow, error: stateError } = await admin
    .from("drive_oauth_states")
    .select("state_hash, user_id, return_to, expires_at")
    .eq("state_hash", stateHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (stateError || !stateRow)
    return new Response(
      "Google authorization state is invalid or expired. Return to the portal and try again.",
      { status: 400 },
    );

  const { error: deleteError } = await admin
    .from("drive_oauth_states")
    .delete()
    .eq("state_hash", stateHash);
  if (deleteError)
    return new Response("Could not complete the secure Google authorization flow.", {
      status: 500,
    });

  const returnTo = stateRow.return_to as string;
  const providerError = requestUrl.searchParams.get("error");
  if (providerError)
    return Response.redirect(
      addResult(
        returnTo,
        "drive_error",
        providerError === "access_denied" ? "access_denied" : "oauth_failed",
      ),
      303,
    );

  const code = requestUrl.searchParams.get("code");
  if (!code) return Response.redirect(addResult(returnTo, "drive_error", "oauth_failed"), 303);

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", stateRow.user_id)
    .maybeSingle();
  if (profileError || profile?.role !== "unit_leader") {
    return Response.redirect(addResult(returnTo, "drive_error", "role_changed"), 303);
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env("GOOGLE_OAUTH_CLIENT_ID"),
        client_secret: env("GOOGLE_OAUTH_CLIENT_SECRET"),
        redirect_uri: getRedirectUri(),
        grant_type: "authorization_code",
      }),
    });
    const tokenResult = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || typeof tokenResult.access_token !== "string") {
      return Response.redirect(addResult(returnTo, "drive_error", "oauth_failed"), 303);
    }

    if (typeof tokenResult.refresh_token === "string" && tokenResult.refresh_token.length > 20) {
      const { error: storeError } = await admin.rpc(TOKEN_SECRET_RPC, {
        _refresh_token: tokenResult.refresh_token,
      });
      if (storeError) throw new Error("Supabase Vault could not store the Google refresh token.");
    } else {
      const { data: existingToken, error: readError } = await admin.rpc(REFRESH_TOKEN_RPC);
      if (readError || typeof existingToken !== "string" || !existingToken) {
        return Response.redirect(addResult(returnTo, "drive_error", "missing_refresh_token"), 303);
      }
    }
    return Response.redirect(addResult(returnTo, "drive_connected", "1"), 303);
  } catch (_error) {
    return Response.redirect(addResult(returnTo, "drive_error", "oauth_failed"), 303);
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    if (origin && !allowedOrigins().has(origin)) return new Response(null, { status: 403 });
    return new Response("ok", { headers: cors(origin) });
  }

  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.has("state")) {
    try {
      return await oauthCallback(req);
    } catch (_error) {
      return new Response(
        "Google Drive authorization could not be completed. Return to the portal and try again.",
        { status: 500 },
      );
    }
  }
  if (req.method !== "POST") return json(req, 405, { error: "Method not allowed." });
  if (origin && !allowedOrigins().has(origin))
    return new Response(
      JSON.stringify({ error: "This portal origin is not authorized for Drive access." }),
      { status: 403 },
    );

  try {
    const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (payload.action === "start") return await startAuthorization(req, payload);
    if (payload.action === "picker_config") return await pickerConfig(req);
    return json(req, 400, { error: "Unknown Drive OAuth action." });
  } catch (error) {
    return json(req, 400, {
      error: error instanceof Error ? error.message : "Google Drive authorization failed.",
    });
  }
});
