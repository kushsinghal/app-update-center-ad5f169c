import { afterEach, describe, expect, it, vi } from "vitest";
import * as engine from "@/server/engine.server";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("affiliate routing", () => {
  it("falls back from an unconverted Sankmo result to the configured EarnKaro route", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("sankmo.in")) return new Response(JSON.stringify({ convertedText: "" }), { status: 200 });
      expect(url).toBe("https://ekaro-api.affiliaters.in/api/converter/public");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({ deal: "https://www.flipkart.com/item/p/itm123", convert_option: "convert_only" });
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer configured");
      return new Response(JSON.stringify({ success: 1, data: "Converted deal: https://ekaro.in/new-link" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const link = await engine.convertLink("https://www.flipkart.com/item/p/itm123", {
      sankmo_token: "configured",
      sankmo_stores: ["Flipkart"],
      earnkaro_token: "configured",
    });

    expect(link).toBe("https://ekaro.in/new-link");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses the selected affiliate service for each store", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("sankmo.in")) {
        return new Response(JSON.stringify({ convertedText: "https://fkrt.site/myntra-route" }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: 1, data: "https://ekaro.in/flipkart-route" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const settings = {
      sankmo_token: "configured",
      earnkaro_token: "configured",
      sankmo_stores: ["Flipkart", "Myntra"],
      affiliate_routes: { Flipkart: "earnkaro", Myntra: "sankmo" },
    };

    await expect(engine.convertLink("https://www.flipkart.com/item/p/itm123", settings)).resolves.toBe("https://ekaro.in/flipkart-route");
    await expect(engine.convertLink("https://www.myntra.com/product", settings)).resolves.toBe("https://fkrt.site/myntra-route");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("always routes Amazon through EarnKaro, even when legacy settings select another route", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: 1, data: "https://ekaro.in/amazon-link" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(engine.convertLink("https://www.amazon.in/dp/B000000001", {
      amazon_tag: "old-tag-21",
      affiliate_routes: { Amazon: "original" },
      earnkaro_token: "configured",
    })).resolves.toBe("https://ekaro.in/amazon-link");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports EarnKaro API errors instead of treating the original URL as converted", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: 1, message: "Url not found in post!" }), { status: 400 })));

    await expect(engine.convertLink("https://www.amazon.in/dp/B000000001", { earnkaro_token: "configured" }))
      .rejects.toThrow("EarnKaro: Url not found in post!");
  });
});

describe("RSS product links", () => {
  it("extracts the retailer link from an RSS description anchor", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      `<rss version="2.0"><channel><item><guid>offer-1</guid><title>Camera offer</title><link>https://offers.example/story</link><description><![CDATA[<p>Deal details <a href="https://www.flipkart.com/camera/p/itm1">Shop now</a></p>]]></description></item></channel></rss>`,
      { status: 200, headers: { "content-type": "application/rss+xml" } },
    )));

    const [item] = await engine.fetchRss("https://offers.example/feed.xml");

    expect(item.links).toContain("https://www.flipkart.com/camera/p/itm1");
    expect(item.posted_at).toBeTruthy();
    const parsed = engine.parseItem(item.text, item.links, item.image, {});
    expect(parsed?.url).toBe("https://www.flipkart.com/camera/p/itm1");
  });
});

describe("combined Loot / Errors and Price Drop filter", () => {
  it("includes both categories without including unrelated deal categories", () => {
    expect(engine.matchesLootOrPriceDrop(["loot"])).toBe(true);
    expect(engine.matchesLootOrPriceDrop(["heavy_discount"])).toBe(true);
    expect(engine.matchesLootOrPriceDrop(["gold", "gift_card"])).toBe(false);
    expect(engine.LOOT_PRICE_DROP_CATEGORIES).toEqual(["loot", "heavy_discount"]);
  });
});

describe("payment offer extraction", () => {
  it("keeps eligible card offers but excludes EMI offers", () => {
    const offers = engine.extractOffers("₹1,200 off with HDFC Credit Card\nNo-cost EMI available for 6 months");

    expect(offers.some((offer) => offer.kind === "bank" && offer.label.includes("HDFC"))).toBe(true);
    expect(offers.some((offer) => /emi/i.test(offer.label))).toBe(false);
  });
});

describe("gold and silver deal classification", () => {
  it("requires a specific precious-metal product instead of the words gold or silver alone", () => {
    expect(engine.isGold("Gold offer today")).toBe(false);
    expect(engine.isGold("Silver savings available")).toBe(false);
    expect(engine.isGold("22K gold coin, 1 gram")).toBe(true);
    expect(engine.isGold("Gold card membership offer")).toBe(false);
    expect(engine.isGold("Tanishq special offer")).toBe(false);
    expect(engine.isGold("Buy silver earrings today")).toBe(true);
  });
});