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
  const { verifyAdminToken } = await import("./auth.server");
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Please sign in as the admin");
  if (!verifyAdminToken(token)) throw new HttpError(401, "Your session expired — sign in again");
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
    if (method === "POST" && a === "telegram" && b === "converter" && !c) {
      const { receiveConverter } = await import("./telegram-converter.server");
      return await receiveConverter(request, body);
    }
    // ----- scheduled + internal -----
    // ----- public -----
    if (method === "GET") {
      if (a === "cron" && b === "fetch") {
        const { verifyCronRequest } = await import("./auth.server");
        if (!verifyCronRequest(request)) return json({ detail: "Unauthorized" }, 401);
        return json(await core.startFetchAll(publicOrigin(url), { wait: true }));
      }
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
      const { verifyCronRequest } = await import("./auth.server");
      if (!verifyCronRequest(request)) return json({ detail: "Unauthorized" }, 401);
      return json(await core.startFetchAll(publicOrigin(url), { wait: true }));
    }
    if (method === "POST" && a === "auth" && b === "login") {
      const { login } = await import("./auth.server");
      const token = login(String(body.password || ""));
      if (!token) return json({ detail: "Wrong password" }, 401);
      return json({ token });
    }

    // ----- admin -----
    await requireAdmin(request);
    if (method === "POST" && a === "telegram" && b === "converter") {
      const telegram = await import("./telegram-converter.server");
      if (c === "connect") {
        const origin = typeof body.origin === "string" && body.origin ? body.origin : publicOrigin(url);
        if (origin.length > 2048) throw new HttpError(400, "Site address is too long");
        return json(await telegram.connectConverter(origin));
      }
      if (c === "status") return json(await telegram.converterStatus());
      if (c === "disconnect") return json(await telegram.disconnectConverter());
    }
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
      if (a === "fetch-all") return json(await core.startFetchAll(publicOrigin(url), { wait: false }));
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
    if (/is not set$/.test(String(e?.message))) return json({ detail: "The site isn't connected to its database yet" }, 503);
    console.error("API error", route, e);
    return json({ detail: String(e?.message || "Server error").slice(0, 300) }, 500);
  }
}
