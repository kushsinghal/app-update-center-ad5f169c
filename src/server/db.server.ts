// @ts-nocheck — MongoDB data layer with a small chainable query API (from().select().eq()...)
// so the deal engine's queries read the same as before. Collection names match the original app.
import { MongoClient } from "mongodb";

const COLLECTIONS: Record<string, string> = {
  post_logs: "logs",
  fetch_runs: "cron_runs",
  app_settings: "settings",
};
const UPSERT_KEYS: Record<string, string> = { ph_cache: "url", settings: "id", links: "code" };

let clientPromise: Promise<any> | null = null;

export async function mongo() {
  if (!clientPromise) {
    const uri = process.env["MONGODB_URI"];
    if (!uri) throw new Error("MONGODB_URI is not set");
    clientPromise = (async () => {
      const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
      await client.connect();
      const db = client.db(process.env["MONGODB_DB"] || undefined);
      await Promise.all([
        db.collection("seen").createIndex({ key: 1 }, { unique: true }),
        db.collection("deals").createIndex({ id: 1 }, { unique: true }),
        db.collection("deals").createIndex({ posted_at: -1 }),
        db.collection("deals").createIndex({ product_key: 1 }),
        db.collection("price_history").createIndex({ product_key: 1 }),
        db.collection("ph_cache").createIndex({ url: 1 }),
        db.collection("links").createIndex({ code: 1 }),
      ]).catch((e) => console.warn("index setup", e?.message));
      return db;
    })().catch((e) => {
      clientPromise = null;
      throw e;
    });
  }
  return clientPromise;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** SQL LIKE pattern → RegExp (% = any, _ = one char, \% and \_ literal). */
function likeRe(pattern: string, flags = "") {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "\\" && i + 1 < pattern.length) out += esc(pattern[++i]);
    else if (ch === "%" || ch === "*") out += ".*";
    else if (ch === "_") out += ".";
    else out += esc(ch);
  }
  return new RegExp(`^${out}$`, flags);
}

function coerce(v: string) {
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v.replace(/^"|"$/g, "");
}

function splitTop(s: string) {
  const parts: string[] = [];
  let depth = 0, cur = "", quoted = false;
  for (const ch of s) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && ch === "(") depth++;
    if (!quoted && ch === ")") depth--;
    if (!quoted && ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
  }
  if (cur) parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Parses the filter strings used with .or(): "a.eq.1,and(b.gte.x,c.ilike.*y*)". */
export function parseOr(expr: string): any[] {
  return splitTop(expr).map((part) => {
    const m = part.match(/^(and|or)\((.*)\)$/);
    if (m) return { [m[1] === "and" ? "$and" : "$or"]: parseOr(m[2]) };
    const [col, op, ...rest] = part.split(".");
    const raw = rest.join(".");
    switch (op) {
      case "eq": return { [col]: coerce(raw) };
      case "neq": return { [col]: { $ne: coerce(raw) } };
      case "gt": return { [col]: { $gt: coerce(raw) } };
      case "gte": return { [col]: { $gte: coerce(raw) } };
      case "lt": return { [col]: { $lt: coerce(raw) } };
      case "lte": return { [col]: { $lte: coerce(raw) } };
      case "is": return { [col]: coerce(raw) };
      case "like": return { [col]: likeRe(raw) };
      case "ilike": return { [col]: likeRe(raw, "i") };
      case "in": return { [col]: { $in: raw.replace(/^\(|\)$/g, "").split(",").map(coerce) } };
      default: throw new Error(`Unsupported filter: ${part}`);
    }
  });
}

const listArg = (v: any) => (Array.isArray(v) ? v : String(v).replace(/^\(|\)$/g, "").split(",").map((x) => coerce(x.trim())));

class Query {
  table: string;
  op = "select";
  conds: any[] = [];
  sortSpec: [string, 1 | -1][] = [];
  lim = 0;
  proj: any = { _id: 0 };
  countMode = false;
  head = false;
  returning = false;
  mode: "many" | "single" | "maybe" = "many";
  payload: any;

  constructor(table: string) {
    this.table = COLLECTIONS[table] || table;
  }

  select(cols = "*", opts: any = {}) {
    if (this.op !== "select") this.returning = true;
    if (cols && cols !== "*") {
      this.proj = { _id: 0 };
      for (const c of cols.split(",")) this.proj[c.trim()] = 1;
    }
    if (opts.count) this.countMode = true;
    if (opts.head) this.head = true;
    return this;
  }
  insert(row: any) { this.op = "insert"; this.payload = row; return this; }
  upsert(row: any) { this.op = "upsert"; this.payload = row; return this; }
  update(patch: any) { this.op = "update"; this.payload = patch; return this; }
  delete() { this.op = "delete"; return this; }

  eq(c: string, v: any) { this.conds.push({ [c]: v }); return this; }
  neq(c: string, v: any) { this.conds.push({ [c]: { $ne: v } }); return this; }
  gt(c: string, v: any) { this.conds.push({ [c]: { $gt: v } }); return this; }
  gte(c: string, v: any) { this.conds.push({ [c]: { $gte: v } }); return this; }
  lt(c: string, v: any) { this.conds.push({ [c]: { $lt: v } }); return this; }
  lte(c: string, v: any) { this.conds.push({ [c]: { $lte: v } }); return this; }
  in(c: string, v: any) { this.conds.push({ [c]: { $in: listArg(v) } }); return this; }
  is(c: string, v: any) { this.conds.push({ [c]: v }); return this; }
  like(c: string, p: string) { this.conds.push({ [c]: likeRe(p) }); return this; }
  ilike(c: string, p: string) { this.conds.push({ [c]: likeRe(p, "i") }); return this; }
  contains(c: string, arr: any[]) { this.conds.push({ [c]: { $all: arr } }); return this; }
  overlaps(c: string, arr: any[]) { this.conds.push({ [c]: { $in: arr } }); return this; }
  not(c: string, op: string, v: any) {
    if (op === "is") this.conds.push({ [c]: { $ne: v } });
    else if (op === "in") this.conds.push({ [c]: { $nin: listArg(v) } });
    else if (op === "eq") this.conds.push({ [c]: { $ne: v } });
    else throw new Error(`Unsupported not(${op})`);
    return this;
  }
  or(expr: string) { this.conds.push({ $or: parseOr(expr) }); return this; }
  order(c: string, opts: any = {}) { this.sortSpec.push([c, opts.ascending === false ? -1 : 1]); return this; }
  limit(n: number) { this.lim = n; return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }

  filter() {
    return this.conds.length ? { $and: this.conds } : {};
  }

  shape(rows: any[]) {
    if (this.mode === "many") return { data: rows, error: null };
    if (!rows.length) return this.mode === "single" ? { data: null, error: { message: "No rows found" } } : { data: null, error: null };
    return { data: rows[0], error: null };
  }

  async exec() {
    const db = await mongo();
    const col = db.collection(this.table);
    const f = this.filter();
    if (this.op === "select") {
      if (this.countMode) {
        const count = await col.countDocuments(f);
        if (this.head) return { data: null, count, error: null };
      }
      let cur = col.find(f, { projection: this.proj });
      if (this.sortSpec.length) cur = cur.sort(this.sortSpec);
      if (this.lim || this.mode !== "many") cur = cur.limit(this.mode === "many" ? this.lim : 1);
      const rows = await cur.toArray();
      return { ...this.shape(rows), count: this.countMode ? rows.length : null };
    }
    if (this.op === "insert") {
      const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((r) => ({ ...r }));
      try {
        await col.insertMany(rows.map((r) => ({ ...r })), { ordered: true });
      } catch (e) {
        return { data: null, error: { message: e?.message || "Insert failed", code: e?.code } };
      }
      return this.shape(rows);
    }
    if (this.op === "upsert") {
      const key = UPSERT_KEYS[this.table] || "id";
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
      for (const r of rows) await col.updateOne({ [key]: r[key] }, { $set: r }, { upsert: true });
      return this.shape(rows);
    }
    if (this.op === "update") {
      const hits = this.returning ? await col.find(f, { projection: { _id: 1 } }).toArray() : null;
      await col.updateMany(hits ? { _id: { $in: hits.map((h) => h._id) } } : f, { $set: this.payload });
      if (!hits) return { data: null, error: null };
      const rows = await col.find({ _id: { $in: hits.map((h) => h._id) } }, { projection: this.proj }).toArray();
      return this.shape(rows);
    }
    if (this.op === "delete") {
      const rows = this.returning ? await col.find(f, { projection: this.proj }).toArray() : [];
      await col.deleteMany(f);
      return this.returning ? this.shape(rows) : { data: null, error: null };
    }
    throw new Error(`Unknown op ${this.op}`);
  }

  then(resolve: any, reject: any) {
    return this.exec().then(resolve, reject);
  }
}

export const db = {
  from: (table: string) => new Query(table),
};
