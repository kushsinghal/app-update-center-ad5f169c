// Single-password admin access: login returns a signed, expiring token the browser sends as a Bearer header.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_DAYS = 30;

const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();
const same = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

function secret() {
  const s = process.env["SESSION_SECRET"];
  if (!s || s.length < 16) throw new Error("SESSION_SECRET is not set");
  return s;
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function login(password: string): string | null {
  const expected = process.env["ADMIN_PASSWORD"];
  if (!expected) throw new Error("ADMIN_PASSWORD is not set");
  if (!password || !same(password, expected)) return null;
  const exp = String(Date.now() + TOKEN_DAYS * 86400e3);
  return `${exp}.${sign(exp)}`;
}

export function verifyAdminToken(token: string): boolean {
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  return same(sig, sign(exp));
}

/** Scheduled scans (Render Cron Job) send CRON_SECRET as a Bearer token or x-cron-secret header. */
export function verifyCronRequest(request: Request): boolean {
  const expected = process.env["CRON_SECRET"];
  if (!expected) return false;
  const given = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") || request.headers.get("x-cron-secret") || "";
  return !!given && same(given, expected);
}
