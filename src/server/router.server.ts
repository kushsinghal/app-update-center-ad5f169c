// @ts-nocheck — HTTP dispatcher for the app's API (public reads, admin actions, scheduled scan).
import * as core from "./core.server";
import { HttpError } from "./core.server";

type Ctx = { request: Request; url: URL; parts: string[]; body: any };

const json = (data: any, status = 200) => Response.json(data, { status });

/** Background requests must target a public host; the editor preview host sits behind a sign-in wall. */
function publicOrigin(url: URL) {
  const m = url.host.match(/^id-preview--([0-9a-f-]+)\.(.+)$/);
  if (m) return `https://project--${m[1]}-dev.${m[2]}`;
  return url.origin;
}

async function requireAdmin(request: Request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Please sign in as the admin");
  const { createClient } = await import("@supabase/supabase-js");
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  const sb = createClient(process.env["SUPABASE_URL"], key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        h.set("apikey", key);
        h.set("Authorization", `Bearer ${token}`);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data: u, error } = await sb.auth.getUser(token);
  if (error || !u?.user) throw new HttpError(401, "Your session expired — sign in again");
  const { data: isAdmin } = await sb.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
  if (!isAdmin) throw new HttpError(403, "This account is not an admin");
}

export async function handle(request: Request, splat: string) {
  const url = new URL(request.url);
  const parts = splat.split("/").filter(Boolean).map(decodeURIComponent);
  const method = request.method.toUpperCase();
  let body: any = {};
  if (method !== "GET" && method !== "HEAD") {
    const t = await request.text();
    if (t) {
      try { body = JSON.parse(t); } catch { return json({ detail: "Invalid JSON" }, 400); }
    }
  }
  const qp = (k: string) => url.searchParams.get(k);
  const [a, b, c] = parts;
  const route = `${method} ${parts.length ? parts.map((p, i) => (i > 0 && /^[0-9a-f-]{8,}$/i.test(p) && !["d"].includes(p) ? ":id" : p)).join("/") : ""}`;

  try {
    // ----- scheduled + internal -----
    // ----- public -----
    if (method === "GET") {
      if (a === "deals" && !b) return json(await core.listDeals({ category: qp("category"), q: qp("q"), store: qp("store"), sort: qp("sort"), limit: qp("limit") }));
      if (a === "deals" && b && c === "original") return json(await core.originalPost(b));
      if (a === "price-history" && b) return json(await core.priceHistory(b));
      if (a === "stats") return json(await core.stats());
      if (a === "go" && b === "d" && c) return await core.goDeal(c);
      if (a === "go" && b && !c) return await core.goLink(b);
      if (a === "image-proxy") return await core.imageProxy(qp("url") || "");
      if (a === "public-settings") return json(await core.publicSettingsView());
    }
    if (method === "POST" && a === "cron" && b === "fetch") {
      const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
      const fail = await authenticateCronRequest(request);
      if (fail) return fail;
      return json(await core.startFetchAll(publicOrigin(url)));
    }
    if (method === "POST" && a === "internal" && b === "fetch-source") {
      if (!(await core.verifyInternalKey(request.headers.get("x-internal-key")))) return json({ detail: "Unauthorized" }, 401);
      return json(await core.fetchSourceById(String(body.source_id), body.run_id || null));
    }

    // ----- admin -----
    await requireAdmin(request);
    if (method === "GET") {
      if (a === "lookup") return json(await core.lookup(qp("url") || ""));
      if (a === "sources") return json(await core.listSources());
      if (a === "destinations") return json(await core.listDestinations());
      if (a === "settings") return json(await core.readSettings());
      if (a === "logs") return json(await core.logs(Number(qp("limit") || 200)));
    }
    if (method === "POST") {
      if (a === "deals" && b === "reconvert") return json(await core.reconvert());
      if (a === "deals" && !b) return json(await core.addDeal(body));
      if (a === "deals" && b && c === "post") return json(await core.repost(b, qp("destination_id")));
      if (a === "sources" && !b) return json(await core.addSource(body));
      if (a === "sources" && b && c === "fetch") return json(await core.fetchSourceById(b));
      if (a === "fetch-all") return json(await core.startFetchAll(publicOrigin(url)));
      if (a === "destinations" && !b) return json(await core.addDestination(body));
      if (a === "destinations" && b && c === "test") return json(await core.testDestination(b));
      if (a === "destinations" && b && c === "send-recent") return json(await core.sendRecent(b));
      if (a === "convert" && b === "bulk") return json(await core.convertBulk(body));
      if (a === "convert" && !b) return json(await core.convertOne(body.url));
      if (a === "telegram" && b === "chats") return json(await core.findChats(body));
    }
    if (method === "PUT") {
      if (a === "deals" && b && c === "feature") return json(await core.featureDeal(b, body.featured));
      if (a === "sources" && b) return json(await core.updateSource(b, body));
      if (a === "destinations" && b) return json(await core.updateDestination(b, body));
      if (a === "settings") return json(await core.writeSettings(body));
      if (a === "go" && b) return json(await core.setLinkImage(b, body.image));
    }
    if (method === "DELETE") {
      if (a === "deals" && b) return json(await core.deleteDeal(b));
      if (a === "sources" && b) return json(await core.deleteSource(b));
      if (a === "destinations" && b) return json(await core.deleteDestination(b));
    }
    return json({ detail: `Not found: ${route}` }, 404);
  } catch (e) {
    if (e instanceof HttpError) return json({ detail: e.message }, e.status);
    console.error("API error", route, e);
    return json({ detail: String(e?.message || "Server error").slice(0, 300) }, 500);
  }
}
