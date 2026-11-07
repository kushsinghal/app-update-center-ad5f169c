// @ts-nocheck — direct port of the original Python deal engine (parsing, cleaning, conversion, Telegram posting).
import { parse as parseHtml } from "node-html-parser";
import { XMLParser } from "fast-xml-parser";

export const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36" };
const URL_SRC = String.raw`https?:\/\/[^\s<>"')\]]+`;
export const urlRe = () => new RegExp(URL_SRC, "g");
export const findUrls = (text: string): string[] => (text || "").match(urlRe()) || [];

const MRP_SRC = String.raw`(?:mrp|regular price|original price|worth|\bwas\b|actual price)\s*[:@\-]?\s*(?:₹|rs\.?|inr)?\s*([\d,]*\d)(\s*k\b)?`;
const PCT_SRC = String.raw`(?:flat|upto|up to|get)?\s*(\d{1,2}(?:\.\d+)?)\s*%\s*(?:off|discount|cashback|instant|savings)`;
const FLAT_PCT_SRC = String.raw`flat\s*(\d{1,2})\s*%`;
const SUPERCOIN_RE = /100\s*%\s*(?:off\s*)?(?:via|with|using|by|on|through)?\s*super\s*coins?|super\s*coins?[\s\S]{0,40}100\s*%|full\s*super\s*coins?/i;
const GIFT_RE = /gift\s*cards?|e-?gift|vouchers?|\bgv\b/i;
const LOOT_RE = /\bloot\b|price\s*(?:error|bug|mistake|glitch)|\bbug\s*deal|glitch/i;

export const STORES: Record<string, string[]> = {
  Flipkart: ["flipkart.com", "fkrt.it", "fkrt.cc", "fkrt.co", "fktr.in"],
  Amazon: ["amazon.in", "amzn.to", "amzn.in", "amazon.com", "amzn.eu"],
  Myntra: ["myntra.com", "myntr.it"],
  Ajio: ["ajio.com", "ajiio.in"],
  Meesho: ["meesho.com"],
  Shopsy: ["shopsy.in"],
  Croma: ["croma.com"],
  "Tata CLiQ": ["tatacliq.com"],
  JioMart: ["jiomart.com"],
  Nykaa: ["nykaa.com"],
  Xiaomi: ["mi.com"],
  Snapdeal: ["snapdeal.com"],
  "Reliance Digital": ["reliancedigital.in"],
  Paytm: ["paytm.com", "paytmmall.com"],
  Swiggy: ["swiggy.com"],
  Zomato: ["zomato.com"],
  Woohoo: ["woohoo.in"],
  Gyftr: ["gyftr.com"],
};
export const SANKMO_DEFAULT = ["Flipkart", "Myntra", "Ajio", "Shopsy", "Meesho", "Croma", "Tata CLiQ", "JioMart", "Nykaa", "Xiaomi", "Snapdeal", "Reliance Digital"];
export const CATEGORIES = ["supercoin_100", "gift_card", "heavy_discount", "loot", "gold"];

const GOLD_RE = new RegExp(
  String.raw`\b(?:gold|silver)\b.{0,60}?\b(?:coins?|bars?|bullion|pendants?|jewell?ery|chains?|rings?|earrings?|bangles?|bracelets?|gms?|grams?|g\b|24\s*k\w*|22\s*k\w*|999|916|hallmark\w*|bis)\b` +
    String.raw`|\b(?:coins?|bars?|bullion|pendants?|jewell?ery|chains?|rings?|earrings?|bangles?|bracelets?)\b.{0,40}?\b(?:gold|silver)\b` +
    String.raw`|\bdigital\s*gold\b`,
  "i",
);
const GOLD_NOT = /nescafe|coffee|\btea\b|\bdial\b|plated|rose\s*gold|gold\s*tone|golden|membership|prime|gold\s*card|contest|\bwin\b|gold\s*(?:pass|plan|member)/i;

const splitlines = (t: string) => (t || "").split(/\r\n|\r|\n/);
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function isGold(text: string) {
  return splitlines((text || "").replace(INVISIBLE_G, "")).some((line) => {
    const normalized = line.replace(/\s+/g, " ");
    return GOLD_RE.test(normalized) && !GOLD_NOT.test(normalized);
  });
}

const BANKS = ["HDFC", "SBI", "ICICI", "Axis", "Kotak", "IDFC", "OneCard", "BOB", "Bank of Baroda", "RBL", "HSBC", "Yes Bank", "AU",
  "Federal", "IndusInd", "Citi", "AMEX", "American Express", "Standard Chartered", "Flipkart Axis", "Amazon Pay ICICI",
  "Canara", "PNB", "Union Bank", "BOI", "DBS", "Paytm", "UPI", "Super.money", "Cred", "Mobikwik", "Amazon Pay", "PhonePe"];
const CAP_RE = /(?:up\s*to|upto|max(?:imum)?)(?:\s*(?:discount|cashback|off|of|benefit|savings?))*\s*(?:₹|rs\.?|inr)\s*([\d,]*\d)/i;
const BANK_NAMES: Record<string, string> = Object.fromEntries(BANKS.map((b) => [b.toLowerCase(), b]));
const WALLETS = new Set(["UPI", "Paytm", "Cred", "Mobikwik", "Amazon Pay", "PhonePe", "Super.money"]);
const BANK_RE = new RegExp(String.raw`\b(` + [...BANKS].sort((a, b) => b.length - a.length).map(escRe).join("|") + String.raw`)\b`, "i");
const CARD_RE = /\b(credit\s*card|debit\s*card|cc|dc|emi|card|upi|wallet)\b/i;
const OFF_AMT_SRC = String.raw`(?:₹|rs\.?|inr)\s*([\d,]*\d)|([\d,]*\d)\s*(?:₹|rs\b|/-)|(\d{1,2}(?:\.\d+)?)\s*%`;
const COINS_RE = /([\d,]*\d)\s*super\s*coins?|super\s*coins?[^\n\d]{0,20}([\d,]*\d)\b(?!\s*%)/i;
const CODE_RE = /\b(?:code|coupon\s*code)\s*[:\-]?\s*([A-Z0-9]{4,20})\b/;
const INVISIBLE_G = /[\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g;

export const fmtInr = (v: number) => `₹${Math.round(v).toLocaleString("en-US")}`;

export function toNum(s: any): number | null {
  if (s == null) return null;
  const t = String(s).replace(/,/g, "");
  if (!/^\s*-?\d*\.?\d+\s*$/.test(t)) return null;
  const v = parseFloat(t);
  return Number.isFinite(v) ? v : null;
}

function amountLabel(line: string, near?: string): [number | null, string] {
  const ms = [...line.matchAll(new RegExp(OFF_AMT_SRC, "gi"))];
  if (!ms.length) return [null, ""];
  let m = ms[0];
  if (near) {
    const i = line.toLowerCase().indexOf(near);
    const before = i >= 0 ? ms.filter((x) => x.index < i) : [];
    m = before.length ? before[before.length - 1] : i >= 0 ? ms.reduce((a, b) => (Math.abs(b.index - i) < Math.abs(a.index - i) ? b : a)) : ms[0];
  }
  if (m[3]) {
    const g = m[3];
    const txt = g.includes(".") ? g.replace(/0+$/, "").replace(/\.$/, "") : g;
    return [parseFloat(g), `${txt}%`];
  }
  const v = toNum(m[1] || m[2]);
  return [v, v ? fmtInr(v) : ""];
}

function stripChars(s: string, chars: string) {
  const set = new Set(Array.from(chars));
  const arr = Array.from(s);
  let a = 0, b = arr.length;
  while (a < b && set.has(arr[a])) a++;
  while (b > a && set.has(arr[b - 1])) b--;
  return arr.slice(a, b).join("");
}

export function extractOffers(text: string) {
  const offers: any[] = [];
  const seen = new Set<string>();
  if (SUPERCOIN_RE.test(text)) {
    offers.push({ kind: "supercoin", label: "100% SuperCoins back — almost FREE" });
    seen.add("supercoin");
  }
  for (const raw of splitlines((text || "").replace(INVISIBLE_G, ""))) {
    const line = stripChars(raw.replace(urlRe(), ""), " •*-–>✅❌👉🔥💳🏦");
    if (!line || line.length > 160) continue;
    if (/\bemi\b|no[\s-]*cost|instal+ment/i.test(line) && !/incl|\+\s*emi|&\s*emi|and\s*emi|non[\s-]*emi|full\s*(?:swipe|payment)/i.test(line)) continue;
    const bank = line.match(BANK_RE);
    const low = line.toLowerCase();
    let [amt, amtTxt] = amountLabel(line);
    if (bank && !GIFT_RE.test(line) && (CARD_RE.test(line) || low.includes("off") || low.includes("discount") || low.includes("cashback")) && amt) {
      const name = BANK_NAMES[bank[1].toLowerCase()] || bank[1];
      const card = line.match(CARD_RE);
      const ctype = card ? ({ cc: "Credit Card", dc: "Debit Card" } as any)[card[1].toLowerCase()] || card[1].replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\B\w/g, (c) => c.toLowerCase()) : "Card";
      const verb = low.includes("cashback") ? "cashback" : "off";
      let label = WALLETS.has(name) ? `${amtTxt} ${verb} via ${name}` : `${amtTxt} ${verb} with ${name} ${ctype}`.replace("Card Card", "Card");
      const capM = line.match(CAP_RE);
      const cap = capM && amtTxt.endsWith("%") ? toNum(capM[1]) : null;
      if (cap) label += ` (up to ${fmtInr(cap)})`;
      const key = `bank:${name.toLowerCase()}:${amt}`;
      if (!seen.has(key)) {
        seen.add(key);
        offers.push({ kind: "bank", label, amount: amt, wallet: WALLETS.has(name), ...(cap ? { cap } : {}) });
      }
    } else if (low.includes("coupon") && amt) {
      [amt, amtTxt] = amountLabel(line, "coupon");
      const code = raw.match(CODE_RE);
      const key = `coupon:${amt}`;
      if (!seen.has(key)) {
        seen.add(key);
        offers.push({ kind: "coupon", label: `${amtTxt} coupon` + (code ? ` (code ${code[1]})` : ""), amount: amt });
      }
    } else if (low.includes("cashback") && amt) {
      const key = `cashback:${amt}`;
      if (!seen.has(key)) {
        seen.add(key);
        offers.push({ kind: "cashback", label: `${amtTxt} cashback` + (bank ? ` via ${bank[1]}` : ""), amount: amt });
      }
    } else if (!seen.has("supercoin") && /super\s*coins?/i.test(line)) {
      const m = line.match(COINS_RE);
      const n = m && (m[1] || m[2]);
      seen.add("supercoin");
      offers.push({ kind: "supercoin", label: n ? `Use ${n} SuperCoins` : "Extra savings with SuperCoins" });
    }
  }
  return offers.slice(0, 6);
}

export function markBestCard(offers: any[], price: number | null) {
  const saving = (o: any) => {
    const a = o.amount || 0;
    if (o.label.split(" ")[0].includes("%")) {
      const v = price ? (price * a) / 100 : 0;
      return o.cap ? Math.min(v, o.cap) : v;
    }
    return a;
  };
  const banks = (offers || []).filter((o) => o.kind === "bank");
  for (const o of banks) delete o.best;
  if (banks.length) {
    const top = banks.reduce((a, b) => (saving(b) > saving(a) ? b : a));
    top.best = true;
    const s = saving(top);
    if (s) top.saving = Math.round(s);
  }
  return offers || [];
}

export function detectStore(url: string, text = "") {
  const u = (url || "").toLowerCase();
  for (const [name, domains] of Object.entries(STORES)) if (domains.some((d) => u.includes(d))) return name;
  const t = (text || "").toLowerCase();
  for (const name of Object.keys(STORES)) if (t.includes(name.toLowerCase())) return name;
  return "Other";
}

const NUM = String.raw`(?:₹|rs\.?|inr)?\s*([\d,]*\d(?:\.\d+)?)(\s*k\b)?`;
const STRONG_SRC = String.raw`(?:offer\s*price|deal\s*price|effective(?:ly)?(?:\s*price)?(?:\s*will\s*be)?(?:\s*around)?|price\s*[:\-]|@)\s*[:\-]?\s*` + NUM;
const WEAK_SRC = String.raw`(?:\bat|\bonly|\bjust|\bstarts?(?:\s*from)?|\bfrom|\bloot|\bfor)\s*[:\-@]?\s*` + NUM;
const BARE_SRC = String.raw`(?:₹|rs\.?|inr)\s*([\d,]*\d(?:\.\d+)?)(\s*k\b)?|([\d,]*\d)\s*(?:₹|/-)()`;
const NOISE_LINE = /coupon|cashback|\bbank\b|hdfc|sbi|icici|axis|kotak|\bcc\b|credit|debit|\bemi\b|\bcode\b|exchange\s*(?:offer|bonus)|above|min\.?\s*order|up\s*to|upto|\bflat\b|\bsave\b|voucher|cred\b|perk/i;
const AFTER_BAD = /^\s*(?:%|off\b|cashback|coupon|discount|back\b|instant|extra|super\s*coins?|gm\b|grams?\b|g\b|kg\b|ml\b|l\b|ltr|litre|hp\b|w\b|watt|cm\b|mm\b|gb\b|tb\b|mah|inch|°|pcs|pieces|days?\b|months?\b|years?\b|x\b)/i;

function amounts(src: string, text: string, checkNoise: boolean) {
  const out: number[] = [];
  for (const line of splitlines(text)) {
    if (checkNoise && NOISE_LINE.test(line)) continue;
    for (const m of line.matchAll(new RegExp(src, "gi"))) {
      if (AFTER_BAD.test(line.slice(m.index + m[0].length))) continue;
      const raw = m[1] || m[3];
      let v = toNum(raw);
      if (v && m[2]) v *= 1000;
      if (v && v >= 5 && v <= 5_000_000) out.push(v);
    }
  }
  return out;
}

export function extractPrices(text: string): [number | null, number | null] {
  text = (text || "").replace(INVISIBLE_G, "");
  const mrpM = text.match(new RegExp(MRP_SRC, "i"));
  let mrp = mrpM ? toNum(mrpM[1]) : null;
  if (mrp && mrpM[2]) mrp *= 1000;
  text = text.replace(new RegExp(MRP_SRC, "gi"), " ");
  let price: number | null = null;
  for (const [src, noisy] of [[STRONG_SRC, false], [WEAK_SRC, true], [BARE_SRC, true]] as [string, boolean][]) {
    const found = amounts(src, text, noisy).filter((a) => a !== mrp);
    if (found.length) {
      price = found[0];
      break;
    }
  }
  if (price != null && mrp != null && mrp <= price * 1.02) mrp = null;
  return [price, mrp];
}

export function extractDiscount(text: string, price: number | null, mrp: number | null) {
  const vals = [...(text || "").matchAll(new RegExp(PCT_SRC, "gi"))].map((m) => parseFloat(m[1]))
    .concat([...(text || "").matchAll(new RegExp(FLAT_PCT_SRC, "gi"))].map((m) => parseFloat(m[1])));
  if (price && mrp) vals.push(Math.round((1 - price / mrp) * 1000) / 10);
  return vals.length ? Math.max(...vals) : 0;
}

export function classify(text: string, discount: number, rules: any) {
  const cats: string[] = [];
  const isGift = GIFT_RE.test(text);
  const r = (k: string, d: any) => (rules[k] === undefined || rules[k] === null ? d : rules[k]);
  if (r("supercoin_enabled", true) && SUPERCOIN_RE.test(text)) cats.push("supercoin_100");
  if (r("giftcard_enabled", true) && isGift && discount >= r("giftcard_min", 5)) cats.push("gift_card");
  if (r("product_enabled", true) && !isGift && discount >= r("product_min", 70)) cats.push("heavy_discount");
  if (r("loot_enabled", true) && LOOT_RE.test(text)) cats.push("loot");
  if (r("gold_enabled", true) && isGold(text)) cats.push("gold");
  for (const kw of rules.keywords || []) if (kw && text.toLowerCase().includes(kw.toLowerCase()) && !cats.includes("loot")) cats.push("loot");
  return cats;
}

export function matchesLootOrPriceDrop(categories: string[] | null | undefined) {
  return !!categories?.some((category) => category === "loot" || category === "heavy_discount");
}

export const LOOT_PRICE_DROP_CATEGORIES = ["loot", "heavy_discount"];

export function makeTitle(text: string) {
  const parts: string[] = [];
  for (const line of splitlines(text)) {
    const clean = stripChars(line.replace(urlRe(), "").replace(/[^\w₹%&@.,:()\-+/ ]/gu, ""), " -:@");
    if (clean.length >= 3) parts.push(clean);
    if (parts.join(" ").length >= 16) break;
  }
  return parts.join(" · ").slice(0, 140) || "Deal";
}

export function parseItem(text: string, links: string[], image: string | null, rules: any) {
  const ok = (l: string) => l.startsWith("http") && !l.includes("t.me/") && !/\.(jpe?g|png|gif|webp|js|css|svg)(\?|\/|$)|\/raw\/upload\/|dash-front-assets/i.test(l);
  links = links.filter(ok);
  for (const u of findUrls(text)) if (!links.includes(u) && ok(u)) links.push(u);
  if (!links.length) return null;
  const url = links.find((l) => detectStore(l) !== "Other") || links[0];
  const [price, mrp] = extractPrices(text);
  const discount = extractDiscount(text, price, mrp);
  return { title: makeTitle(text), text: text.slice(0, 1500), url, store: detectStore(url, text), price, mrp, discount, categories: classify(text, discount, rules), image };
}

async function fetchText(url: string, init: any = {}, timeoutMs = 20000) {
  const r = await fetch(url, { ...init, headers: { ...UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(timeoutMs) });
  return r;
}

function strippedStrings(el: any): string[] {
  const out: string[] = [];
  const walk = (n: any) => {
    for (const c of n.childNodes || []) {
      if (c.nodeType === 3) {
        const t = (c.text || "").trim();
        if (t) out.push(t);
      } else walk(c);
    }
  };
  walk(el);
  return out;
}

export async function fetchTelegram(username: string) {
  username = username.trim().replace(/^@/, "").replace("https://t.me/", "").replace("s/", "").replace(/^\/+|\/+$/g, "");
  const r = await fetchText(`https://t.me/s/${username}`);
  if (!r.ok) throw new Error(`HTTP ${r.status} for t.me/s/${username}`);
  const root = parseHtml(await r.text());
  const msgs = root.querySelectorAll("div.tgme_widget_message");
  if (!msgs.length) throw new Error(`@${username} is not a public channel or has no posts`);
  const items: any[] = [];
  for (const m of msgs) {
    const body = m.querySelector(".tgme_widget_message_text");
    if (!body) continue;
    const text = parseHtml(body.innerHTML.replace(/<br\s*\/?>/gi, "\n")).text;
    const links = body.querySelectorAll("a").map((a) => a.getAttribute("href") || "");
    let img = null;
    const p = m.querySelector(".tgme_widget_message_photo_wrap") || m.querySelector(".link_preview_right_image") || m.querySelector(".link_preview_image");
    const style = p?.getAttribute("style") || "";
    if (p && style.includes("url(")) img = style.split("url(")[1].split(")")[0].replace(/^['"]+|['"]+$/g, "");
    const t = m.querySelector("time[datetime]");
    let posted = null;
    if (t) {
      const d = new Date(t.getAttribute("datetime"));
      if (!isNaN(d.getTime())) posted = d.toISOString();
    }
    const dp = m.getAttribute("data-post");
    items.push({ ext_id: dp, text, links, image: img, posted_at: posted, post_url: dp ? `https://t.me/${dp}` : null });
  }
  return items;
}

const htmlToText = (h: string) => parseHtml((h || "").replace(/<[^>]+>/g, " ")).text.replace(/\s+/g, " ").trim();

export async function fetchRss(url: string) {
  const r = await fetchText(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" }).parse(await r.text());
  const arr = (x: any) => (x == null ? [] : Array.isArray(x) ? x : [x]);
  const str = (x: any) => (x == null ? "" : typeof x === "object" ? x["#text"] ?? x["@_href"] ?? "" : String(x));
  const rssItems = arr(xml?.rss?.channel?.item);
  const atomItems = arr(xml?.feed?.entry);
  const items: any[] = [];
  for (const e of [...rssItems, ...atomItems].slice(0, 40)) {
    const rawLink = Array.isArray(e.link) ? e.link.find((x: any) => x?.["@_rel"] === "alternate") || e.link[0] : e.link;
    const link = str(rawLink);
    // WordPress RSS often puts only a teaser in description and embeds the retailer buttons in content:encoded.
    const rawSummary = str(e["content:encoded"] ?? e.description ?? e.summary ?? e.content);
    const summary = htmlToText(rawSummary);
    const descriptionLinks = parseHtml(rawSummary).querySelectorAll("a[href]").map((a) => a.getAttribute("href") || "");
    const links = [...new Set([...descriptionLinks, ...findUrls(summary), link].filter((x) => /^https?:\/\//i.test(x)))];
    const media = arr(e["media:content"])[0];
    const img = media ? media["@_url"] : null;
    const pub = str(e.pubDate ?? e.published ?? e.updated);
    // Feeds commonly omit a publication timestamp. Treat a newly read item as fresh only in that case.
    const d = pub ? new Date(pub) : new Date();
    const title = htmlToText(str(e.title));
    items.push({ ext_id: str(e.guid) || str(e.id) || link, text: `${title}\n${summary}`, links, image: img,
      posted_at: !isNaN(d.getTime()) ? d.toISOString() : null, post_url: link });
  }
  return items;
}

function relTime(txt: string) {
  const t = (txt || "").toLowerCase();
  if (/just now|less than a minute|seconds?/.test(t)) return new Date().toISOString();
  const m = t.match(/(\d+|an?|one)\s*(min|minute|hr|hour|day|d\b|h\b|m\b)/);
  if (!m) return null;
  const n = ["a", "an", "one"].includes(m[1]) ? 1 : parseInt(m[1]);
  const unit = m[2];
  const ms = unit.startsWith("d") ? n * 86400e3 : unit.startsWith("h") ? n * 3600e3 : n * 60e3;
  return new Date(Date.now() - ms).toISOString();
}

async function getHtml(url: string) {
  const r = await fetchText(url, { headers: { Accept: "text/html", "Accept-Language": "en-IN,en" } });
  const text = await r.text();
  if (r.status === 202 || text.slice(0, 2000).includes("sgcaptcha") || (text.slice(0, 3000).includes("challenge-platform") && text.length < 5000))
    throw new Error("This website blocks automatic reading (captcha). Use its Telegram channel instead.");
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return parseHtml(text);
}

async function fetchDesidime(url: string) {
  const s = await getHtml(url);
  const items: any[] = [];
  for (const a of s.querySelectorAll("article.deal-card").slice(0, 30)) {
    const did = a.getAttribute("data-gtm-deal-id");
    const img = a.querySelector("img");
    const strings = strippedStrings(a);
    const title = (img?.getAttribute("alt") || "") || strings.join(" ").slice(0, 120);
    const buy = a.querySelector('a[href*="visit.desidime.com"]');
    const perm = a.getAttribute("data-permalink");
    const when = strings.find((t) => /\bago\b|just now/.test(t)) || "";
    items.push({ ext_id: `desidime:${did}`, text: `${title}\n${strings.join(" ")}`, links: buy ? [buy.getAttribute("href")] : [],
      image: img?.getAttribute("src") || null, posted_at: relTime(when), post_url: perm ? `https://www.desidime.com/${perm}` : null, title });
  }
  return items;
}

async function fetchDealsmagnet(url: string) {
  const s = await getHtml(url);
  const items: any[] = [];
  const seen = new Set<string>();
  const txt = (el: any) => (el ? strippedStrings(el).join(" ") : "");
  for (const b of s.querySelectorAll(".hotdeal")) {
    const a = b.querySelector('a[href*="/deal/"]');
    const href = a?.getAttribute("href");
    if (!href || seen.has(href)) continue;
    seen.add(href);
    const img = b.querySelector("img");
    const title = b.querySelector(".title") ? txt(b.querySelector(".title")) : img?.getAttribute("alt") || "";
    const price = b.querySelector(".DiscountedPrice");
    const mrp = b.querySelector(".OriginalPrice");
    const disc = b.querySelector(".Discount");
    const when = b.querySelector(".TimeDuration");
    const rib = b.querySelector(".ribbon");
    const text = [title, price ? `Deal Price ${strippedStrings(price).join("")}` : "", mrp ? `MRP ${strippedStrings(mrp).join("")}` : "",
      disc ? `${txt(disc).replace(" off", "")} off` : "", rib ? txt(rib) : ""].filter(Boolean).join("\n");
    items.push({ ext_id: "dm:" + href.split("-").pop(), text, links: [href], image: img ? img.getAttribute("data-src") || img.getAttribute("src") : null,
      posted_at: relTime(when ? txt(when) : ""), post_url: href, title });
    if (items.length >= 40) break;
  }
  return items;
}

export async function fetchWeb(url: string) {
  const u = url.toLowerCase();
  if (u.includes("desidime.com")) return fetchDesidime(url);
  if (u.includes("dealsmagnet.com")) return fetchDealsmagnet(u.replace(/\/+$/, "").endsWith("/deal") ? "https://www.dealsmagnet.com/" : url);
  if (u.includes("crafin.in")) await getHtml(url);
  throw new Error("Unsupported website. Supported: desidime.com, dealsmagnet.com (others: add their Telegram or RSS feed)");
}

const SHORT_DOMAINS = ["visit.desidime.com", "fkrt.it", "fkrt.cc", "fkrt.co", "fktr.in", "dl.flipkart.com/s/", "amzn.to", "amzn.in", "amzn.eu",
  "myntr.it", "ajiio.in", "bit.ly", "tinyurl.com", "ekaro.in", "linkredirect.in", "extp.in", "bitli.in",
  "cutt.ly", "wishlink.com", "inr.deals", "clnk.in", "earnkaro.com", "t.co/", "rebrand.ly", "shrsl.com", "sankmo", "ddime.in", "fas.st", "s.click", "tiny.cc", "goo.gl", "amzn-to.co", "amznn.cc", "fkrt.to", "cuelinks.com", "/s/", "bitly", "shorturl", "redirect"];
const WRAP_KEYS = ["dl", "url", "u", "link", "redirect", "redirect_url", "target", "r", "ulp"];
const AFF_KEYS = new Set(["tag", "ascsubtag", "linkcode", "linkid", "creative", "creativeasin", "camp", "affid", "affextparam1",
  "affextparam2", "affextparam3", "cmpid", "ref", "ref_", "smid", "psc", "aff_id", "affiliate_id", "subid",
  "sub_id", "clickid", "gclid", "fbclid", "_appid", "pageuniqueid", "ocid", "_refid", "_ga", "utm_source",
  "utm_medium", "ascsub", "ck", "btn_ref", "btnref", "btn_type", "btntype", "pf_rd_r", "pd_rd_r", "utm_campaign", "utm_content", "utm_term", "utm_id", "source", "campaign", "src", "srsltid"]);

const tryUrl = (u: string) => { try { return new URL(u); } catch { return null; } };

function unwrap(url: string) {
  for (let i = 0; i < 3; i++) {
    const m = url.slice(8).match(/.(https?:\/\/.+)$/);
    if (m && detectStore(m[1]) !== "Other") url = m[1];
    const p = tryUrl(url);
    if (!p) break;
    const inner = WRAP_KEYS.map((k) => p.searchParams.get(k)).find((v) => v && v.startsWith("http"));
    if (!inner) break;
    url = inner;
  }
  return url;
}

const rebuild = (p: URL, params: [string, string][]) => {
  const qs = new URLSearchParams(params).toString();
  return `${p.protocol}//${p.host}${p.pathname}${qs ? "?" + qs : ""}`;
};

export function stripAffiliate(url: string) {
  const p = tryUrl(url);
  if (!p) return url;
  if (p.pathname.includes("/dealsmagnet")) p.pathname = p.pathname.replace(/^\/dealsmagnet\.com/, "").replace("/dealsmagnet/p/dealsmagnet_deals", "/product/p/item");
  const host = p.host.toLowerCase();
  if (host.includes("amazon.")) {
    const m = p.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/);
    if (m) return `https://www.amazon.in/dp/${m[1]}`;
  }
  let params = [...p.searchParams.entries()].filter(([k]) => !AFF_KEYS.has(k.toLowerCase()));
  if (host.includes("flipkart.")) params = params.filter(([k]) => ["pid", "lid", "marketplace", "q", "otracker"].includes(k)).slice(0, 3).filter(([k]) => k !== "otracker");
  return rebuild(p, params);
}

const needsResolve = (url: string) => SHORT_DOMAINS.some((d) => url.toLowerCase().includes(d)) || detectStore(url) === "Other";

export async function resolveDealsmagnet(url: string): Promise<[string, string | null]> {
  const r = await fetchText(url, { redirect: "follow" }, 10000);
  const page = r.url || url;
  const text = await r.text();
  const m = text.match(/data-code="([^"]+)"/);
  const img = text.match(/og:image" content="([^"]+)"/);
  if (!m) return [url, img ? img[1] : null];
  const code = parseHtml(`<i>${m[1]}</i>`).text;
  const b = await fetchText(`https://www.dealsmagnet.com/buy?${code}`, { headers: { Referer: page }, redirect: "manual" }, 10000);
  const loc = b.headers.get("location") || url;
  return [unwrap(loc), img ? img[1] : null];
}

export async function fetchOgImage(url: string) {
  try {
    const r = await fetchText(url, { redirect: "follow" }, 8000);
    const t = await r.text();
    const m = t.match(/<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+)/) || t.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image/);
    return m && m[1].startsWith("http") ? m[1] : null;
  } catch {
    return null;
  }
}

export async function cleanLink(url: string) {
  url = unwrap(url).replace("://dl.flipkart.com/dl/", "://www.flipkart.com/");
  if (needsResolve(url)) {
    try {
      for (let i = 0; i < 8; i++) {
        const r = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(8000) });
        const loc = r.headers.get("location");
        if (r.status >= 300 && r.status < 400 && loc) {
          url = unwrap(new URL(loc, url).toString());
          if (!needsResolve(url)) break;
          continue;
        }
        const body = await r.text();
        const found = findUrls(body).filter((u) => detectStore(u) !== "Other");
        const visit = body.match(/https:\/\/visit\.desidime\.com\/visit\/[^"'\s<>]+/g) || [];
        if (!found.length && visit.length && url.includes("desidime.com")) {
          url = visit.find((v) => v.includes("buy-now")) || visit.find((v) => v.includes("/deals-")) || visit[0];
          continue;
        }
        if (found.length) url = unwrap(found[0]);
        break;
      }
    } catch {
      /* keep the last good url */
    }
  }
  return stripAffiliate(url);
}

export const DEAL_SITES = ["desidime.com", "ddime.in", "dealsmagnet.com", "dealsheaven.in", "coolztricks.com", "freekaamaal.com",
  "t.me/", "telegram.me", "lootdeals", "dealzarena", "indiafreestuff"];
export const isDealSite = (url: string) => DEAL_SITES.some((d) => (url || "").toLowerCase().includes(d));

export function score(deal: any) {
  const cats = deal.categories || [];
  let s = Math.min(Number(deal.discount) || 0, 100);
  s += cats.includes("supercoin_100") ? 120 : 0;
  s += cats.includes("loot") ? 60 : 0;
  s += cats.includes("gift_card") ? 30 : 0;
  s += ["Flipkart", "Amazon"].includes(deal.store) ? 15 : 0;
  s += deal.image ? 5 : 0;
  return Math.round(s * 10) / 10;
}

export function cleanTitle(t: string | null | undefined) {
  const out = (t || "").trim().replace(/(?:[\s\-–,|&]+(?:for|with|and|by|of|in|-)?|\.{2,}|…)+\s*$/i, "");
  return out || null;
}

export function amazonAffiliate(url: string, tag: string) {
  tag = (tag || "").trim();
  if (!tag) return url;
  const p = tryUrl(url);
  if (!p) return url;
  const params = [...p.searchParams.entries()].filter(([k]) => k.toLowerCase() !== "tag");
  params.push(["tag", tag]);
  return rebuild(p, params);
}

export async function convertLink(url: string, settings: any) {
  if (settings.convert_enabled === false || isDealSite(url)) return url;
  const store = detectStore(url);
  const route = store === "Amazon"
    ? "earnkaro"
    : settings.affiliate_routes?.[store] || ((settings.sankmo_stores?.length ? settings.sankmo_stores : SANKMO_DEFAULT).includes(store) ? "sankmo" : "earnkaro");
  if (route === "original") return url;
  // Older settings may still say "amazon"; Amazon links now always use EarnKaro.
  if (route === "earnkaro" || route === "amazon") return convertWithEarnKaro(url, settings);
  const allowed = settings.sankmo_stores?.length ? settings.sankmo_stores : SANKMO_DEFAULT;
  if (!allowed.includes(store)) return convertWithEarnKaro(url, settings);
  const mode = settings.convert_mode || "sankmo_api";
  if (mode === "telegram") return convertWithEarnKaro(url, settings); // personal-account conversion was explicitly removed
  const token = (settings.sankmo_token || "").trim();
  if (mode === "sankmo_api") {
    if (!token) return convertWithEarnKaro(url, settings);
    try {
      const r = await fetch("https://sankmo.in/api/convertMunafaLinks", {
        method: "POST", body: new URLSearchParams({ text: url }), headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000),
      });
      const data: any = await r.json().catch(() => ({}));
      const found = findUrls((data && data.convertedText) || "");
      if (r.ok && found.length && found[0] !== url) return found[0];
      throw new Error(`Sankmo: ${data?.msg || "no converted link returned"}`);
    } catch (e) {
      try {
        return await convertWithEarnKaro(url, settings);
      } catch (fallbackError) {
        throw new Error(`${e?.message || "Sankmo conversion failed"}; EarnKaro fallback: ${fallbackError?.message || "conversion failed"}`);
      }
    }
  }
  const api = (settings.sankmo_api_url || "").trim();
  if (!api || !token) return convertWithEarnKaro(url, settings);
  try {
    const r = api.includes("{url}")
      ? await fetch(api.replace("{url}", encodeURIComponent(url)).replace("{token}", token), { signal: AbortSignal.timeout(15000) })
      : await fetch(api, { method: "POST", body: JSON.stringify({ url, link: url, token }), signal: AbortSignal.timeout(15000),
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-API-Key": token } });
    if (!r.ok) throw new Error(`Sankmo converter failed (${r.status})`);
    const raw = await r.text();
    let data: any;
    try { data = JSON.parse(raw); } catch {
      const f = findUrls(raw).find((candidate) => candidate !== url);
      if (f) return f;
      throw new Error("Sankmo returned no earning link");
    }
    for (const key of ["converted_url", "short_url", "shortUrl", "affiliate_url", "earn_link", "link", "url", "data", "result"]) {
      let v = data && typeof data === "object" ? data[key] : null;
      if (v && typeof v === "object") v = Object.values(v).find((x) => typeof x === "string" && x.startsWith("http"));
      if (typeof v === "string") {
        const candidate = findUrls(v).find((link) => link !== url);
        if (candidate) return candidate;
      }
    }
    throw new Error("Sankmo returned no earning link");
  } catch (e) {
    try {
      return await convertWithEarnKaro(url, settings);
    } catch (fallbackError) {
      throw new Error(`${e?.message || "Sankmo conversion failed"}; EarnKaro fallback: ${fallbackError?.message || "conversion failed"}`);
    }
  }
}

async function convertWithEarnKaro(url: string, settings: any) {
  const token = (settings.earnkaro_token || "").trim();
  if (!token) throw new Error("Add your EarnKaro API token in Affiliate links settings");
  const r = await fetch("https://ekaro-api.affiliaters.in/api/converter/public", {
    method: "POST",
    body: JSON.stringify({ deal: url, convert_option: "convert_only" }),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20000),
  });
  const raw = await r.text();
  let data: any;
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { data: raw }; }
  if (!r.ok || data?.success !== 1) {
    throw new Error(`EarnKaro: ${data?.message || data?.error || `converter failed (${r.status})`}`);
  }
  const converted = typeof data.data === "string" ? data.data : JSON.stringify(data.data ?? "");
  const candidate = findUrls(converted).find((link) => link !== url);
  if (!candidate) throw new Error("EarnKaro returned no converted link");
  return candidate;
}

const HEADLINES: Record<string, string> = { supercoin_100: "🪙 100% SUPERCOIN DEAL", gift_card: "🎁 GIFT CARD OFFER",
  loot: "🚨 LOOT / PRICE ERROR", heavy_discount: "🔥 HEAVY DISCOUNT", gold: "🪙 GOLD & SILVER DEAL" };
const inr = (v: any) => (v ? fmtInr(Number(v)) : null);
const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const OFFER_ICONS: Record<string, string> = { bank: "💳", coupon: "🎟️", supercoin: "🪙", cashback: "💰" };

function offerLines(deal: any) {
  const out: string[] = [];
  const sp = Number(deal.store_price), p = Number(deal.price);
  if (sp && p && sp > p) out.push(`🏷️ Store ${inr(sp)} → you pay ${inr(p)}`);
  for (const o of deal.offers || []) {
    if (o.kind === "supercoin" && deal.title.toLowerCase().includes("supercoin") && o.label.includes("100%")) continue;
    out.push(`${OFFER_ICONS[o.kind] || "•"} ${esc(o.label)}`);
  }
  return out;
}

export function formatMessage(deal: any, style = "simple") {
  const link = deal.affiliate_url || deal.url;
  const title = esc(deal.title);
  if (style === "simple") {
    const cats = deal.categories || [];
    let prefix = "";
    if (cats.includes("supercoin_100") && !deal.title.toLowerCase().includes("supercoin")) prefix = "100% Supercoins Back: ";
    else if (cats.includes("gift_card") && !deal.title.toLowerCase().includes("gift")) prefix = "Gift Card Deal: ";
    else if (cats.includes("gold") && !/gold|silver/i.test(deal.title)) prefix = "Gold Deal: ";
    const lines = [`<b>${prefix}${title}</b>`];
    if (deal.price) lines.push(`Price: ${inr(deal.price)}` + (deal.mrp ? ` (MRP ${inr(deal.mrp)})` : ""));
    lines.push(...offerLines(deal), link);
    return lines.join("\n");
  }
  const head = HEADLINES[(deal.categories || ["heavy_discount"])[0]] || "🔥 DEAL";
  const lines = [`<b>${head}</b>`, "", `<b>${title}</b>`];
  const pl: string[] = [];
  if (deal.price) pl.push(`Price: <b>${inr(deal.price)}</b>`);
  if (deal.mrp) pl.push(`MRP: <s>${inr(deal.mrp)}</s>`);
  if (deal.discount) pl.push(`<b>${Math.round(Number(deal.discount))}% OFF</b>`);
  if (pl.length) lines.push(pl.join(" | "));
  lines.push(`Store: ${esc(deal.store || "")}`, ...offerLines(deal));
  if (deal.note) lines.push("", esc(deal.note));
  lines.push("", `👉 ${link}`);
  return lines.join("\n");
}

export async function sendTelegram(token: string, chatId: string, text: string, image?: string | null, deal: any = {}) {
  const lpUrl = deal.affiliate_url || deal.url;
  const payload: any = { chat_id: chatId, text, parse_mode: "HTML" };
  if (typeof lpUrl === "string" && lpUrl.startsWith("http")) payload.link_preview_options = { url: lpUrl, prefer_large_media: true, show_above_text: true };
  const call = (method: string, body: any) => fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
  });
  if (image) {
    const r = await call("sendPhoto", { chat_id: chatId, photo: image, caption: text.slice(0, 1024), parse_mode: "HTML" });
    if (r.status === 200) return r.json();
  }
  const r = await call("sendMessage", payload);
  const data: any = await r.json().catch(() => ({}));
  if (!data.ok) throw new Error(data.description || "Telegram error");
  return data;
}

export function productKey(url: string) {
  const p = tryUrl(url);
  if (!p) return (url || "").toLowerCase();
  let m = p.pathname.match(/\/dp\/([A-Z0-9]{10})/);
  if (m) return `amazon:${m[1]}`;
  const pid = p.searchParams.get("pid");
  if (p.host.includes("flipkart.") && pid) return `flipkart:${pid}`;
  m = p.pathname.match(/\/(itm[a-z0-9]+)/);
  if (m) return `flipkart:${m[1]}`;
  return `${p.host}${p.pathname}?${p.search.slice(1)}`.toLowerCase().replace(/[/?]+$/, "");
}

export function compareLinks(title: string) {
  let words = (title || "").replace(/\b(loot|deal|deals|offer|price error|bug|off|flat|upto|up to|back|supercoins?|on|at)\b|\d+\s*%|₹\s*[\d,]+|[^\w\s]/gi, " ");
  words = words.split(/\s+/).filter(Boolean).join(" ").slice(0, 80);
  const q = encodeURIComponent(words).replace(/%20/g, "+");
  const slug = words.toLowerCase().split(/\s+/).filter(Boolean).join("-");
  return [
    { name: "Amazon", url: `https://www.amazon.in/s?k=${q}` },
    { name: "Flipkart", url: `https://www.flipkart.com/search?q=${q}` },
    { name: "Myntra", url: `https://www.myntra.com/${slug}` },
    { name: "Croma", url: `https://www.croma.com/searchB?q=${q}` },
    { name: "Google Shopping", url: `https://www.google.com/search?tbm=shop&q=${q}` },
    { name: "PriceHistory", url: `https://pricehistory.app/search?q=${q}` },
  ];
}

export const PH_SUPPORTED = ["amazon.in", "flipkart.com", "myntra.com", "ajio.com", "croma.com", "tatacliq.com", "nykaa.com",
  "jiomart.com", "reliancedigital.in", "meesho.com", "shopsy.in", "vijaysales.com"];
export function phSupported(url: string) {
  const u = (url || "").toLowerCase();
  if (/amazon\.in\/s\b|\/search\?|\/s\?k=/.test(u)) return false;
  return PH_SUPPORTED.some((d) => u.includes(d));
}

/** Full price history for a store product link from pricehistory.app. */
export async function phLookup(url: string) {
  const PH = "https://pricehistory.app";
  const r = await fetch(`${PH}/api/search`, { method: "POST", headers: { ...UA, "Content-Type": "application/json" }, body: JSON.stringify({ url }), signal: AbortSignal.timeout(15000) });
  const j: any = await r.json();
  if (!j.status || !j.code) return null;
  const code = j.code;
  const page = await (await fetch(`${PH}/p/${code}`, { headers: UA, signal: AbortSignal.timeout(15000) })).text();
  const tok = page.match(/append\("token","([a-f0-9]+)"/);
  const pid = page.match(/append\("page","([A-Za-z0-9]+)"/);
  if (!tok || !pid) return null;
  const img = page.match(/og:image" content="([^"]+)"/);
  const p = await fetch(`${PH}/api/price/${pid[1]}`, { method: "POST", signal: AbortSignal.timeout(15000),
    headers: { ...UA, "Content-Type": "application/json", page: pid[1], token: tok[1], Referer: `${PH}/p/${code}` } });
  const d: any = await p.json();
  const price = d.Price || {};
  let hist = ((d.History || {}).Price || []).filter((h: any) => h.y).map((h: any) => ({ x: String(h.x).replace(" ", "T") + "+05:30", y: h.y }));
  if (hist.length > 400) {
    const step = hist.length / 400;
    const out = Array.from({ length: 400 }, (_, i) => hist[Math.floor(i * step)]);
    out[399] = hist[hist.length - 1];
    hist = out;
  }
  return {
    code, name: j.name, page_url: `${PH}/p/${code}`, image: img ? img[1] : null,
    price: price.Price, mrp: price.MRP, min: price.MinPrice, min_on: price.MinPriceOn, max: price.MaxPrice, max_on: price.MaxPriceOn,
    avg: price.Count ? Math.round(price.TotalPrice / price.Count) : null, history: hist, fetched_at: new Date().toISOString(),
  };
}
