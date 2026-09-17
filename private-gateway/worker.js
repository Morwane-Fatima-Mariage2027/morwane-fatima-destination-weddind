const COOKIE_NAME = "mf_guest_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const UPSTREAM = "https://morwane-fatima-mariage2027.github.io/morwane-fatima-destination-weddind";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/access" && request.method === "GET") {
      return html(accessPage());
    }

    if (url.pathname === "/api/guest-login" && request.method === "POST") {
      return guestLogin(request, env);
    }

    if (url.pathname === "/logout") {
      return new Response(null, {
        status: 303,
        headers: {
          Location: "/access",
          "Set-Cookie": `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
        },
      });
    }

    if (url.pathname.startsWith("/admin")) {
      const email = request.headers.get("Cf-Access-Authenticated-User-Email") || "";
      const allowed = (env.ADMIN_EMAILS || "")
        .split(",")
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);

      if (!email || !allowed.includes(email.toLowerCase())) {
        return new Response("Admin access required", { status: 403 });
      }

      return proxyToUpstream(request, url);
    }

    const session = await readSession(request, env.SESSION_SECRET);
    if (!session || session.role !== "guest" || session.exp < Math.floor(Date.now() / 1000)) {
      return Response.redirect(`${url.origin}/access`, 302);
    }

    return proxyToUpstream(request, url);
  },
};

async function guestLogin(request, env) {
  const form = await request.formData();
  const rawCode = String(form.get("code") || "").trim();

  if (!rawCode) return html(accessPage("Entre ton code d’invitation."), 400);

  const codeHash = await sha256(rawCode.toUpperCase());
  const invite = await env.DB.prepare(
    "SELECT id, label, active FROM invitations WHERE code_hash = ? LIMIT 1"
  )
    .bind(codeHash)
    .first();

  if (!invite || invite.active !== 1) {
    return html(accessPage("Ce code n’est pas reconnu. Vérifie l’invitation reçue."), 401);
  }

  await env.DB.prepare(
    "UPDATE invitations SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?"
  )
    .bind(invite.id)
    .run();

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    role: "guest",
    invitation_id: invite.id,
    label: invite.label,
    iat: now,
    exp: now + SESSION_MAX_AGE,
  };

  const token = await signSession(payload, env.SESSION_SECRET);
  return new Response(null, {
    status: 303,
    headers: {
      Location: "/",
      "Set-Cookie": `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`,
    },
  });
}

async function proxyToUpstream(request, incomingUrl) {
  const target = new URL(UPSTREAM + incomingUrl.pathname + incomingUrl.search);
  const headers = new Headers(request.headers);
  headers.delete("cookie");
  headers.set("host", target.host);

  const init = {
    method: request.method,
    headers,
    redirect: "follow",
  };
  if (!["GET", "HEAD"].includes(request.method)) init.body = request.body;

  const response = await fetch(target, init);
  const outHeaders = new Headers(response.headers);
  outHeaders.set("Cache-Control", "private, no-store");
  outHeaders.set("X-Robots-Tag", "noindex, nofollow, noarchive");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: outHeaders,
  });
}

async function signSession(payload, secret) {
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  const body = base64url(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `${body}.${base64urlBytes(new Uint8Array(signature))}`;
}

async function readSession(request, secret) {
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie
    .split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);

  if (!token || !secret) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64urlToBytes(sig),
    new TextEncoder().encode(body)
  );
  if (!valid) return null;

  try {
    return JSON.parse(new TextDecoder().decode(base64urlToBytes(body)));
  } catch {
    return null;
  }
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function base64url(value) {
  return btoa(unescape(encodeURIComponent(value)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64urlBytes(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64urlToBytes(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}

function accessPage(error = "") {
  const safeError = error.replace(/[<>&\"]/g, "");
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>Morwane & Fatima — Accès invités</title>
<style>
:root{--ink:#132238;--indigo:#173f75;--terra:#b9684f;--gold:#b8955d;--cream:#fbf7f0;--ivory:#fffdf9}
*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;background:radial-gradient(circle at 20% 20%,rgba(185,149,93,.18),transparent 30%),linear-gradient(145deg,#10273f,#173f75 62%,#245d79);font-family:Arial,sans-serif;color:var(--ink);padding:24px}.card{width:min(520px,100%);background:rgba(255,253,249,.97);border-radius:30px;padding:42px;box-shadow:0 28px 90px rgba(0,0,0,.28);text-align:center}.mark{width:58px;height:58px;margin:0 auto 24px;border:1px solid var(--gold);display:grid;place-items:center;transform:rotate(45deg)}.mark span{transform:rotate(-45deg);font-family:Georgia,serif;font-size:22px;color:var(--indigo)}h1{font-family:Georgia,serif;font-weight:400;font-size:42px;margin:0 0 10px}.date{letter-spacing:.18em;text-transform:uppercase;font-size:11px;color:var(--gold);margin-bottom:30px}.intro{font-size:14px;line-height:1.7;color:#59616b;margin-bottom:26px}label{display:block;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.15em;font-weight:700;margin-bottom:8px}input{width:100%;border:1px solid rgba(19,34,56,.18);border-radius:16px;padding:16px 17px;background:white;font-size:18px;letter-spacing:.08em;text-align:center;text-transform:uppercase;outline:none}input:focus{border-color:var(--indigo);box-shadow:0 0 0 4px rgba(23,63,117,.08)}button{width:100%;margin-top:14px;border:0;border-radius:16px;padding:16px 18px;background:var(--indigo);color:white;font-weight:700;letter-spacing:.06em;cursor:pointer}.error{background:#fff1ed;color:#8a3f31;padding:12px 14px;border-radius:12px;font-size:13px;margin-bottom:18px}.small{font-size:11px;line-height:1.6;color:#7a7e82;margin-top:18px}@media(max-width:520px){.card{padding:32px 22px}h1{font-size:34px}}
</style>
</head>
<body>
<main class="card">
<div class="mark"><span>M&F</span></div>
<h1>Morwane & Fatima</h1>
<div class="date">Marrakech · 25–26 mai 2027</div>
<p class="intro">Bienvenue dans notre espace mariage privé. Entre le code personnel reçu avec ton invitation pour accéder au site.</p>
${safeError ? `<div class="error">${safeError}</div>` : ""}
<form method="post" action="/api/guest-login" autocomplete="off">
<label for="code">Code d’invitation</label>
<input id="code" name="code" inputmode="text" maxlength="32" required placeholder="Ex. MF-7K9P2">
<button type="submit">Entrer dans le mariage</button>
</form>
<p class="small">Ce site est réservé à nos invités. Merci de ne pas partager ton code.</p>
</main>
</body>
</html>`;
}
