import { afterEach, describe, expect, it, vi } from "vitest";
import { convertAffiliateText } from "@/server/affiliate.server";
import { adminSettingsView } from "@/server/core.server";
import { pairingCode, validPairing, receiveConverter, webhookSecret } from "@/server/telegram-converter.server";

const state = vi.hoisted(() => ({ paired: false, done: false, sends: [] as any[] }));
vi.mock("@/server/db.server", () => ({ mongo: async () => ({ collection: (name: string) => ({
  findOne: async () => name === "telegram_converter_chats" ? state.paired ? {} : null : state.done ? { done: true } : null,
  insertOne: async () => ({}),
  updateOne: async (_filter: any, patch: any) => { if (patch.$set?.done) state.done = true; return { modifiedCount: 1 }; },
}) }), db: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "main", telegram_converter_token: "123456:" + "a".repeat(30), sankmo_token: "configured", earnkaro_token: "configured" }, error: null }) }) }) }) } }));

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); state.paired = false; state.done = false; state.sends = []; });
const token = "123456:" + "a".repeat(30);
function mockProviders() {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("sankmo.in")) return Response.json({ convertedText: "" });
    if (url.includes("ekaro-api")) {
      const body = JSON.parse(String(init?.body));
      expect(body.deal).not.toContain("affid=");
      expect(body.deal).not.toContain("tag=");
      return Response.json({ success: 1, data: "https://ekaro.in/mine" });
    }
    state.sends.push({ url, body: JSON.parse(String(init?.body)) });
    return Response.json({ ok: true, result: {} });
  }));
}

describe("Telegram affiliate conversion", () => {
  it("preserves original text, punctuation, spaces and repeated URLs while cleaning tracking before fallback", async () => {
    mockProviders();
    const url = "https://www.flipkart.com/item/p/itm123?affid=someone";
    const text = `  🎁 Deal ₹399!\n${url},\nAgain ${url}.  `;
    const result = await convertAffiliateText(text, { sankmo_token: "configured", earnkaro_token: "configured" });
    expect(result.message).toBe("  🎁 Deal ₹399!\n@Flipkart,\nAgain @Flipkart.  ");
    expect(result.entities).toEqual([
      { type: "text_link", offset: 16, length: 9, url: "https://ekaro.in/mine" },
      { type: "text_link", offset: 33, length: 9, url: "https://ekaro.in/mine" },
    ]);
    expect(result.items[0]?.cleaned).toBe("https://www.flipkart.com/item/p/itm123");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("routes Amazon directly to EarnKaro and keeps hidden link text and bold entity offsets", async () => {
    mockProviders();
    const text = "🎁 Shop now";
    const result = await convertAffiliateText(text, { earnkaro_token: "configured", affiliate_routes: { Amazon: "sankmo" } }, [{ type: "text_link", offset: 3, length: 8, url: "https://www.amazon.in/dp/B000000001?tag=other-21" }, { type: "bold", offset: 3, length: 8 }]);
    expect(result.message).toBe(text);
    expect(result.entities[0]).toEqual({ type: "text_link", offset: 3, length: 8, url: "https://ekaro.in/mine" });
    expect(result.entities[1]).toEqual({ type: "bold", offset: 3, length: 8 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("adjusts formatting offsets after visible URLs change length", async () => {
    mockProviders();
    const url = "https://www.amazon.in/dp/B000000001";
    const result = await convertAffiliateText(`${url} 🎉 End`, { earnkaro_token: "configured" }, [{ type: "url", offset: 0, length: url.length }, { type: "bold", offset: url.length + 4, length: 3 }]);
    expect(result.message).toBe("@Amazon 🎉 End");
    expect(result.entities).toContainEqual({ type: "text_link", offset: 0, length: 7, url: "https://ekaro.in/mine" });
    expect(result.entities).toContainEqual(expect.objectContaining({ type: "bold", offset: 11, length: 3 }));
  });
  it("never exposes bot tokens in settings", () => {
    const view = adminSettingsView({ telegram_converter_token: token });
    expect(view.telegram_converter_token).toBeUndefined();
    expect(view.telegram_converter_token_masked).not.toContain(token);
  });
  it("requires a signed unexpired pairing command", () => {
    vi.stubEnv("SESSION_SECRET", "test-session-signing-secret-for-telegram");
    const code = pairingCode(token);
    expect(validPairing(code, token)).toBe(true);
    expect(validPairing(code, token + "x")).toBe(false);
    expect(validPairing("0_" + code.split("_")[1], token)).toBe(false);
  });
  it("rejects unsigned webhooks and ignores unpaired chats before provider calls", async () => {
    vi.stubEnv("SESSION_SECRET", "test-session-signing-secret-for-telegram");
    mockProviders();
    const body = { update_id: 1, message: { message_id: 2, chat: { id: 3, type: "private" }, text: "https://www.amazon.in/dp/B000000001" } };
    const bad = await receiveConverter(new Request("https://app.test"), body);
    expect(bad.status).toBe(401);
    const good = await receiveConverter(new Request("https://app.test", { headers: { "x-telegram-bot-api-secret-token": webhookSecret(token) } }), body);
    expect(good.status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("replies to paired direct chats and deduplicates Telegram retries", async () => {
    vi.stubEnv("SESSION_SECRET", "test-session-signing-secret-for-telegram");
    mockProviders(); state.paired = true;
    const body = { update_id: 1, message: { message_id: 2, chat: { id: 3, type: "private" }, text: "Deal! https://www.flipkart.com/item/p/itm123?affid=other" } };
    const request = new Request("https://app.test", { headers: { "x-telegram-bot-api-secret-token": webhookSecret(token) } });
    expect((await receiveConverter(request, body)).status).toBe(200);
    expect(state.sends[0].body.text).toBe("Deal! @Flipkart");
    expect(state.sends[0].body.entities).toEqual([{ type: "text_link", offset: 6, length: 9, url: "https://ekaro.in/mine" }]);
    expect((await receiveConverter(request, body)).status).toBe(200);
    expect(state.sends).toHaveLength(1);
  });
  it("edits paired channel posts in place instead of reposting", async () => {
    vi.stubEnv("SESSION_SECRET", "test-session-signing-secret-for-telegram");
    mockProviders(); state.paired = true;
    const body = { update_id: 1, channel_post: { message_id: 2, chat: { id: -100123, type: "channel" }, caption: "Offer https://www.amazon.in/dp/B000000001" } };
    const request = new Request("https://app.test", { headers: { "x-telegram-bot-api-secret-token": webhookSecret(token) } });
    expect((await receiveConverter(request, body)).status).toBe(200);
    expect(state.sends[0].url).toContain("/editMessageCaption");
    expect(state.sends[0].body).toMatchObject({ chat_id: -100123, message_id: 2, caption: "Offer @Amazon", caption_entities: [{ type: "text_link", offset: 6, length: 7, url: "https://ekaro.in/mine" }] });
  });
  it("does not re-wrap links that already use the owner's affiliate account", async () => {
    mockProviders();
    const result = await convertAffiliateText("Grab https://ekaro.in/abc now", { earnkaro_token: "configured" });
    expect(fetch).not.toHaveBeenCalled();
    expect(result.message).toBe("Grab @Link now");
    expect(result.entities).toEqual([{ type: "text_link", offset: 5, length: 5, url: "https://ekaro.in/abc" }]);
  });
  it("keeps a failed link as plain text without an earning label", async () => {
    mockProviders();
    const url = "https://www.flipkart.com/item/p/itm123";
    const result = await convertAffiliateText(`Deal ${url}`, { sankmo_token: "", earnkaro_token: "" });
    expect(result.items[0]?.error).toBeTruthy();
    expect(result.message).toBe(`Deal ${url}`);
    expect(result.entities).toEqual([]);
  });
});