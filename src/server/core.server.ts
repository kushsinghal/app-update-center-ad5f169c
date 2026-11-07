// @ts-nocheck — port of the original backend endpoints onto Lovable Cloud tables.
import * as engine from "./engine.server";

export class HttpError extends Error {
  status: number;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
  }
}

async function getDb() {
  const { db } = await import("./db.server");
  return db as any;
}

const now = () => new Date().toISOString();
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const uuid = () => crypto.randomUUID();
const mask = (t: string) => (t && t.length > 10 ? `${t.slice(0, 4)}••••${t.slice(-4)}` : t ? "••••" : "");
const ageMinutes = (iso: string) => {
  const t = new Date(iso).getTime();
  return isNaN(t) ? 0 : (Date.now() - t) / 60000;
};
const titleKey = (t: string) => (t || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
const MAJOR_STORES = ["Flipkart", "Amazon", "Myntra", "Ajio"];
const BULK_MAX = 10;
const SPLIT_MAX = 10;

const DEFAULT_SETTINGS = {
  auto_post: true, supercoin_enabled: true, gold_enabled: true, giftcard_enabled: true, giftcard_min: 5,
  product_enabled: true, product_min: 70, loot_enabled: true, keywords: [],
  convert_enabled: true, sankmo_api_url: "", sankmo_token: "", convert_mode: "sankmo_api",
  earnkaro_token: "", affiliate_routes: {},
  check_interval_minutes: 5, check_interval_seconds: 300, post_style: "simple", max_posts_per_update: 20,
  website_max_age_hours: 24, telegram_max_age_minutes: 60, last_run_at: null,
  copy_header: "🪙 100% SuperCoin Deals 🪙", copy_link_style: "direct", sankmo_stores: engine.SANKMO_DEFAULT, split_multi: true,
};

async function check(res: any) {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export async function getSettings() {
  const db = await getDb();
  const row = await check(await db.from("settings").select("*").eq("id", "main").maybeSingle());
  return { ...DEFAULT_SETTINGS, ...(row || {}) };
}

async function updateSettings(patch: any) {
  const db = await getDb();
  await check(await db.from("settings").upsert({ ...patch, id: "main", updated_at: now() }));
}

async function safeConvert(url: string, settings: any) {
  try {
    return await engine.convertLink(url, settings);
  } catch (e) {
    console.warn("Link conversion failed", e?.message);
    return url;
  }
}

function destMatches(dest: any, deal: any) {
  const cats = new Set(deal.categories || []);
  if (!cats.size) return false;
  if (dest.categories?.length && !dest.categories.some((c) => cats.has(c))) return false;
  if (dest.stores?.length && !dest.stores.includes(deal.store)) return false;
  const minD = Number(dest.min_discount) || 0;
  if (minD && !cats.has("supercoin_100") && !cats.has("loot") && (Number(deal.discount) || 0) < minD) return false;
  return true;
}

async function postDeal(deal: any, destId?: string | null) {
  const db = await getDb();
  let q = db.from("destinations").select("*").order("created_at");
  q = destId ? q.eq("id", destId) : q.eq("enabled", true);
  const dests = await check(await q.limit(100));
  const text = engine.formatMessage(deal, (await getSettings()).post_style || "simple");
  const results: any[] = [];
  for (const d of dests) {
    if (!destId && !destMatches(d, deal)) continue;
    const log: any = { id: uuid(), deal_id: deal.id, deal_title: deal.title, destination_id: d.id, destination_name: d.name, url: deal.affiliate_url, created_at: now() };
    try {
      await engine.sendTelegram(d.bot_token, d.chat_id, text, deal.image, deal);
      log.status = "success";
      log.error = null;
    } catch (e) {
      log.status = "failed";
      log.error = String(e?.message || e).slice(0, 300);
    }
    await db.from("post_logs").insert(log);
    results.push(log);
  }
  const sent = results.filter((r) => r.status === "success").map((r) => r.destination_name);
  if (sent.length) {
    const cur = await check(await db.from("deals").select("posted_to").eq("id", deal.id).maybeSingle());
    const merged = [...new Set([...(cur?.posted_to || []), ...sent])];
    await db.from("deals").update({ posted_to: merged }).eq("id", deal.id);
  }
  return results;
}

async function recordPrice(deal: any) {
  if (!deal.price) return;
  const db = await getDb();
  const prev = await check(await db.from("price_history").select("price").eq("product_key", deal.product_key).limit(500));
  await db.from("price_history").insert({ product_key: deal.product_key, price: deal.price, mrp: deal.mrp, store: deal.store, source: deal.source, at: deal.posted_at });
  const prices = prev.map((p) => Number(p.price)).filter(Boolean);
  deal.history_count = prices.length + 1;
  deal.lowest_seen = Math.min(...prices, deal.price);
  deal.highest_seen = Math.max(...prices, deal.price);
  deal.lowest_ever = prices.length > 0 && deal.price < Math.min(...prices);
  if (deal.lowest_ever) await db.from("deals").update({ lowest_ever: false }).eq("product_key", deal.product_key);
}

async function phData(url: string, maxAgeHours = 6) {
  if (!engine.phSupported(url)) return null;
  const db = await getDb();
  const cached = await check(await db.from("ph_cache").select("*").eq("url", url).maybeSingle());
  if (cached && ageMinutes(cached.fetched_at) < maxAgeHours * 60) return cached.data;
  let data;
  try {
    data = await engine.phLookup(url);
  } catch (e) {
    console.warn("pricehistory failed", url, e?.message);
    return cached ? cached.data : null;
  }
  await db.from("ph_cache").upsert({ url, data, fetched_at: now() });
  return data;
}

async function enrich(dealId: string) {
  const db = await getDb();
  const d = await check(await db.from("deals").select("*").eq("id", dealId).maybeSingle());
  if (!d) return;
  const ph = await phData(d.clean_url);
  const upd: any = { ph_checked: true };
  if (d.store === "Other" && engine.detectStore(d.clean_url) !== "Other") upd.store = engine.detectStore(d.clean_url);
  if (ph) {
    if (ph.name && (d.title || "").replace(/[^A-Za-z]/g, "").length < 14) upd.title = engine.cleanTitle(ph.name) || ph.name;
    Object.assign(upd, { ph_min: ph.min ?? null, ph_max: ph.max ?? null, ph_avg: ph.avg ?? null, ph_url: ph.page_url ?? null });
    if (!d.image && ph.image) upd.image = ph.image;
    const manual = d.source_id === "manual" && d.price;
    let price = d.text_price ?? d.price, mrp = d.text_mrp ?? d.mrp;
    if (d.source_id === "manual") { price = d.price; mrp = d.mrp; }
    const ref = ph.min || ph.price;
    if (price && ref && price < ref * 0.3 && !manual) { price = null; mrp = null; }
    if (!price) price = ph.price ?? null;
    if (!mrp && ph.mrp && !manual) mrp = ph.mrp;
    if (price && mrp && mrp <= price * 1.03) mrp = null;
    const discount = manual ? d.discount : engine.extractDiscount(d.text || "", price, mrp);
    const settings = await getSettings();
    const cats = d.source_id === "manual" ? d.categories : engine.classify(d.text || "", discount, settings);
    Object.assign(upd, { price, mrp, discount, categories: cats,
      store_price: ph.price && price && ph.price > price * 1.01 ? ph.price : null,
      offers: engine.markBestCard(d.offers || [], price) });
    if (price && ph.min) upd.lowest_ever = price <= ph.min;
  }
  await db.from("deals").update(upd).eq("id", dealId);
}

function linkContext(text: string, link: string) {
  const i = text.indexOf(link);
  if (i < 0) return "";
  let start = 0;
  for (const m of text.slice(0, i).matchAll(engine.urlRe())) start = m.index + m[0].length;
  const end = text.indexOf("\n", i);
  return text.slice(start, i) + (end > 0 ? text.slice(i + link.length, end) : text.slice(i + link.length));
}

async function dealInfo(url: string) {
  const db = await getDb();
  const info: any = { title: null, image: null, price: null, mrp: null, price_history: null };
  const keys = [engine.productKey(url)];
  const itm = url.match(/\/(itm[a-z0-9]+)/);
  if (itm) keys.push(`flipkart:${itm[1]}`);
  const orFilter = [`product_key.in.(${keys.map((k) => `"${k.replace(/"/g, "")}"`).join(",")})`, itm ? `clean_url.ilike.*${itm[1]}*` : `clean_url.eq."${url.replace(/"/g, "")}"`].join(",");
  const known = (await check(await db.from("deals").select("image,title").or(orFilter).not("image", "is", null).order("posted_at", { ascending: false }).limit(1)))[0];
  if (known) info.image = known.image;
  const ph = await phData(url);
  if (ph) {
    for (const [k, src] of [["title", "name"], ["image", "image"], ["price", "price"], ["mrp", "mrp"]]) info[k] = info[k] || ph[src] || null;
    info.price_history = { lowest: ph.min ?? null, lowest_on: ph.min_on ?? null, highest: ph.max ?? null, average: ph.avg ?? null, url: ph.page_url ?? null };
  }
  if (known && !info.title) info.title = known.title;
  if (!info.image && !url.includes("flipkart")) info.image = await engine.fetchOgImage(url);
  if (info.title) info.title = engine.cleanTitle(decodeEntities(info.title)) || info.title;
  if (info.price && info.mrp && info.mrp <= info.price * 1.03) info.mrp = null;
  return info;
}

const decodeEntities = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;/g, "'");

async function ingest(parsed: any, source: any, settings: any, autopost: boolean, runId?: string | null) {
  const db = await getDb();
  const key = `${source.id}:${parsed.ext_id || parsed.url}`;
  delete parsed.ext_id;
  const ins = await db.from("seen").insert({ key, at: now() });
  if (ins.error) return null; // already seen
  const rawPosted = parsed.posted_at;
  delete parsed.posted_at;
  if (!rawPosted && source.id !== "manual") return null;
  const postedAt = rawPosted || now();
  if (source.id !== "manual" && ageMinutes(postedAt) > settings.website_max_age_hours * 60) return null;
  const deal: any = { ...parsed, id: uuid(), dedupe_key: key, source: source.name, source_id: String(source.id), posted_to: [], created_at: now(),
    posted_at: postedAt, text_price: parsed.price ?? null, text_mrp: parsed.mrp ?? null };
  deal.title = engine.cleanTitle(deal.title) || deal.title || "Deal";
  if (deal.url.includes("dealsmagnet.com/deal")) {
    try {
      const [u, img] = await engine.resolveDealsmagnet(deal.url);
      deal.url = u;
      deal.image = deal.image || img;
      deal.store = engine.detectStore(deal.url, deal.text || "");
    } catch (e) {
      console.warn("dealsmagnet resolve failed", e?.message);
    }
  }
  deal.clean_url = await engine.cleanLink(deal.url);
  deal.offers = engine.markBestCard(engine.extractOffers(`${deal.text || ""}\n${deal.note || ""}`), deal.price);
  if (deal.store === "Other") deal.store = engine.detectStore(deal.clean_url, deal.text || "");
  deal.title_key = titleKey(deal.title);
  deal.product_key = engine.productKey(deal.clean_url);
  if (source.id !== "manual") {
    const since = ago(2 * 86400e3);
    const checks = [db.from("deals").select("id").eq("clean_url", deal.clean_url).gte("created_at", since).limit(1)];
    if (!deal.split) checks.push(db.from("deals").select("id").eq("title_key", deal.title_key).neq("source_id", String(source.id)).gte("created_at", ago(3 * 3600e3)).limit(1));
    if (deal.product_key) {
      let q = db.from("deals").select("id").eq("product_key", deal.product_key).gte("created_at", since);
      q = deal.price == null ? q.is("price", null) : q.eq("price", deal.price);
      checks.push(q.limit(1));
    }
    const res = await Promise.all(checks);
    if (res.some((r) => r.data?.length)) return null;
  }
  if (deal.split) await fillSplitInfo(deal);
  if (!deal.image && !deal.clean_url.includes("flipkart")) deal.image = await engine.fetchOgImage(deal.clean_url);
  await recordPrice(deal);
  deal.affiliate_url = await safeConvert(deal.clean_url, settings);
  deal.converted = deal.affiliate_url !== deal.clean_url;
  deal.featured = false;
  deal.score = engine.score(deal);
  const allowed = ["id", "dedupe_key", "title", "text", "note", "url", "clean_url", "affiliate_url", "converted", "store", "price", "mrp", "discount",
    "text_price", "text_mrp", "categories", "image", "source", "source_id", "source_post_url", "posted_to", "posted_at", "created_at", "title_key",
    "product_key", "offers", "featured", "score", "lowest_ever", "history_count", "lowest_seen", "highest_seen", "split", "split_index", "split_total", "post_title"];
  const row = Object.fromEntries(allowed.filter((k) => deal[k] !== undefined).map((k) => [k, deal[k]]));
  const r = await db.from("deals").insert(row);
  if (r.error) {
    console.warn("deal insert failed", r.error.message);
    return null;
  }
  try { await enrich(deal.id); } catch (e) { console.warn("enrich failed", e?.message); }
  const fresh = (rawPosted || source.id === "manual") && ageMinutes(postedAt) <= settings.telegram_max_age_minutes;
  if (autopost && fresh && settings.auto_post) {
    const allowedPost = runId ? await takePostBudget(runId) : true;
    if (allowedPost) {
      const fullDeal = (await check(await db.from("deals").select("*").eq("id", deal.id).maybeSingle())) || deal;
      await postDeal(fullDeal);
    }
  }
  return deal;
}

async function fillSplitInfo(deal: any) {
  const info = await dealInfo(deal.clean_url);
  deal.image = info.image || deal.image;
  deal.title = (engine.cleanTitle(info.title) || `${deal.post_title} (${deal.split_index}/${deal.split_total})`).slice(0, 140);
  deal.title_key = titleKey(deal.title);
  if (!deal.price && info.price) {
    deal.price = info.price;
    deal.mrp = info.mrp ?? null;
  }
}

function splitPost(parsed: any, text: string, links: string[], settings: any) {
  const urls = [...new Set([...links, ...engine.findUrls(text)])].filter((u) => engine.detectStore(u) !== "Other" && !u.includes("t.me/"));
  if (settings.split_multi === false || urls.length < 2) return [parsed];
  return urls.slice(0, SPLIT_MAX).map((u, i) => {
    const [price, mrp] = engine.extractPrices(linkContext(text, u));
    return { ...parsed, url: u, store: engine.detectStore(u), ext_id: `${parsed.ext_id}#${i}`, price, mrp, split: true,
      split_index: i + 1, split_total: Math.min(urls.length, SPLIT_MAX), post_title: parsed.title };
  });
}

export async function fetchSource(src: any, runId?: string | null) {
  const db = await getDb();
  const settings = await getSettings();
  let items;
  try {
    items = src.kind === "telegram" ? await engine.fetchTelegram(src.value) : src.kind === "web" ? await engine.fetchWeb(src.value) : await engine.fetchRss(src.value);
  } catch (e) {
    const err = String(e?.message || e).slice(0, 200);
    await db.from("sources").update({ last_error: err, last_fetched_at: now() }).eq("id", src.id);
    return { fetched: 0, new_deals: 0, error: err };
  }
  // Skip posts already handled, in one query
  const keys = items.map((it) => `${src.id}:${it.ext_id}`);
  const seenRows = keys.length ? await check(await db.from("seen").select("key").in("key", keys)) : [];
  const seenSet = new Set(seenRows.map((r) => r.key));
  let added = 0;
  for (const it of items) {
    const parsed: any = engine.parseItem(it.text, it.links, it.image, settings);
    if (!parsed || !parsed.categories.length) continue;
    parsed.ext_id = it.ext_id;
    parsed.posted_at = it.posted_at;
    parsed.source_post_url = it.post_url;
    if (it.title) parsed.title = it.title.slice(0, 140);
    const parts = splitPost(parsed, it.text, it.links, settings);
    for (const part of parts) {
      if (parts.length === 1 && seenSet.has(`${src.id}:${part.ext_id}`)) continue;
      if (await ingest(part, src, settings, true, runId)) added++;
    }
  }
  await db.from("sources").update({ last_fetched_at: now(), last_error: null, total_deals: (src.total_deals || 0) + added }).eq("id", src.id);
  return { fetched: items.length, new_deals: added, error: null };
}

async function takePostBudget(runId: string) {
  const { mongo } = await import("./db.server");
  const r = await (await mongo()).collection("cron_runs").findOneAndUpdate({ run_id: runId, posts_left: { $gt: 0 } }, { $inc: { posts_left: -1 } });
  return !!(r?.value ?? r);
}

let scanRunning = false;

/** Starts a scan of every enabled source in the background (a few sources at a time). */
export async function startFetchAll(_baseUrl?: string) {
  const db = await getDb();
  const settings = await getSettings();
  if (scanRunning) return { queued: false, running: true, sources: 0 };
  await updateSettings({ last_run_at: now() });
  const run = { run_id: uuid(), posts_left: Number(settings.max_posts_per_update) || 20, created_at: now() };
  await check(await db.from("fetch_runs").insert(run));
  await db.from("fetch_runs").delete().lt("created_at", ago(86400e3));
  await db.from("seen").delete().lt("at", ago(14 * 86400e3));
  const sources = await check(await db.from("sources").select("*").eq("enabled", true).limit(500));
  scanRunning = true;
  (async () => {
    const queue = [...sources];
    const worker = async () => {
      for (let src = queue.shift(); src; src = queue.shift()) {
        try { await fetchSource(src, run.run_id); } catch (e) { console.warn("source scan failed", src.id, e?.message); }
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
  })().finally(() => { scanRunning = false; });
  return { queued: true, sources: sources.length };
}

export async function fetchSourceById(sourceId: string, runId?: string | null) {
  const db = await getDb();
  const src = await check(await db.from("sources").select("*").eq("id", sourceId).maybeSingle());
  if (!src) throw new HttpError(404, "Source not found");
  return fetchSource(src, runId);
}

// ---------- Public reads ----------
const DEAL_COLS = "id,title,text,note,url,clean_url,affiliate_url,converted,store,price,mrp,discount,store_price,categories,image,source,source_id,source_post_url,posted_to,posted_at,created_at,product_key,offers,featured,score,lowest_ever,history_count,lowest_seen,highest_seen,ph_min,ph_max,ph_avg,ph_url,split,split_index,split_total";

const ilikeSafe = (q: string) => q.replace(/[%_,()*\\"]/g, " ").trim();

export async function listDeals(p: any) {
  const db = await getDb();
  const s = await getSettings();
  const cutoffIso = ago(s.website_max_age_hours * 3600e3);
  const { category, q, store } = p;
  const sort = p.sort || "latest";
  const limit = Math.min(Number(p.limit) || 120, 500);
  let query = db.from("deals").select(DEAL_COLS);
  const applyStore = (qq) => (store ? (store === "Other" ? qq.not("store", "in", `(${MAJOR_STORES.join(",")})`) : qq.eq("store", store)) : qq);
  const applyQ = (qq) => {
    const t = q ? ilikeSafe(q) : "";
    return t ? qq.or(`title.ilike.*${t}*,store.ilike.*${t}*`) : qq;
  };
  if (category === "best") {
    const cutoff = ago(86400e3);
    const since = cutoff > cutoffIso ? cutoff : cutoffIso;
    query = query.or(`featured.eq.true,and(posted_at.gte.${since},score.gte.100)`);
    query = applyStore(applyQ(query));
    return check(await query.order("posted_at", { ascending: false }).limit(40));
  }
  if (category !== "starred") query = query.or(`posted_at.gte.${cutoffIso},featured.eq.true`);
  if (category === "starred") query = query.eq("featured", true);
  else if (category === "lowest") query = query.eq("lowest_ever", true);
  else if (category === "loot_price_drop") query = query.overlaps("categories", engine.LOOT_PRICE_DROP_CATEGORIES);
  else if (category && category !== "all") query = query.contains("categories", [category]);
  query = applyStore(query);
  // a second .or() call would replace the first; combine text search through a filter on the client side when both are needed
  let rows;
  if (sort === "price") query = query.not("price", "is", null);
  const order = { latest: [["posted_at", false]], discount: [["discount", false]], price: [["price", true]], starred: [["featured", false], ["posted_at", false]] }[sort] || [["posted_at", false]];
  for (const [col, asc] of order) query = query.order(col, { ascending: asc, nullsFirst: false });
  if (q && ilikeSafe(q)) {
    const search = q ? ilikeSafe(q).toLowerCase() : "";
    rows = await check(await query.limit(1000));
    if (search) rows = rows.filter((d) => (d.title || "").toLowerCase().includes(search) || (d.store || "").toLowerCase().includes(search));
    rows = rows.slice(0, limit);
  } else rows = await check(await query.limit(limit));
  return rows;
}

export async function originalPost(id: string) {
  const db = await getDb();
  const d = await check(await db.from("deals").select("source,posted_at,text,note,image,source_post_url").eq("id", id).maybeSingle());
  if (!d) throw new HttpError(404, "Deal not found");
  const web = d.source_post_url;
  const m = (web || "").match(/https:\/\/t\.me\/(?:s\/)?(\w+)\/(\d+)/);
  return { source: d.source, posted_at: d.posted_at, text: d.text || d.note || "", image: d.image, web_url: web, app_url: m ? `tg://resolve?domain=${m[1]}&post=${m[2]}` : null };
}

export async function priceHistory(id: string) {
  const db = await getDb();
  const deal = await check(await db.from("deals").select("*").eq("id", id).maybeSingle());
  if (!deal) throw new HttpError(404, "Deal not found");
  const pts = deal.product_key ? await check(await db.from("price_history").select("price,at").eq("product_key", deal.product_key).order("at").limit(500)) : [];
  const stores: any[] = [];
  const candidates = [deal];
  const tk = (deal.title_key || "").slice(0, 18);
  if (tk.length >= 10) {
    const others = await check(await db.from("deals").select("*").like("title_key", `${tk}%`).neq("store", deal.store || "").neq("id", id).limit(5));
    const seenStores = new Set([deal.store]);
    for (const o of others) if (!seenStores.has(o.store)) { seenStores.add(o.store); candidates.push(o); }
  }
  const phs = await Promise.all(candidates.map((c) => phData(c.clean_url)));
  candidates.forEach((c, i) => {
    const ph = phs[i];
    if (ph?.history?.length) stores.push({ store: c.store, url: c.affiliate_url || c.clean_url, current: ph.price, lowest: ph.min, lowest_on: ph.min_on,
      highest: ph.max, average: ph.avg, points: ph.history, source_page: ph.page_url });
  });
  const seen = pts.filter((p) => p.price).map((p) => ({ x: p.at, y: Number(p.price) }));
  if (seen.length) stores.push({ store: "Seen in deal channels", url: deal.affiliate_url, current: deal.price, lowest: Math.min(...seen.map((p) => p.y)), highest: Math.max(...seen.map((p) => p.y)), points: seen });
  const priced = stores.filter((s) => s.current && s.store !== "Seen in deal channels");
  let best = priced.length ? priced.reduce((a, b) => (b.current < a.current ? b : a)) : null;
  best = best ? { store: best.store, current: best.current, url: best.url } : null;
  if (deal.price && (!best || deal.price < best.current)) best = { store: deal.store, current: deal.price, url: deal.affiliate_url || deal.clean_url };
  const all = stores.flatMap((s) => s.points.map((p) => p.y));
  return { stores, best, lowest: all.length ? Math.min(...all) : null, highest: all.length ? Math.max(...all) : null, compare: engine.compareLinks(deal.title) };
}

export async function stats() {
  const db = await getDb();
  const st = await getSettings();
  const cutoff = ago(st.website_max_age_hours * 3600e3);
  const count = async (fn) => (await fn(db.from("deals").select("id", { count: "exact", head: true }))).count || 0;
  const vis = (q) => q.or(`posted_at.gte.${cutoff},featured.eq.true`);
  const win = Number(st.telegram_max_age_minutes) || 60;
  const out: any = { website_max_age_hours: st.website_max_age_hours };
  const [total, allTime, fresh, ...catCounts] = await Promise.all([
    count(vis), count((q) => q), count((q) => q.gte("posted_at", ago(win * 60e3))),
    ...engine.CATEGORIES.map((c) => count((q) => vis(q).contains("categories", [c]))),
  ]);
  out.total = total;
  out.all_time = allTime;
  engine.CATEGORIES.forEach((c, i) => (out[c] = catCounts[i]));
  out.loot_price_drop = await count((q) => vis(q).overlaps("categories", engine.LOOT_PRICE_DROP_CATEGORIES));
  out.sources = (await db.from("sources").select("id", { count: "exact", head: true }).eq("enabled", true)).count || 0;
  out.destinations = (await db.from("destinations").select("id", { count: "exact", head: true }).eq("enabled", true)).count || 0;
  out.posts_sent = (await db.from("post_logs").select("id", { count: "exact", head: true }).eq("status", "success")).count || 0;
  out.last_scan_at = st.last_run_at;
  out.check_interval_seconds = st.check_interval_seconds;
  out.fresh_window_minutes = win;
  out.fresh_3h = fresh;
  const latest = (await check(await db.from("deals").select("posted_at").order("posted_at", { ascending: false }).limit(1)))[0];
  out.latest_deal_at = latest?.posted_at || null;
  return out;
}

export async function publicSettingsView() {
  const s = await getSettings();
  return { copy_header: s.copy_header, copy_link_style: s.copy_link_style, product_min: s.product_min };
}

function previewHtml(url: string, title: string, image: string, price?: number, mrp?: number, store?: string) {
  const h = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
  const desc = [price ? `Deal Price ${engine.fmtInr(price)}` : "", mrp ? `MRP ${engine.fmtInr(mrp)}` : "", store].filter(Boolean).join(" | ");
  const og = image ? `<meta property="og:image" content="${h(image)}"><meta name="twitter:card" content="summary_large_image">` : "";
  const t = h(title || "Hot deal");
  return new Response(`<!doctype html><html><head><meta charset="utf-8">
<title>${t}</title><meta property="og:type" content="website"><meta property="og:title" content="${t}">
<meta property="og:description" content="${h(desc)}"><meta property="og:site_name" content="${h(store || "Deal")}">${og}
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:sans-serif;text-align:center;padding:40px"><p>Opening deal…</p><a href="${h(url)}">Tap here if not redirected</a>
<script>location.replace(${JSON.stringify(url).replace(/</g, "\\u003c")})</script></body></html>`, { headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function goDeal(id: string) {
  const db = await getDb();
  const d = await check(await db.from("deals").select("*").eq("id", id).maybeSingle());
  if (!d) throw new HttpError(404, "Deal not found");
  return previewHtml(d.affiliate_url || d.url, d.title, d.image, d.price, d.mrp, d.store);
}

export async function goLink(code: string) {
  const db = await getDb();
  const d = await check(await db.from("links").select("*").eq("code", code).maybeSingle());
  if (!d) throw new HttpError(404, "Link not found");
  return previewHtml(d.url, d.title, d.image, d.price, d.mrp, d.store);
}

export async function imageProxy(url: string) {
  if (!url?.startsWith("http") || /\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|169\.254\.|\[)/.test(url)) throw new HttpError(400, "Bad image link");
  let r;
  try {
    r = await fetch(url, { headers: engine.UA, redirect: "follow", signal: AbortSignal.timeout(15000) });
  } catch {
    throw new HttpError(400, "Could not load image");
  }
  const ctype = r.headers.get("content-type") || "";
  const buf = await r.arrayBuffer();
  if (r.status !== 200 || !ctype.startsWith("image/") || buf.byteLength > 8_000_000) throw new HttpError(400, "Could not load image");
  return new Response(buf, { headers: { "content-type": ctype, "cache-control": "public, max-age=86400" } });
}

// ---------- Admin ----------
export async function lookup(url: string) {
  if (!url?.startsWith("http")) throw new HttpError(400, "Paste a full product link");
  const clean = await engine.cleanLink(url.trim());
  const info = await dealInfo(clean);
  return { cleaned: clean, store: engine.detectStore(clean), ...info };
}

export async function addDeal(body: any) {
  const settings = await getSettings();
  const text = [body.title, body.note].filter(Boolean).join(" ");
  const price = body.price ?? null, mrp = body.mrp ?? null;
  const discount = body.discount != null ? body.discount : engine.extractDiscount(text, price, mrp);
  const cats = body.categories?.length ? body.categories : engine.classify(text, discount, settings);
  const deal = { title: body.title || engine.makeTitle(body.url), text, note: body.note || null, url: body.url.trim(), store: engine.detectStore(body.url, text),
    price, mrp, discount: discount || 0, categories: cats?.length ? cats : ["heavy_discount"], image: body.image || null, ext_id: uuid() };
  const created = await ingest(deal, { id: "manual", name: "Manual" }, settings, false);
  if (!created) throw new HttpError(400, "Could not add this deal");
  const db = await getDb();
  const full = await check(await db.from("deals").select(DEAL_COLS).eq("id", created.id).maybeSingle());
  const results = body.post_now !== false ? await postDeal(full) : [];
  full.posted_to = results.filter((r) => r.status === "success").map((r) => r.destination_name);
  return { deal: full, post_results: results };
}

export async function repost(id: string, destinationId?: string | null) {
  const db = await getDb();
  const deal = await check(await db.from("deals").select("*").eq("id", id).maybeSingle());
  if (!deal) throw new HttpError(404, "Deal not found");
  return { post_results: await postDeal(deal, destinationId) };
}

export async function featureDeal(id: string, featured: boolean) {
  const db = await getDb();
  const r = await check(await db.from("deals").update({ featured: !!featured }).eq("id", id).select("id"));
  if (!r.length) throw new HttpError(404, "Deal not found");
  return { ok: true, featured: !!featured };
}

export async function deleteDeal(id: string) {
  const db = await getDb();
  const r = await check(await db.from("deals").delete().eq("id", id).select("id"));
  if (!r.length) throw new HttpError(404, "Deal not found");
  return { ok: true };
}

export async function listSources() {
  const db = await getDb();
  return check(await db.from("sources").select("*").order("created_at", { ascending: false }).limit(200));
}

export async function addSource(body: any) {
  const db = await getDb();
  const kind = body.kind || "telegram";
  let value = String(body.value || "").trim();
  if (!value) throw new HttpError(400, "Enter a channel or link");
  if (kind === "telegram") value = value.replace("https://", "").replace("t.me/s/", "").replace("t.me/", "").replace(/^@+/, "").replace(/^\/+|\/+$/g, "");
  const dup = await check(await db.from("sources").select("id").ilike("value", value.replace(/[%_]/g, "\\$&")).limit(1));
  if (dup.length) throw new HttpError(400, "Source already added");
  const name = body.name || (kind === "telegram" ? `@${value}` : value.replace(/^https?:\/\/(www\.)?/, "").split("/")[0] + (kind === "web" ? " (website)" : ""));
  return check(await db.from("sources").insert({ name, kind, value, enabled: body.enabled !== false }).select("*").single());
}

export async function updateSource(id: string, body: any) {
  const db = await getDb();
  return check(await db.from("sources").update({ enabled: body.enabled !== false, name: body.name || body.value }).eq("id", id).select("*").maybeSingle());
}

export async function deleteSource(id: string) {
  const db = await getDb();
  await db.from("sources").delete().eq("id", id);
  return { ok: true };
}

const publicDest = (d: any) => {
  const { bot_token, ...rest } = d;
  return { ...rest, bot_token_masked: mask(bot_token || "") };
};

export async function listDestinations() {
  const db = await getDb();
  return (await check(await db.from("destinations").select("*").order("created_at").limit(100))).map(publicDest);
}

export async function addDestination(body: any) {
  if (!body.bot_token) throw new HttpError(400, "Bot token is required");
  const chat = String(body.chat_id || "").trim();
  if (!chat) throw new HttpError(400, "Chat ID is required");
  const db = await getDb();
  const row = { name: String(body.name || "").trim() || chat, bot_token: body.bot_token.trim(), chat_id: chat, categories: body.categories || [],
    min_discount: Number(body.min_discount) || 0, stores: body.stores || [], enabled: body.enabled !== false };
  return publicDest(await check(await db.from("destinations").insert(row).select("*").single()));
}

export async function updateDestination(id: string, body: any) {
  const chat = String(body.chat_id || "").trim();
  if (!chat) throw new HttpError(400, "Chat ID is required");
  const db = await getDb();
  const upd: any = { name: String(body.name || "").trim() || chat, chat_id: chat, categories: body.categories || [], min_discount: Number(body.min_discount) || 0,
    stores: body.stores || [], enabled: body.enabled !== false };
  if (body.bot_token) upd.bot_token = body.bot_token.trim();
  const d = await check(await db.from("destinations").update(upd).eq("id", id).select("*").maybeSingle());
  if (!d) throw new HttpError(404, "Destination not found");
  return publicDest(d);
}

export async function deleteDestination(id: string) {
  const db = await getDb();
  await db.from("destinations").delete().eq("id", id);
  return { ok: true };
}

export async function testDestination(id: string) {
  const db = await getDb();
  const d = await check(await db.from("destinations").select("*").eq("id", id).maybeSingle());
  if (!d) throw new HttpError(404, "Destination not found");
  try {
    await engine.sendTelegram(d.bot_token, d.chat_id, `✅ <b>DealLoot connected</b>\nThis channel (${d.name}) will receive deals.`);
    return { ok: true };
  } catch (e) {
    let msg = String(e?.message || e);
    if (msg.toLowerCase().includes("chat not found")) msg += " — for a private channel use its number ID (like -100…) from 'Find my chat ID', and make the bot an admin. For your personal chat, send /start to the bot first.";
    else if (msg.toLowerCase().includes("unauthorized")) msg += " — the bot token is wrong. Copy it again from @BotFather.";
    throw new HttpError(400, `Telegram error: ${msg}`);
  }
}

export async function sendRecent(id: string) {
  const db = await getDb();
  const d = await check(await db.from("destinations").select("*").eq("id", id).maybeSingle());
  if (!d) throw new HttpError(404, "Destination not found");
  const s = await getSettings();
  const deals = await check(await db.from("deals").select("*").gte("posted_at", ago(s.telegram_max_age_minutes * 60e3)).order("posted_at", { ascending: false }).limit(500));
  const match = deals.filter((x) => !(x.posted_to || []).includes(d.name) && destMatches(d, x)).slice(0, Number(s.max_posts_per_update) || 20);
  let sent = 0, failed = 0;
  for (const x of match) {
    const r = await postDeal(x, d.id);
    const ok = r.some((i) => i.status === "success");
    if (ok) sent++; else failed++;
    if (failed && !sent) throw new HttpError(400, `Telegram error: ${r[0]?.error}`);
    await new Promise((res) => setTimeout(res, 1200));
  }
  return { matched: match.length, sent, failed, window_minutes: s.telegram_max_age_minutes };
}

export function adminSettingsView(s: any) {
  const { sankmo_token, earnkaro_token, amazon_tag, tg_session, tg_api_hash, ...rest } = s;
  return { ...rest, sankmo_token_masked: mask(sankmo_token || ""), earnkaro_token_masked: mask(earnkaro_token || ""), tg_connected: false, tg_api_hash_masked: "" };
}

export async function readSettings() {
  return adminSettingsView(await getSettings());
}

export async function writeSettings(body: any) {
  const upd: any = Object.fromEntries(Object.entries(body || {}).filter(([k, v]) => v !== null && v !== undefined && k in DEFAULT_SETTINGS));
  if (upd.sankmo_token === "") delete upd.sankmo_token;
  if (upd.earnkaro_token === "") delete upd.earnkaro_token;
  const clamp = (k, lo, hi) => { if (k in upd) upd[k] = Math.min(Math.max(Number(upd[k]), lo), hi); };
  clamp("check_interval_minutes", 5, 1440);
  clamp("check_interval_seconds", 300, 86400);
  clamp("website_max_age_hours", 1, 720);
  clamp("telegram_max_age_minutes", 1, 10080);
  clamp("max_posts_per_update", 1, 200);
  await updateSettings(upd);
  return readSettings();
}

export async function convertOne(url: string) {
  const settings = await getSettings();
  const cleaned = await engine.cleanLink(String(url || "").trim());
  try {
    const out = await engine.convertLink(cleaned, settings);
    return { original: url, cleaned, converted: out, changed: out !== cleaned, error: null, store: engine.detectStore(cleaned) };
  } catch (e) {
    return { original: url, cleaned, converted: cleaned, changed: false, error: String(e?.message || e).slice(0, 300), store: engine.detectStore(cleaned) };
  }
}

function applyPostPrice(info: any, context: string) {
  const [price, mrp] = engine.extractPrices(context);
  if (!price) return;
  const storePrice = info.price;
  info.store_price = storePrice;
  info.price = price;
  info.mrp = mrp || info.mrp || storePrice;
  if (info.mrp && info.mrp <= price * 1.03) info.mrp = null;
}

export async function convertBulk(body: any) {
  const text = String(body.text || "");
  const found = [...new Set(engine.findUrls(text).map((u) => u.replace(/[.,;!]+$/, "")).filter((u) => !u.includes("t.me/")))];
  if (!found.length) throw new HttpError(400, "No links found. Paste one or more deal links.");
  const links = found.slice(0, BULK_MAX);
  const settings = await getSettings();
  const cleaned = await Promise.all(links.map((u) => engine.cleanLink(u)));
  const infos = await Promise.all(cleaned.map((c) => dealInfo(c)));
  links.forEach((link, i) => {
    const ctx = linkContext(text, link);
    applyPostPrice(infos[i], ctx);
    infos[i].offers = engine.markBestCard(engine.extractOffers(ctx), infos[i].price);
  });
  const db = await getDb();
  const items: any[] = [];
  const swaps: [string, string][] = [];
  for (let i = 0; i < links.length; i++) {
    const orig = links[i], clean = cleaned[i], info = infos[i];
    let out = clean, err = null;
    try {
      out = await engine.convertLink(clean, settings);
    } catch (e) {
      err = String(e?.message || e).slice(0, 300);
    }
    const store = engine.detectStore(clean);
    if (!err && out === clean) {
      const selectedRoute = store === "Amazon"
        ? "earnkaro"
        : settings.affiliate_routes?.[store] || ((settings.sankmo_stores?.length ? settings.sankmo_stores : engine.SANKMO_DEFAULT).includes(store) ? "sankmo" : "earnkaro");
      err = (selectedRoute === "earnkaro" || selectedRoute === "amazon") && !settings.earnkaro_token
        ? "Add your EarnKaro API token in Affiliate links settings"
        : selectedRoute === "sankmo" && !settings.sankmo_token
            ? "Add your Sankmo token first"
            : "The selected affiliate service returned no earning link";
    }
    swaps.push([orig, out]);
    const code = uuid().replace(/-/g, "").slice(0, 8);
    await db.from("links").insert({ code, url: out, store, title: info.title, image: info.image, price: info.price, mrp: info.mrp, store_price: info.store_price ?? null, offers: info.offers || [] });
    items.push({ original: orig, cleaned: clean, converted: out, changed: out !== clean, error: err, store, share_code: code, ...info });
  }
  const map = Object.fromEntries(swaps);
  const pattern = new RegExp([...swaps].sort((a, b) => b[0].length - a[0].length).map(([o]) => o.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
  const message = text.replace(pattern, (m) => map[m] ?? m);
  return { items, message: message.trim(), total_found: found.length, skipped: found.slice(BULK_MAX) };
}

export async function setLinkImage(code: string, image: string) {
  image = String(image || "").trim();
  if (!/^https?:\/\//.test(image)) throw new HttpError(400, "Paste a full picture link (https://…)");
  const db = await getDb();
  const r = await check(await db.from("links").update({ image }).eq("code", code).select("code"));
  if (!r.length) throw new HttpError(404, "Link not found");
  return { ok: true };
}

export async function reconvert() {
  const db = await getDb();
  const s = await getSettings();
  const rows = await check(await db.from("deals").select("id,clean_url,converted,store").gte("posted_at", ago(86400e3)).or("converted.eq.false,store.eq.Amazon").order("posted_at", { ascending: false }).limit(200));
  for (const d of rows) {
    const aff = await safeConvert(d.clean_url, s);
    if (aff !== d.clean_url) await db.from("deals").update({ affiliate_url: aff, converted: true }).eq("id", d.id);
  }
  return { ok: true };
}

export async function findChats(body: any) {
  let token = String(body.bot_token || "").trim();
  if (!token && body.destination_id) {
    const db = await getDb();
    const d = await check(await db.from("destinations").select("bot_token").eq("id", body.destination_id).maybeSingle());
    token = d?.bot_token || "";
  }
  if (!token) throw new HttpError(400, "Paste the bot token first");
  let data;
  try {
    data = await (await fetch(`https://api.telegram.org/bot${token}/getUpdates`, { signal: AbortSignal.timeout(15000) })).json();
  } catch (e) {
    throw new HttpError(400, `Telegram error: ${e?.message || e}`);
  }
  if (!data.ok) throw new HttpError(400, `Telegram error: ${data.description || "Invalid bot token"} — check the bot token from @BotFather.`);
  const chats = new Map();
  for (const u of data.result || []) {
    const msg = u.message || u.channel_post || u.my_chat_member || {};
    const ch = msg.chat;
    if (ch) chats.set(ch.id, { id: String(ch.id), type: ch.type, name: ch.title || [ch.first_name, ch.last_name].filter(Boolean).join(" ") || ch.username });
  }
  return [...chats.values()];
}

export async function logs(limit: number) {
  const db = await getDb();
  return check(await db.from("post_logs").select("*").order("created_at", { ascending: false }).limit(Math.min(Number(limit) || 200, 500)));
}
