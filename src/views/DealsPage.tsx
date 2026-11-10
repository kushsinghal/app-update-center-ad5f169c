// @ts-nocheck — ported from the original app
import { useEffect, useState } from "react";
import { Search, Coins, Gift, Siren, Radio, Trophy, Star, TrendingDown, RefreshCw, Gem } from "lucide-react";
import { toast } from "sonner";
import { api, CATS, timeAgo } from "@/lib/api";
import { DealCard } from "@/components/DealCard";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const FILTERS = [
  { key: "best", label: "Best Deals", icon: Trophy, testid: "category-filter-best" },
  { key: "all", label: "All Deals", icon: Radio, testid: "category-filter-all" },
  { key: "supercoin_100", label: "100% SuperCoin", icon: Coins, testid: "category-filter-supercoin" },
  { key: "gift_card", label: "Gift Cards", icon: Gift, testid: "category-filter-giftcards" },
  { key: "loot_price_drop", label: "Loot / Errors & Price Drop", icon: Siren, testid: "category-filter-loot-price-drop" },
  { key: "gold", label: "Gold & Silver", icon: Gem, testid: "category-filter-gold" },
  { key: "lowest", label: "Lowest Price Ever", icon: TrendingDown, testid: "category-filter-lowest" },
  { key: "starred", label: "Starred", icon: Star, testid: "category-filter-starred" },
];

const STAT_CATEGORIES = [
  ...Object.entries(CATS).filter(([key]) => key !== "loot" && key !== "heavy_discount"),
  ["loot_price_drop", { ...CATS.loot, short: "Loot / Errors & Price Drop" }],
];

const Hero = ({ stats, scan, scanning }) => {
  const every = stats ? (stats.check_interval_seconds < 60 ? `${stats.check_interval_seconds} sec` : `${Math.round(stats.check_interval_seconds / 60)} min`) : "…";
  return (
    <section className="rise relative overflow-hidden rounded-[2rem] bg-slate-900 p-8 text-white sm:p-12">
      <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[#FF5A1F]/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-amber-400/20 blur-3xl" />
      <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p data-testid="scan-every-label" className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.25em] text-slate-300">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" /></span>
            Live · scans every {every}
          </p>
          <h1 className="mt-5 text-4xl font-black leading-[1.03] tracking-tight sm:text-5xl lg:text-6xl">
            Fresh loot,<br />found <span className="text-[#FF8A4C]">for you.</span>
          </h1>
          <p data-testid="last-scan-status" className="mt-5 font-mono text-xs text-slate-300 sm:text-sm">
            Last scan {timeAgo(stats?.last_scan_at)} · {stats?.fresh_3h ?? "–"} fresh deal{stats?.fresh_3h === 1 ? "" : "s"} in the last {stats ? (stats.fresh_window_minutes >= 60 ? `${+(stats.fresh_window_minutes / 60).toFixed(1)}h` : `${stats.fresh_window_minutes} min`) : "…"} · newest deal posted {timeAgo(stats?.latest_deal_at)} · website shows deals from the last {stats?.website_max_age_hours ?? "…"}h
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {STAT_CATEGORIES.map(([k, c]) => (
              <span key={k} data-testid={`stat-${k}`} className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold backdrop-blur">
                <span className="h-2 w-2 rounded-full" style={{ background: c.color }} /> {stats?.[k] ?? "–"} {c.short}
              </span>
            ))}
          </div>
        </div>
        <button data-testid="scan-refresh-button" onClick={scan} disabled={scanning} aria-label="Scan for new deals"
          className="flex shrink-0 items-center justify-center gap-3 self-start rounded-full bg-[#FF5A1F] px-7 py-4 text-base font-bold text-white shadow-[0_12px_30px_-10px_rgba(255,90,31,0.8)] transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-[#ff6d38] disabled:opacity-70 lg:self-auto">
          <RefreshCw className={`h-5 w-5 ${scanning ? "animate-spin" : ""}`} /> {scanning ? "Scanning…" : "Scan now"}
        </button>
      </div>
    </section>
  );
};

export default function DealsPage() {
  const [deals, setDeals] = useState([]);
  const [stats, setStats] = useState(null);
  const [cat, setCat] = useState("best");
  const [minOff, setMinOff] = useState(70);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("latest");
  const params = () => ({ category: cat, q: q || undefined, sort });
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    api.get("/stats").then((r) => setStats(r.data));
    api.get("/public-settings").then((r) => setMinOff(r.data.product_min));
    const i = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    if (tick) {
      api.get("/deals", { params: params() }).then((r) => setDeals(r.data));
      api.get("/stats").then((r) => setStats(r.data));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const reload = () => api.get("/deals", { params: params() }).then((r) => setDeals(r.data));
  const [scanning, setScanning] = useState(false);
  const scan = async () => {
    setScanning(true);
    const before = deals.length;
    try {
      await api.post("/fetch-all");
      toast.success("Scanning all sources for new deals…");
      await new Promise((r) => setTimeout(r, 12000));
      const { data } = await api.get("/deals", { params: params() });
      setDeals(data);
      api.get("/stats").then((r) => setStats(r.data));
      toast.success(data.length > before ? `${data.length - before} new deal(s) found` : "Deals are up to date");
    } catch { toast.error("Scan failed, try again"); } finally { setScanning(false); }
  };

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      api.get("/deals", { params: params() })
        .then((r) => setDeals(r.data))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, q, sort]);

  return (
    <main className="mx-auto max-w-7xl space-y-10 px-4 py-8 sm:px-8 sm:py-12">
      <Hero stats={stats} scan={scan} scanning={scanning} />
      <div className="sticky top-[61px] z-40 -mx-4 space-y-3 border-b border-slate-200 bg-[#F5F2EA]/90 px-4 py-3 backdrop-blur-xl sm:-mx-8 sm:px-8">
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {FILTERS.map(({ key, label, icon: Icon, testid }) => (
            <button key={key} data-testid={testid} onClick={() => setCat(key)}
              className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                cat === key ? "bg-slate-900 text-white shadow-md" : "border border-slate-200 bg-white text-slate-700 hover:border-[#FF5A1F] hover:text-[#FF5A1F]"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input data-testid="deal-search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search deals…"
              className="h-11 rounded-xl border border-slate-200 bg-white pl-9 text-slate-900" />
          </div>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger data-testid="deal-sort-select" className="h-11 w-32 rounded-xl border border-slate-200 bg-white sm:w-40"><SelectValue /></SelectTrigger>
            <SelectContent className="border-slate-200 bg-white text-slate-900">
              <SelectItem value="latest">Latest</SelectItem>
              <SelectItem value="starred">Starred first</SelectItem>
              <SelectItem value="discount">Biggest off</SelectItem>
              <SelectItem value="price">Lowest price</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {loading ? (
        <p data-testid="deals-loading" className="font-mono text-sm text-slate-500">Scanning drops…</p>
      ) : deals.length === 0 ? (
        <p data-testid="deals-empty" className="py-16 text-center text-slate-600">
          {cat === "lowest" ? "No lowest-ever prices yet. Products get this badge when they show up again at their lowest price seen." : cat === "starred" ? "No starred deals yet. Tap the star on any deal." : "No deals here yet. New drops land on every update."}
        </p>
      ) : (
        <div data-testid="deals-grid" className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {deals.map((d, i) => <DealCard key={d.id} deal={d} index={i} onChange={cat === "starred" || cat === "best" || sort === "starred" ? reload : undefined} />)}
        </div>
      )}
    </main>
  );
}
