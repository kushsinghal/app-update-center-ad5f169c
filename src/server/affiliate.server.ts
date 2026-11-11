import * as engine from "./engine.server";

const EARN_LINK_HOSTS = ["ekaro.in"];

function isOwnAffiliateLink(url: string, settings: any) {
  let p: URL;
  try { p = new URL(url); } catch { return false; }
  const host = p.hostname.toLowerCase();
  if (EARN_LINK_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return true;
  const tag = String(settings?.amazon_tag || "").trim();
  return !!tag && host.includes("amazon.") && p.searchParams.get("tag") === tag;
}

export async function convertAffiliate(original: string, settings: any) {
  if (isOwnAffiliateLink(original, settings)) {
    return { original, cleaned: original, converted: original, changed: false, error: null as string | null, store: engine.detectStore(original) };
  }
  const cleaned = await engine.cleanLink(original);
  try {
    const converted = await engine.convertLink(cleaned, settings);
    return { original, cleaned, converted, changed: converted !== cleaned, error: null as string | null, store: engine.detectStore(cleaned) };
  } catch (error) {
    return { original, cleaned, converted: cleaned, changed: false, error: String(error instanceof Error ? error.message : error).slice(0, 300), store: engine.detectStore(cleaned) };
  }
}

type Entity = { type: string; offset: number; length: number; url?: string | undefined; [key: string]: unknown };
type Span = { start: number; end: number; url: string };
type Replacement = { start: number; end: number; newStart: number; newEnd: number };

const linkLabel = (store: string) => `@${(store && store !== "Other" ? store : "Link").replace(/\s+/g, "")}`;

/** Telegram offsets and JavaScript slices both use UTF-16 code units. */
export async function convertAffiliateText(text: string, settings: any, entities: Entity[] = []) {
  const spans: Span[] = [...text.matchAll(/https?:\/\/[^\s<>"')\]]+/g)].map((m) => {
    const url = m[0].replace(/[.,;!]+$/, "");
    return { start: m.index!, end: m.index! + url.length, url };
  });
  const linkEntities = entities.filter((e) => e.type === "text_link" && e.url);
  const urls = [...new Set([...spans.map((s) => s.url), ...linkEntities.map((e) => e.url!)])];
  const items = [];
  for (const url of urls) items.push(await convertAffiliate(url, settings));
  const byUrl = new Map(items.map((i) => [i.original, i]));

  let message = "";
  let cursor = 0;
  const replacements: Replacement[] = [];
  const labelEntities: Entity[] = [];
  for (const span of spans) {
    message += text.slice(cursor, span.start);
    const item = byUrl.get(span.url)!;
    const shown = item.error ? span.url : settings?.converter_label_style === "link" ? item.converted : linkLabel(item.store);
    const newStart = message.length;
    message += shown;
    replacements.push({ start: span.start, end: span.end, newStart, newEnd: message.length });
    if (!item.error) labelEntities.push({ type: "text_link", offset: newStart, length: shown.length, url: item.converted });
    cursor = span.end;
  }
  message += text.slice(cursor);

  const position = (offset: number) => offset + replacements.filter((r) => r.end <= offset).reduce((n, r) => n + (r.newEnd - r.newStart) - (r.end - r.start), 0);
  const overlapsSpan = (e: Entity) => spans.some((s) => e.offset < s.end && e.offset + e.length > s.start);
  const keptEntities = entities
    .filter((e) => !((e.type === "url" || e.type === "text_link") && overlapsSpan(e)))
    .map((entity) => {
      const start = position(entity.offset);
      const end = position(entity.offset + entity.length);
      return { ...entity, offset: start, length: end - start, ...(entity.type === "text_link" && entity.url ? { url: byUrl.get(entity.url)?.converted || entity.url } : {}) };
    });

  return { message, entities: [...keptEntities, ...labelEntities], items };
}
