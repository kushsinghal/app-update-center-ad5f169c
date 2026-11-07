export const TOKEN_KEY = "dealloot-admin-token";
export const getToken = () => (typeof window === "undefined" ? null : window.localStorage.getItem(TOKEN_KEY));

type Res<T = any> = { data: T };

async function request<T = any>(method: string, path: string, body?: unknown, opts?: { params?: Record<string, any> }): Promise<Res<T>> {
  const qs = opts?.params
    ? "?" + new URLSearchParams(Object.entries(opts.params).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => [k, String(v)])).toString()
    : "";
  const [p, inlineQs] = path.split("?");
  const url = `/api/public${p}${qs || (inlineQs ? `?${inlineQs}` : "")}`;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : null });
  const text = await r.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { detail: text };
  }
  if (r.status === 401 && token && typeof window !== "undefined") {
    window.localStorage.removeItem(TOKEN_KEY);
    window.dispatchEvent(new Event("dealloot-auth"));
  }
  if (!r.ok) {
    const err: any = new Error(json?.detail || `Request failed (${r.status})`);
    err.response = { status: r.status, data: json };
    throw err;
  }
  return { data: json as T };
}

/** Small axios-style client for the app's API. */
export const api = {
  get: <T = any>(path: string, opts?: { params?: Record<string, any> }) => request<T>("GET", path, undefined, opts),
  post: <T = any>(path: string, body?: unknown, opts?: { params?: Record<string, any> }) => request<T>("POST", path, body ?? {}, opts),
  put: <T = any>(path: string, body?: unknown) => request<T>("PUT", path, body ?? {}),
  delete: <T = any>(path: string) => request<T>("DELETE", path),
};

export const inr = (v: any) => (v || v === 0 ? `₹${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : null);

export const CATS: Record<string, { label: string; short: string; color: string; cls: string }> = {
  supercoin_100: { label: "100% SuperCoin", short: "SuperCoin", color: "#8B5CF6", cls: "bg-purple-50 border-purple-300 text-purple-700" },
  gift_card: { label: "Gift Cards", short: "Gift Card", color: "#06B6D4", cls: "bg-cyan-50 border-cyan-300 text-cyan-700" },
  heavy_discount: { label: "Price Drop", short: "Price Drop", color: "#10B981", cls: "bg-emerald-50 border-emerald-300 text-emerald-700" },
  loot: { label: "Loot / Price Error", short: "Loot", color: "#F43F5E", cls: "bg-rose-50 border-rose-300 text-rose-700" },
  gold: { label: "Gold & Silver", short: "Gold", color: "#D4A017", cls: "bg-amber-50 border-amber-400 text-amber-800" },
};

export const errMsg = (e: any) => e?.response?.data?.detail || e?.message || "Something went wrong";

export const timeAgo = (iso?: string | null) => {
  if (!iso) return "never";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
