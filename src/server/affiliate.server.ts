import * as engine from "./engine.server";

export async function convertAffiliate(original: string, settings: any) {
  const cleaned = await engine.cleanLink(original);
  try {
    const converted = await engine.convertLink(cleaned, settings);
    return { original, cleaned, converted, changed: converted !== cleaned, error: null as string | null, store: engine.detectStore(cleaned) };
  } catch (error) {
    return { original, cleaned, converted: cleaned, changed: false, error: String(error instanceof Error ? error.message : error).slice(0, 300), store: engine.detectStore(cleaned) };
  }
}

type Entity = { type: string; offset: number; length: number; url?: string; [key: string]: unknown };

/** Telegram offsets and JavaScript slices both use UTF-16 code units. */
export async function convertAffiliateText(text: string, settings: any, entities: Entity[] = []) {
  const spans = [...text.matchAll(/https?:\/\/[^\s<>"')\]]+/g)].map((m) => {
    const url = m[0].replace(/[.,;!]+$/, "");
    return { start: m.index, end: m.index + url.length, url };
  });
  const urls = [...new Set([...spans.map((s) => s.url), ...entities.filter((e) => e.type === "text_link").map((e) => e.url || "")].filter(Boolean))];
  const items = [];
  for (const url of urls) items.push(await convertAffiliate(url, settings));
  const converted = new Map(items.map((i) => [i.original, i.converted]));
  const position = (offset: number) => offset + spans.filter((s) => s.end <= offset).reduce((n, s) => n + (converted.get(s.url) || s.url).length - (s.end - s.start), 0);
  const updatedEntities = entities.map((entity) => ({ ...entity, offset: position(entity.offset), length: position(entity.offset + entity.length) - position(entity.offset),
    ...(entity.type === "text_link" && entity.url ? { url: converted.get(entity.url) || entity.url } : {}) }));
  let message = text;
  for (const span of [...spans].reverse()) message = message.slice(0, span.start) + (converted.get(span.url) || span.url) + message.slice(span.end);
  return { message, entities: updatedEntities, items };
}