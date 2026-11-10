import { beforeEach, describe, expect, it, vi } from "vitest";
import { convertBulk, publishConversion, repost } from "@/server/core.server";
import { formatKolkata } from "@/lib/utils";

const state = vi.hoisted(() => ({
  deals: [] as any[], logs: [] as any[], destinations: [] as any[],
  fail: false, saveFail: false, sendFail: false, calls: 0,
}));
vi.mock("@/server/engine.server", async (load) => {
  const engine = await load<typeof import("@/server/engine.server")>();
  return { ...engine, cleanLink: async (url: string) => url.split("?")[0],
    convertLink: async () => { state.calls++; if (state.fail) throw new Error("Provider unavailable"); return "https://ekaro.in/my-deal"; },
    sendTelegram: async () => { if (state.sendFail) throw new Error("Chat not found"); return { ok: true, result: { message_id: 77 } }; },
    fetchProductInfo: async () => ({}), fetchOgImage: async () => null };
});
vi.mock("@/server/db.server", () => ({ db: { from: (table: string) => {
  let op = "select", patch: any, filters: Record<string, any> = {};
  const q: any = {
    select: () => q, eq: (key: string, value: any) => { filters[key] = value; return q; },
    or: () => q, not: () => q, order: () => q, limit: () => q,
    maybeSingle: () => q, insert: (value: any) => { op = "insert"; patch = value; return q; },
    update: (value: any) => { op = "update"; patch = value; return q; },
    then: (resolve: any) => {
      if (table === "settings") return Promise.resolve({ data: { earnkaro_token: "configured" }, error: null }).then(resolve);
      if (table === "destinations") return Promise.resolve({ data: state.destinations, error: null }).then(resolve);
      if (table === "post_logs" && op === "insert") { state.logs.push(patch); return Promise.resolve({ data: null, error: null }).then(resolve); }
      if (table === "deals" && op === "select" && "id" in filters)
        return Promise.resolve({ data: state.deals.find((d) => d.id === filters["id"]) ?? null, error: null }).then(resolve);
      if (table === "deals" && op !== "select") {
        if (state.saveFail) return Promise.resolve({ data: null, error: { message: "Storage unavailable" } }).then(resolve);
        if (op === "insert") state.deals.push(patch);
        else Object.assign(state.deals.find((d) => d.id === filters["id"]) || {}, patch);
      }
      const data = table === "deals" && op === "select" && filters["clean_url"]
        ? state.deals.filter((d) => d.clean_url === filters["clean_url"]) : [];
      return Promise.resolve({ data, error: null }).then(resolve);
    },
  }; return q;
} } }));

const CLEAN = "https://www.amazon.in/dp/B000000001";
const AFFILIATE = "https://ekaro.in/my-deal";
beforeEach(() => {
  state.deals = []; state.logs = []; state.destinations = [{ id: "dest-1", name: "Main channel", bot_token: "t", chat_id: "1", enabled: true }];
  state.fail = false; state.saveFail = false; state.sendFail = false; state.calls = 0;
});
const text = "Earbuds ₹399 https://www.amazon.in/dp/B000000001?tag=someone-21";
const publish = (over: any = {}) => publishConversion({ original: `${CLEAN}?tag=x`, cleaned: CLEAN, converted: AFFILIATE, error: null, text, settings: {}, ...over });

describe("Convert Links deal saving", () => {
  it("saves each successful conversion as a deal with the same affiliate URL and no automatic posting", async () => {
    const result = await convertBulk({ text });
    expect(state.deals).toHaveLength(1);
    expect(state.deals[0]).toMatchObject({ clean_url: "https://www.amazon.in/dp/B000000001", affiliate_url: "https://ekaro.in/my-deal", converted: true, source: "Convert Links", price: 399, posted_to: [] });
    expect(result.items[0].deal_id).toBe(state.deals[0].id);
    expect(state.calls).toBe(1);
  });
  it("updates an existing deal rather than duplicating the same cleaned link", async () => {
    await convertBulk({ text }); await convertBulk({ text });
    expect(state.deals).toHaveLength(1);
  });
  it("does not add failed conversions as earning deals", async () => {
    state.fail = true;
    const result = await convertBulk({ text });
    expect(state.deals).toHaveLength(0);
    expect(result.items[0].deal_id).toBeNull();
  });
  it("reports a saving failure separately from a successful conversion", async () => {
    state.saveFail = true;
    const result = await convertBulk({ text });
    expect(result.items[0].changed).toBe(true);
    expect(result.items[0].save_error).toBe("Storage unavailable");
    expect(result.items[0].deal_id).toBeNull();
  });
});

describe("Website publication", () => {
  it("publishes a successful conversion once and sets its publication time", async () => {
    const a = await publish({ source: "Telegram converter" });
    const b = await publish({ source: "Telegram converter" });
    expect(state.deals).toHaveLength(1);
    expect(a.deal_id).toBe(state.deals[0].id);
    expect(b.deal_id).toBe(a.deal_id);
    expect(state.deals[0]).toMatchObject({ source: "Telegram converter", published_at: expect.any(String) });
  });
  it("does not publish a failed or unchanged conversion", async () => {
    expect(await publish({ error: "Provider unavailable" })).toEqual({ deal_id: null, save_error: null });
    expect(await publish({ converted: CLEAN })).toEqual({ deal_id: null, save_error: null });
    expect(state.deals).toHaveLength(0);
  });
  it("keeps original posted and publication times on reconversion", async () => {
    const old = "2020-01-01T00:00:00.000Z";
    await convertBulk({ text });
    Object.assign(state.deals[0], { posted_at: old, published_at: old, created_at: old });
    await convertBulk({ text });
    expect(state.deals).toHaveLength(1);
    expect(state.deals[0]).toMatchObject({ posted_at: old, published_at: old, created_at: old, converted_at: expect.any(String) });
    expect(state.deals[0].converted_at).not.toBe(old);
  });
  it("does not invent a publication time for historical deals", async () => {
    state.deals.push({ id: "old", clean_url: CLEAN, posted_at: "2020-01-01T00:00:00.000Z" });
    await publish();
    expect(state.deals[0].published_at).toBeUndefined();
    expect(formatKolkata(state.deals[0].published_at)).toBe("Unknown");
  });
});

describe("Telegram posting timestamps", () => {
  it("records sent time and message ID only for a successful post", async () => {
    await publish();
    await repost(state.deals[0].id, "dest-1");
    expect(state.logs[0]).toMatchObject({ status: "success", message_id: 77, sent_at: expect.any(String) });
    expect(state.deals[0].telegram_posted_at).toBe(state.logs[0].sent_at);
  });
  it("gives a failed post no success time", async () => {
    await publish();
    state.sendFail = true;
    await repost(state.deals[0].id, "dest-1");
    expect(state.logs[0]).toMatchObject({ status: "failed", sent_at: null, message_id: null });
    expect(state.deals[0].telegram_posted_at).toBeUndefined();
  });
});

describe("Kolkata time display", () => {
  it("shows Unknown for missing times", () => {
    expect(formatKolkata(null)).toBe("Unknown");
    expect(formatKolkata(undefined)).toBe("Unknown");
    expect(formatKolkata("not a date")).toBe("Unknown");
  });
  it("converts stored UTC into Asia/Kolkata with IST label", () => {
    const shown = formatKolkata("2026-11-10T00:00:00.000Z");
    expect(shown).toContain("5:30");
    expect(shown.endsWith(" IST")).toBe(true);
  });
});
