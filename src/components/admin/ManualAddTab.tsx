// @ts-nocheck — ported from the original app
import { useState } from "react";
import { toast } from "sonner";
import { Wand2 } from "lucide-react";
import { api, errMsg, CATS } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Panel, fieldCls, primaryBtn, ghostBtn } from "./Panel";

const EMPTY = { url: "", title: "", price: "", mrp: "", image: "", note: "", categories: [], post_now: true };
const NOTES = [
  ["supercoin", "100% SuperCoins back — completely FREE (pay with SuperCoins)"],
  ["bank", "Extra ₹___ off with ___ Credit Card"],
  ["coupon", "Apply ₹___ coupon on product page"],
  ["cashback", "₹___ cashback with ___"],
];

const NoteChips = ({ add }) => (
  <div className="mt-2 flex flex-wrap gap-2">
    {NOTES.map(([k, t]) => (
      <button key={k} type="button" data-testid={`manual-note-chip-${k}`} onClick={() => add(t, k)}
        className="rounded-full border border-dashed border-amber-400 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100">+ {t}</button>
    ))}
  </div>
);

export const ManualAddTab = () => {
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [looking, setLooking] = useState(false);
  const [lastLooked, setLastLooked] = useState("");
  const [priceHistory, setPriceHistory] = useState(null);
  const set = (k) => (e) => {
    const value = e?.target ? e.target.value : e;
    setF({ ...f, [k]: value });
    if (k === "url") setPriceHistory(null);
  };
  const off = f.price && f.mrp && Number(f.mrp) > Number(f.price) ? Math.round((1 - f.price / f.mrp) * 100) : null;
  const toggleCat = (k) => setF({ ...f, categories: f.categories.includes(k) ? f.categories.filter((x) => x !== k) : [...f.categories, k] });

  const fetchDetails = async (url = f.url, force = false) => {
    if (!url.startsWith("http") || (!force && url === lastLooked)) return;
    setLooking(true);
    setLastLooked(url);
    try {
      const { data } = await api.get("/lookup", { params: { url } });
      setF((p) => ({ ...p, title: p.title || data.title || "", price: p.price || data.price || "", mrp: p.mrp || data.mrp || "", image: p.image || data.image || "" }));
      setPriceHistory(data.price_history || null);
      toast.success(data.title ? "Details filled — check the deal price" : "Couldn't find details, fill them in");
    } catch (e) { toast.error(errMsg(e)); } finally { setLooking(false); }
  };
  const addNote = (t, k) => setF((p) => ({ ...p, note: p.note ? `${p.note}\n${t}` : t,
    categories: k === "supercoin" && !p.categories.includes("supercoin_100") ? [...p.categories, "supercoin_100"] : p.categories }));

  const submit = async () => {
    if (!f.url.startsWith("http")) return toast.error("Paste a full product link");
    setBusy(true);
    try {
      const { data } = await api.post("/deals", {
        ...f, price: f.price ? Number(f.price) : null, mrp: f.mrp ? Number(f.mrp) : null,
        image: f.image || null, title: f.title || null, categories: f.categories.length ? f.categories : null,
      });
      const ok = data.post_results.filter((r) => r.status === "success").length;
      const fail = data.post_results.length - ok;
      toast.success(`Deal live on website${f.post_now ? ` · sent to ${ok} channel(s)` : ""}`);
      if (fail) toast.error(`${fail} channel(s) failed — check Post Log`);
      setF(EMPTY);
      setLastLooked("");
      setPriceHistory(null);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <Panel testid="manual-add-panel" title="Post a deal by hand" desc="Paste a product link — name, price, MRP and picture are filled in automatically. The link becomes your earning link.">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label className="text-xs text-slate-600">Product link</Label>
          <div className="flex gap-2">
            <Input data-testid="manual-deal-url-input" value={f.url} onChange={set("url")} onBlur={() => fetchDetails()}
              onPaste={(e) => { const t = e.clipboardData.getData("text").trim(); setTimeout(() => fetchDetails(t), 0); }}
              placeholder="https://www.flipkart.com/…" className={fieldCls} />
            <Button data-testid="manual-deal-fetch-button" type="button" className={ghostBtn} disabled={looking} onClick={() => fetchDetails(f.url, true)}>
              <Wand2 className="mr-1 h-4 w-4" /> {looking ? "Fetching…" : "Fetch details"}
            </Button>
          </div></div>
        <div className="sm:col-span-2"><Label className="text-xs text-slate-600">Title</Label>
          <Input data-testid="manual-deal-title-input" value={f.title} onChange={set("title")} placeholder="Auto-filled from the link" className={fieldCls} /></div>
        <div><Label className="text-xs text-slate-600">Deal price (₹) — after offers</Label>
          <Input data-testid="manual-deal-price-input" type="number" value={f.price} onChange={set("price")} className={fieldCls} /></div>
        <div><Label className="text-xs text-slate-600">MRP (₹) {off !== null && <span className="text-[#B7791F]">· {off}% off</span>}</Label>
          <Input data-testid="manual-deal-mrp-input" type="number" value={f.mrp} onChange={set("mrp")} className={fieldCls} /></div>
        {priceHistory && <div data-testid="manual-price-history" className="sm:col-span-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
          <span className="font-semibold text-slate-800">Tracked price history:</span>{" "}
          Lowest {priceHistory.lowest ? `₹${Number(priceHistory.lowest).toLocaleString("en-IN")}` : "not available"}
          {priceHistory.lowest_on ? ` · recorded ${new Date(priceHistory.lowest_on).toLocaleDateString("en-IN")}` : ""}
          {priceHistory.highest ? ` · highest ₹${Number(priceHistory.highest).toLocaleString("en-IN")}` : ""}
        </div>}
        <div className="sm:col-span-2"><Label className="text-xs text-slate-600">Image URL</Label>
          <div className="flex items-center gap-3">
            <Input data-testid="manual-deal-image-input" value={f.image} onChange={set("image")} placeholder="Auto-filled when found" className={fieldCls} />
            {f.image && <img data-testid="manual-deal-image-preview" src={f.image} alt="" className="h-12 w-12 shrink-0 rounded-lg border object-contain" />}
          </div></div>
        <div className="sm:col-span-2"><Label className="text-xs text-slate-600">Extra note — offers (shown on the card and in posts)</Label>
          <Textarea data-testid="manual-deal-note-input" value={f.note} onChange={set("note")} placeholder="e.g. Extra ₹1,200 off with HDFC Credit Card" className="rounded-xl border-slate-300 bg-[#F5F2EA]" />
          <NoteChips add={addNote} /></div>
        <div className="sm:col-span-2"><Label className="mb-2 block text-xs text-slate-600">Deal type (empty = auto-detect)</Label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(CATS).map(([k, c]) => (
              <button key={k} type="button" data-testid={`manual-cat-${k}`} onClick={() => toggleCat(k)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${f.categories.includes(k) ? c.cls : "border-slate-300 text-slate-600 hover:text-slate-950"}`}>{c.label}</button>
            ))}
          </div></div>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Switch data-testid="manual-deal-post-now-switch" checked={f.post_now} onCheckedChange={set("post_now")} />
          <span className="text-sm text-slate-700">Send to matching Telegram channels now</span>
        </div>
        <Button data-testid="manual-deal-submit-button" disabled={busy} className={`${primaryBtn} sm:col-span-2`} onClick={submit}>
          {busy ? "Posting…" : "Publish deal"}
        </Button>
      </div>
    </Panel>
  );
};
