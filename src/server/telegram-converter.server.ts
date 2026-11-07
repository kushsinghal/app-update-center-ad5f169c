import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { mongo } from "./db.server";
import { getSettings } from "./core.server";
import { convertAffiliateText } from "./affiliate.server";

const tokenSchema = z.string().regex(/^\d{5,20}:[A-Za-z0-9_-]{20,100}$/, "Enter the bot token from BotFather");
const entity = z.object({ type: z.string().max(40), offset: z.number().int().min(0), length: z.number().int().min(0), url: z.string().url().max(4096).optional() }).passthrough();
const messageSchema = z.object({ message_id: z.number().int(), chat: z.object({ id: z.number().int(), type: z.enum(["private", "group", "supergroup", "channel"]) }), from: z.object({ is_bot: z.boolean().optional() }).passthrough().optional(), text: z.string().max(4096).optional(), caption: z.string().max(1024).optional(), entities: z.array(entity).max(100).optional(), caption_entities: z.array(entity).max(100).optional() }).passthrough();
const updateSchema = z.object({ update_id: z.number().int().min(0), message: messageSchema.optional(), channel_post: messageSchema.optional() }).passthrough();

function sign(value: string) {
  const key = process.env["SESSION_SECRET"];
  if (!key) throw new Error("SESSION_SECRET is not set");
  return createHmac("sha256", key).update(value).digest("hex");
}
function equal(a: string, b: string) {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
export const webhookSecret = (token: string) => sign(`telegram-converter:${token}`);
export function pairingCode(token: string) {
  const expiry = Date.now() + 15 * 60_000;
  return `${expiry}_${sign(`telegram-pair:${token}:${expiry}`)}`;
}
export function validPairing(code: string, token: string) {
  const match = code.match(/^(\d{13})_([a-f0-9]{64})$/);
  return !!match && Number(match[1]) > Date.now() && equal(match[2], sign(`telegram-pair:${token}:${match[1]}`));
}

export async function telegramCall(token: string, method: string, body: Record<string, unknown>) {
  tokenSchema.parse(token);
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new Error("Telegram could not be reached. Try again.");
  }
  const raw = await response.text();
  let data: any;
  try { data = JSON.parse(raw); } catch { throw new Error(`Telegram returned an invalid response (${response.status})`); }
  if (!response.ok || !data.ok) {
    const detail = String(data.description || "Request failed").replaceAll(token, "[redacted]");
    console.error("Telegram converter request failed", response.status, detail);
    throw new Error(`Telegram (${response.status}): ${detail}`);
  }
  return data.result;
}

export async function connectConverter(origin: string) {
  const settings = await getSettings();
  const token = tokenSchema.parse(settings.telegram_converter_token);
  const url = new URL(origin);
  if (url.protocol !== "https:") throw new Error("Use your HTTPS Render address to connect Telegram");
  const bot = await telegramCall(token, "getMe", {});
  await telegramCall(token, "setWebhook", { url: `${url.origin}/api/public/telegram/converter`, secret_token: webhookSecret(token), allowed_updates: ["message", "channel_post"], drop_pending_updates: false });
  const db = await mongo();
  await db.collection("settings").updateOne({ id: "main" }, { $set: { telegram_converter_username: bot.username, telegram_converter_url: url.origin, telegram_converter_connected: true } });
  return { username: bot.username, pairing_code: pairingCode(token), webhook_url: `${url.origin}/api/public/telegram/converter` };
}

export async function converterStatus() {
  const settings = await getSettings();
  if (!settings.telegram_converter_token) return { connected: false, chats: [] };
  const info = await telegramCall(settings.telegram_converter_token, "getWebhookInfo", {});
  const db = await mongo();
  const chats = await db.collection("telegram_converter_chats").find({ bot: settings.telegram_converter_token.split(":")[0] }, { projection: { _id: 0, chat_id: 1, type: 1 } }).toArray();
  return { connected: !!info.url, webhook_url: info.url, pending: info.pending_update_count, error: info.last_error_message || null, chats, pairing_code: pairingCode(settings.telegram_converter_token) };
}

export async function disconnectConverter() {
  const settings = await getSettings();
  if (settings.telegram_converter_token) await telegramCall(settings.telegram_converter_token, "deleteWebhook", {});
  const db = await mongo();
  await db.collection("settings").updateOne({ id: "main" }, { $set: { telegram_converter_connected: false } });
  return { connected: false };
}

export async function receiveConverter(request: Request, body: unknown) {
  const settings = await getSettings();
  const token = settings.telegram_converter_token;
  if (!token || !equal(request.headers.get("x-telegram-bot-api-secret-token") || "", webhookSecret(token))) return Response.json({ detail: "Unauthorized" }, { status: 401 });
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ detail: "Invalid Telegram update" }, { status: 400 });
  const update = parsed.data;
  const msg = update.message || update.channel_post;
  if (!msg || msg.from?.is_bot) return Response.json({ ok: true });
  const text = msg.text ?? msg.caption ?? "";
  const bot = token.split(":")[0];
  const db = await mongo();
  const chats = db.collection("telegram_converter_chats");
  const chatKey = `${bot}:${msg.chat.id}`;
  const pair = text.match(/^\/(?:start|connect)(?:@\w+)?\s+(\S+)$/);
  if (pair && validPairing(pair[1], token)) {
    await chats.updateOne({ _id: chatKey }, { $set: { bot, chat_id: String(msg.chat.id), type: msg.chat.type } }, { upsert: true });
    await telegramCall(token, "sendMessage", { chat_id: msg.chat.id, text: "Connected. Send your links or deal text here." });
    return Response.json({ ok: true });
  }
  // Unknown chats cannot use the owner's paid affiliate credentials.
  if (!await chats.findOne({ _id: chatKey })) return Response.json({ ok: true });
  const updates = db.collection("telegram_converter_updates");
  const key = `${bot}:${update.update_id}`;
  const existing = await updates.findOne({ _id: key });
  if (existing?.done) return Response.json({ ok: true });
  if (existing?.locked_until > Date.now()) return Response.json({ detail: "Processing" }, { status: 503 });
  try {
    if (!existing) await updates.insertOne({ _id: key, locked_until: Date.now() + 300_000 });
    else {
      const claim = await updates.updateOne({ _id: key, done: { $ne: true }, locked_until: { $lte: Date.now() } }, { $set: { locked_until: Date.now() + 300_000 } });
      if (!claim.modifiedCount) return Response.json({ detail: "Processing" }, { status: 503 });
    }
  } catch (error: any) {
    if (error?.code === 11000) return Response.json({ detail: "Processing" }, { status: 503 });
    throw error;
  }
  try {
    const result = await convertAffiliateText(text, settings, msg.entities || msg.caption_entities || []);
    if (result.items.length) {
      // Do not label a failed conversion as an earning link or modify the channel post on failure.
      if (result.items.some((i) => i.error)) {
        if (msg.chat.type !== "channel") await telegramCall(token, "sendMessage", { chat_id: msg.chat.id, text: `Conversion failed: ${result.items.filter((i) => i.error).map((i) => i.error).join("; ").slice(0, 3500)}` });
        else throw new Error("Affiliate conversion failed; original channel post kept");
      } else if (msg.chat.type === "channel") {
        if (result.message !== text || result.entities.some((e, i) => e.url !== (msg.entities || msg.caption_entities || [])[i]?.url)) {
          await telegramCall(token, msg.text !== undefined ? "editMessageText" : "editMessageCaption", { chat_id: msg.chat.id, message_id: msg.message_id,
            ...(msg.text !== undefined ? { text: result.message, entities: result.entities } : { caption: result.message, caption_entities: result.entities }) });
        }
      } else {
        if (result.message.length > 4096) throw new Error("Converted message is too long for Telegram; send fewer links in one message");
        await telegramCall(token, "sendMessage", { chat_id: msg.chat.id, text: result.message, entities: result.entities, reply_parameters: { message_id: msg.message_id } });
      }
    }
    await updates.updateOne({ _id: key }, { $set: { done: true, finished_at: new Date() } });
    return Response.json({ ok: true });
  } catch (error) {
    await updates.updateOne({ _id: key }, { $set: { locked_until: 0 } });
    throw error;
  }
}