import { beforeEach, describe, expect, it, vi } from "vitest";
import { convertBulk } from "@/server/core.server";

const state = vi.hoisted(() => ({ deals: [] as any[], fail: false, saveFail: false, calls: 0 }));
vi.mock("@/server/engine.server", async (load) => {
  const engine = await load<typeof import("@/server/engine.server")>();
  return { ...engine, cleanLink: async (url: string) => url.split("?")[0],
    convertLink: async () => { state.calls++; if (state.fail) throw new Error("Provider unavailable"); return "https://ekaro.in/my-deal"; },
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

beforeEach(() => { state.deals = []; state.fail = false; state.saveFail = false; state.calls = 0; });
const text = "Earbuds ₹399 https://www.amazon.in/dp/B000000001?tag=someone-21";
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