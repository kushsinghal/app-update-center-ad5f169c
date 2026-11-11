import { describe, expect, it, beforeEach } from "vitest";
import { parseOr } from "@/server/db.server";
import { login, verifyAdminToken, verifyCronRequest } from "@/server/auth.server";

describe("deal list filters translate to MongoDB", () => {
  it("featured-or-recent filter", () => {
    expect(parseOr("posted_at.gte.2026-01-01T00:00:00.000Z,featured.eq.true")).toEqual([
      { posted_at: { $gte: "2026-01-01T00:00:00.000Z" } },
      { featured: true },
    ]);
  });
  it("nested and() with numeric score", () => {
    expect(parseOr("featured.eq.true,and(posted_at.gte.x,score.gte.100)")).toEqual([
      { featured: true },
      { $and: [{ posted_at: { $gte: "x" } }, { score: { $gte: 100 } }] },
    ]);
  });
  it("text search is case-insensitive contains", () => {
    const [t] = parseOr("title.ilike.*boAt*,store.ilike.*boAt*") as any[];
    expect(t.title.test("New BOAT earbuds")).toBe(true);
    expect(t.title.test("Samsung")).toBe(false);
  });
});

describe("admin password", () => {
  beforeEach(() => {
    process.env["ADMIN_PASSWORD"] = "secret-pass";
    process.env["SESSION_SECRET"] = "x".repeat(40);
    process.env["CRON_SECRET"] = "cron-123";
  });
  it("wrong password gives no token", () => {
    expect(login("nope")).toBeNull();
  });
  it("right password gives a token that verifies", () => {
    const t = login("secret-pass")!;
    expect(verifyAdminToken(t)).toBe(true);
    expect(verifyAdminToken(t.replace(/.$/, (c) => (c === "a" ? "b" : "a")))).toBe(false);
  });
  it("expired token is rejected", () => {
    expect(verifyAdminToken(`${Date.now() - 1000}.abc`)).toBe(false);
  });
  it("scheduled scan needs the cron secret", () => {
    const ok = new Request("http://x/api/public/cron/fetch", { method: "POST", headers: { Authorization: "Bearer cron-123" } });
    const bad = new Request("http://x/api/public/cron/fetch", { method: "POST", headers: { Authorization: "Bearer other" } });
    const external = new Request("http://x/api/public/cron/fetch?key=cron-123", { method: "GET" });
    expect(verifyCronRequest(ok)).toBe(true);
    expect(verifyCronRequest(external)).toBe(true);
    expect(verifyCronRequest(bad)).toBe(false);
  });
});
