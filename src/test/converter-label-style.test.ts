import { describe, expect, it, vi } from "vitest";
import { convertAffiliateText } from "@/server/affiliate.server";

vi.mock("@/server/engine.server", async (load) => {
  const engine = await load<typeof import("@/server/engine.server")>();
  return { ...engine, cleanLink: async (url: string) => url.split("?")[0],
    convertLink: async () => "https://ekaro.in/my-deal" };
});

const text = "Deal https://www.flipkart.com/item/p/itm1?pid=A1 now";

describe("Bot reply label style", () => {
  it("shows store labels by default", async () => {
    const result = await convertAffiliateText(text, { earnkaro_token: "configured" });
    expect(result.message).toBe("Deal @Flipkart now");
    expect(result.entities).toContainEqual({ type: "text_link", offset: 5, length: 9, url: "https://ekaro.in/my-deal" });
  });
  it("shows the converted link as clickable text when link style is chosen", async () => {
    const result = await convertAffiliateText(text, { earnkaro_token: "configured", converter_label_style: "link" });
    expect(result.message).toBe("Deal https://ekaro.in/my-deal now");
    expect(result.entities).toContainEqual({ type: "text_link", offset: 5, length: "https://ekaro.in/my-deal".length, url: "https://ekaro.in/my-deal" });
  });
});
