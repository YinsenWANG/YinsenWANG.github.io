interface Env {
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_BASE_BRANCH: string;
  ALLOWED_ORIGINS: string;
  AUTH_REDIRECT_URI: string;
  GITHUB_TOKEN: string;
  GITHUB_OAUTH_CLIENT_ID: string;
  GITHUB_OAUTH_CLIENT_SECRET: string;
  SESSION_SECRET: string;
}

type CommentSubmission = {
  postSlug?: unknown;
  content?: unknown;
  company?: unknown;
};

type GitHubIdentity = {
  githubId: number;
  login: string;
  name?: string;
  avatarUrl: string;
  profileUrl: string;
};

type SessionPayload = GitHubIdentity & { exp: number };
type OAuthStatePayload = { nonce: string; returnTo: string; exp: number };
type GitHubUser = {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
};
type GitHubRef = { object: { sha: string } };
type GitHubPullRequest = { number: number };

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };
const githubApiVersion = "2022-11-28";
const sessionLifetimeSeconds = 60 * 60 * 24 * 30;
const oauthStateCookie = "yinsens_blog_oauth_state";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") ?? "";
    const corsHeaders = getCorsHeaders(origin, env.ALLOWED_ORIGINS);

    if (request.method === "OPTIONS") {
      return corsHeaders
        ? new Response(null, { status: 204, headers: corsHeaders })
        : jsonResponse({ ok: false, message: "不允许的来源。" }, 403);
    }
    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse({ ok: true, service: "yinsens-blog-comments" });
    }
    if (request.method === "GET" && url.pathname === "/auth/login") {
      return startGitHubLogin(url, env);
    }
    if (request.method === "GET" && url.pathname === "/auth/callback") {
      return finishGitHubLogin(request, url, env);
    }
    if (request.method === "GET" && url.pathname === "/auth/me") {
      if (!corsHeaders) {
        return jsonResponse({ ok: false, message: "不允许的来源。" }, 403);
      }
      const identity = await authenticateRequest(request, env.SESSION_SECRET);
      return identity
        ? jsonResponse({ ok: true, user: identity }, 200, corsHeaders)
        : jsonResponse(
            { ok: false, message: "登录已过期。" },
            401,
            corsHeaders
          );
    }
    if (request.method !== "POST" || url.pathname !== "/comments") {
      return jsonResponse({ ok: false, message: "未找到。" }, 404, corsHeaders);
    }
    if (!corsHeaders) {
      return jsonResponse({ ok: false, message: "不允许的来源。" }, 403);
    }

    const identity = await authenticateRequest(request, env.SESSION_SECRET);
    if (!identity) {
      return jsonResponse(
        { ok: false, message: "请先使用 GitHub 登录。" },
        401,
        corsHeaders
      );
    }

    try {
      const contentLength = Number(request.headers.get("Content-Length") ?? 0);
      if (contentLength > 12_000) {
        return jsonResponse(
          { ok: false, message: "评论内容过长。" },
          413,
          corsHeaders
        );
      }
      const submission = (await request.json()) as CommentSubmission;
      if (typeof submission.company === "string" && submission.company) {
        return jsonResponse({ ok: true }, 202, corsHeaders);
      }
      const comment = validateSubmission(submission);
      if (!comment.ok) {
        return jsonResponse(
          { ok: false, message: comment.message },
          400,
          corsHeaders
        );
      }

      const pullRequest = await createCommentPullRequest(
        env,
        identity,
        comment
      );
      return jsonResponse(
        {
          ok: true,
          message: "评论已提交，检查通过后会自动发布。",
          pullRequest: pullRequest.number,
        },
        201,
        corsHeaders
      );
    } catch {
      return jsonResponse(
        { ok: false, message: "提交失败，请稍后重试。" },
        500,
        corsHeaders
      );
    }
  },
};

async function startGitHubLogin(url: URL, env: Env): Promise<Response> {
  const returnTo = url.searchParams.get("returnTo") ?? "";
  if (!isAllowedReturnUrl(returnTo, env.ALLOWED_ORIGINS)) {
    return jsonResponse({ ok: false, message: "返回地址无效。" }, 400);
  }

  const nonce = crypto.randomUUID();
  const codeVerifier = encodeBase64Url(
    crypto.getRandomValues(new Uint8Array(32))
  );
  const codeChallenge = encodeBase64Url(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(codeVerifier)
      )
    )
  );
  const state = await signToken(
    { nonce, returnTo, exp: nowSeconds() + 600 },
    env.SESSION_SECRET
  );
  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", env.GITHUB_OAUTH_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", env.AUTH_REDIRECT_URI);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizeUrl.href,
      "Set-Cookie": `${oauthStateCookie}=${nonce}.${codeVerifier}; Path=/auth; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
      "Cache-Control": "no-store",
    },
  });
}

async function finishGitHubLogin(
  request: Request,
  url: URL,
  env: Env
): Promise<Response> {
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const statePayload = await verifyToken<OAuthStatePayload>(
    state,
    env.SESSION_SECRET
  );
  const [cookieNonce, codeVerifier] =
    readCookie(request, oauthStateCookie)?.split(".") ?? [];

  if (
    !code ||
    !statePayload ||
    statePayload.exp < nowSeconds() ||
    !cookieNonce ||
    !codeVerifier ||
    cookieNonce !== statePayload.nonce ||
    !isAllowedReturnUrl(statePayload.returnTo, env.ALLOWED_ORIGINS)
  ) {
    return jsonResponse({ ok: false, message: "GitHub 登录请求无效。" }, 400);
  }

  try {
    const accessToken = await exchangeOAuthCode(code, codeVerifier, env);
    const identity = await fetchGitHubIdentity(accessToken);
    const session = await signToken(
      { ...identity, exp: nowSeconds() + sessionLifetimeSeconds },
      env.SESSION_SECRET
    );
    const returnUrl = new URL(statePayload.returnTo);
    returnUrl.hash = new URLSearchParams({
      "comment-auth": session,
    }).toString();

    return new Response(null, {
      status: 302,
      headers: {
        Location: returnUrl.href,
        "Set-Cookie": `${oauthStateCookie}=; Path=/auth; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    const returnUrl = new URL(statePayload.returnTo);
    returnUrl.hash = "comment-error=oauth";
    return Response.redirect(returnUrl.href, 302);
  }
}

async function exchangeOAuthCode(
  code: string,
  codeVerifier: string,
  env: Env
): Promise<string> {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "yinsens-blog-comments",
    },
    body: JSON.stringify({
      client_id: env.GITHUB_OAUTH_CLIENT_ID,
      client_secret: env.GITHUB_OAUTH_CLIENT_SECRET,
      code,
      code_verifier: codeVerifier,
      redirect_uri: env.AUTH_REDIRECT_URI,
    }),
  });
  const result = (await response.json()) as {
    access_token?: string;
    error?: string;
  };
  if (!response.ok || !result.access_token || result.error) {
    throw new Error("OAuth exchange failed");
  }
  return result.access_token;
}

async function fetchGitHubIdentity(
  accessToken: string
): Promise<GitHubIdentity> {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "yinsens-blog-comments",
      "X-GitHub-Api-Version": githubApiVersion,
    },
  });
  if (!response.ok) throw new Error("GitHub identity request failed");
  const user = (await response.json()) as GitHubUser;
  if (!user.id || !user.login || !user.avatar_url || !user.html_url) {
    throw new Error("GitHub identity is incomplete");
  }
  return {
    githubId: user.id,
    login: user.login,
    ...(user.name ? { name: user.name } : {}),
    avatarUrl: user.avatar_url,
    profileUrl: user.html_url,
  };
}

async function authenticateRequest(
  request: Request,
  secret: string
): Promise<GitHubIdentity | undefined> {
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return undefined;
  const payload = await verifyToken<SessionPayload>(
    authorization.slice(7),
    secret
  );
  if (
    !payload ||
    payload.exp < nowSeconds() ||
    !Number.isInteger(payload.githubId) ||
    !payload.login ||
    !payload.avatarUrl ||
    !payload.profileUrl
  )
    return undefined;

  return {
    githubId: payload.githubId,
    login: payload.login,
    ...(payload.name ? { name: payload.name } : {}),
    avatarUrl: payload.avatarUrl,
    profileUrl: payload.profileUrl,
  };
}

function getCorsHeaders(
  origin: string,
  allowedOrigins: string
): Record<string, string> | undefined {
  const allowed = allowedOrigins
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  if (!allowed.includes(origin)) return undefined;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function isAllowedReturnUrl(value: string, allowedOrigins: string): boolean {
  try {
    const url = new URL(value);
    const allowed = allowedOrigins
      .split(",")
      .map(origin => origin.trim())
      .filter(Boolean);
    return allowed.includes(url.origin);
  } catch {
    return false;
  }
}

function validateSubmission(submission: CommentSubmission) {
  const postSlug = cleanText(submission.postSlug);
  const content = cleanText(submission.content, true);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(postSlug) || postSlug.length > 100) {
    return { ok: false as const, message: "文章标识无效。" };
  }
  if (content.length < 2 || content.length > 2000) {
    return { ok: false as const, message: "评论应为 2–2000 个字符。" };
  }
  return { ok: true as const, postSlug, content };
}

function cleanText(value: unknown, preserveLines = false): string {
  if (typeof value !== "string") return "";
  const normalized = value
    .normalize("NFC")
    .replace(/\u0000/g, "")
    .trim();
  return preserveLines
    ? normalized.replace(/\r\n?/g, "\n").replace(/\n{4,}/g, "\n\n\n")
    : normalized.replace(/\s+/g, " ");
}

async function createCommentPullRequest(
  env: Env,
  identity: GitHubIdentity,
  comment: { postSlug: string; content: string }
): Promise<GitHubPullRequest> {
  await assertPostExists(env, comment.postSlug);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const compactTimestamp = createdAt.replace(/[-:.TZ]/g, "").slice(0, 14);
  const shortId = id.slice(0, 8);
  const branch = `comment/${comment.postSlug}/${compactTimestamp}-${shortId}`;
  const path = `src/data/comments/${comment.postSlug}/${compactTimestamp}-${shortId}.json`;
  const payload = {
    id,
    postSlug: comment.postSlug,
    author: identity,
    content: comment.content,
    createdAt,
  };
  const baseRef = await githubRequest<GitHubRef>(
    env,
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/git/ref/heads/${encodeURIComponent(env.GITHUB_BASE_BRANCH)}`
  );
  await githubRequest(
    env,
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/git/refs`,
    {
      method: "POST",
      body: JSON.stringify({
        ref: `refs/heads/${branch}`,
        sha: baseRef.object.sha,
      }),
    }
  );

  try {
    await githubRequest(
      env,
      `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`,
      {
        method: "PUT",
        body: JSON.stringify({
          message: `Add comment on ${comment.postSlug}`,
          content: encodeBase64(`${JSON.stringify(payload, null, 2)}\n`),
          branch,
        }),
      }
    );
    return await githubRequest<GitHubPullRequest>(
      env,
      `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/pulls`,
      {
        method: "POST",
        body: JSON.stringify({
          title: `评论：${comment.postSlug} · @${identity.login}`,
          head: branch,
          base: env.GITHUB_BASE_BRANCH,
          body: [
            "一条来自博客评论表单的新评论。",
            "",
            `- 文章：\`${comment.postSlug}\``,
            `- 评论者：[@${identity.login}](${identity.profileUrl})`,
            `- GitHub ID：\`${identity.githubId}\``,
            "",
            "合并前请检查内容，并确认此 PR 只新增一个评论数据文件。",
          ].join("\n"),
          maintainer_can_modify: true,
        }),
      }
    );
  } catch (error) {
    await githubRequest(
      env,
      `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/git/refs/heads/${encodeURIComponent(branch)}`,
      { method: "DELETE" }
    ).catch(() => undefined);
    throw error;
  }
}

async function assertPostExists(env: Env, postSlug: string) {
  await githubRequest(
    env,
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/src/content/posts/${postSlug}.md?ref=${encodeURIComponent(env.GITHUB_BASE_BRANCH)}`
  );
}

async function githubRequest<T = unknown>(
  env: Env,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "yinsens-blog-comments",
      "X-GitHub-Api-Version": githubApiVersion,
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub API request failed: ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function signToken(payload: object, secret: string): Promise<string> {
  const encodedPayload = encodeBase64Url(
    new TextEncoder().encode(JSON.stringify(payload))
  );
  const key = await getSigningKey(secret, ["sign"]);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encodedPayload)
  );
  return `${encodedPayload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

async function verifyToken<T>(
  token: string,
  secret: string
): Promise<T | undefined> {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return undefined;
  try {
    const key = await getSigningKey(secret, ["verify"]);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64Url(signature),
      new TextEncoder().encode(payload)
    );
    if (!valid) return undefined;
    return JSON.parse(new TextDecoder().decode(decodeBase64Url(payload))) as T;
  } catch {
    return undefined;
  }
}

function getSigningKey(
  secret: string,
  usages: Array<"sign" | "verify">
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages
  );
}

function encodeBase64(value: string): string {
  return encodeBase64Bytes(new TextEncoder().encode(value));
}
function encodeBase64Url(bytes: Uint8Array): string {
  return encodeBase64Bytes(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function decodeBase64Url(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  return Uint8Array.from(binary, character => character.charCodeAt(0))
    .buffer as ArrayBuffer;
}
function encodeBase64Bytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function readCookie(request: Request, name: string): string | undefined {
  const cookies = request.headers.get("Cookie") ?? "";
  return cookies
    .split(";")
    .map(cookie => cookie.trim().split("="))
    .find(([key]) => key === name)?.[1];
}
function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
function jsonResponse(
  body: unknown,
  status = 200,
  corsHeaders?: Record<string, string>
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...jsonHeaders, ...corsHeaders },
  });
}
