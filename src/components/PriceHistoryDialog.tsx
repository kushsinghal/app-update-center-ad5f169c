// @ts-nocheck — ported from the original app
import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { ExternalLink, Trophy } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, inr } from "@/lib/api";

const COLORS = ["#D97706", "#0891B2", "#E11D48", "#059669", "#7C3AED", "#EA580C"];
const RANGES = [["15D", 15], ["1M", 30], ["3M", 90], ["6M", 180], ["1Y", 365], ["All", 0]];
const day = (t) => new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });

const Stat = ({ label, value, testid }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-3">
    <p className="text-[11px] text-slate-500">{label}</p>
    <p data-testid={testid} className="font-display text-lg font-bold">{inr(value) || "–"}</p>
  </div>
);

const Chart = ({ series }) => (
  <ResponsiveContainer width="100%" height="100%">
    <LineChart>
      <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
      <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={day} tick={{ fill: "#6B7280", fontSize: 10 }} allowDuplicatedCategory={false} />
      <YAxis tick={{ fill: "#6B7280", fontSize: 10 }} width={55} tickFormatter={(v) => `₹${v}`} />
      <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #cbd5e1" }} labelFormatter={day} formatter={(v, n) => [inr(v), n]} />
      <Legend wrapperStyle={{ fontSize: 11 }} />
      {series.map((s, i) => (
        <Line key={s.store} data={s.data} dataKey="y" name={s.store} type="stepAfter" stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={s.data.length < 25} />
      ))}
    </LineChart>
  </ResponsiveContainer>
);

export const PriceHistoryDialog = ({ deal, open, onOpenChange }) => {
  const [data, setData] = useState(null);
  const [range, setRange] = useState(90);
  useEffect(() => {
    if (!open) return;
    setData(null);
    api.get(`/price-history/${deal.id}`).then((r) => setData(r.data)).catch(() => setData({ stores: [], compare: [] }));
  }, [open, deal.id]);

  const series = useMemo(() => {
    const from = range ? Date.now() - range * 86400000 : 0;
    return (data?.stores || []).map((s) => {
      const all = s.points.map((p) => ({ t: new Date(p.x).getTime(), y: p.y }));
      let pts = all.filter((p) => p.t >= from);
      const before = all.filter((p) => p.t < from).pop();
      if (before && range) pts = [{ t: from, y: before.y }, ...pts];
      if (pts.length) pts.push({ t: Date.now(), y: pts[pts.length - 1].y });
      return { store: s.store, data: pts };
    }).filter((s) => s.data.length);
  }, [data, range]);

  const best = data?.best;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="price-history-dialog" className="max-h-[92vh] max-w-3xl overflow-y-auto border-slate-200 bg-white text-slate-900">
        <DialogHeader>
          <DialogTitle className="pr-6 text-base leading-snug">{deal.title}</DialogTitle>
          <DialogDescription className="text-xs text-slate-500">Full store price history (from pricehistory.app) plus prices seen in deal channels</DialogDescription>
        </DialogHeader>
        {!data ? <p data-testid="price-history-loading" className="py-10 text-center font-mono text-sm text-slate-500">Loading price history…</p> : (
          <>
            <div className="grid grid-cols-3 gap-3 text-center">
              <Stat label="Deal price" value={deal.price} testid="price-now" />
              <Stat label="Lowest ever" value={data.lowest} testid="price-lowest" />
              <Stat label="Highest" value={data.highest} testid="price-highest" />
            </div>
            {best && (
              <a href={best.url} target="_blank" rel="noopener noreferrer" data-testid="best-price-store-link"
                className="flex items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3 transition-colors hover:bg-emerald-100">
                <span className="flex items-center gap-2 text-sm"><Trophy className="h-4 w-4 text-emerald-700" /> Best price now: <b>{best.store}</b> at <b>{inr(best.current)}</b></span>
                <span className="flex items-center gap-1 text-xs font-bold text-emerald-700">Go to store <ExternalLink className="h-3 w-3" /></span>
              </a>
            )}
            <div className="flex flex-wrap gap-1.5">
              {RANGES.map(([l, d]) => (
                <button key={l} data-testid={`range-${l.toLowerCase()}`} onClick={() => setRange(d)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${range === d ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700 hover:text-slate-950"}`}>{l}</button>
              ))}
            </div>
            <div className="h-64">
              {series.length ? <Chart series={series} /> : (
                <p data-testid="price-history-empty" className="grid h-full place-items-center text-center text-sm text-slate-500">
                  No price history found for this product{range ? " in this time range" : ""}. Search-page or app-only links can't be tracked.
                </p>
              )}
            </div>
            {data.stores?.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {data.stores.map((s, i) => (
                  <div key={s.store} data-testid={`store-history-${i}`} className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
                    <p className="mb-1 flex items-center gap-2 font-semibold"><span className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{s.store}</p>
                    <p className="text-slate-600">Now {inr(s.current) || "–"} · Low {inr(s.lowest) || "–"} · High {inr(s.highest) || "–"}{s.average ? ` · Avg ${inr(s.average)}` : ""}</p>
                  </div>
                ))}
              </div>
            )}
            <div>
              <p className="mb-2 text-xs text-slate-600">Check this product on other stores</p>
              <div className="flex flex-wrap gap-2">
                {(data.compare || []).map((c) => (
                  <a key={c.name} href={c.url} target="_blank" rel="noopener noreferrer" data-testid={`compare-${c.name.toLowerCase().replace(/\s/g, "-")}`}
                    className="flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-800 transition-colors hover:bg-slate-200">
                    {c.name} <ExternalLink className="h-3 w-3" />
                  </a>
                ))}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
