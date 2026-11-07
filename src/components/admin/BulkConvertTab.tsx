// @ts-nocheck — ported from the original app
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Share2, ImageDown } from "lucide-react";
import { api, errMsg, inr } from "@/lib/api";
import { copyText, copyDeal, shareDeal, shareWithImage, allDealsText, previewUrl, prefs, setPrefs } from "@/lib/share";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Panel, primaryBtn, ghostBtn, fieldCls } from "./Panel";

const MAX = 10;
const URL_G = /https?:\/\/[^\s<>"')\]]+/g;
const linkContext = (text, link) => {
  const i = text.indexOf(link);
  if (i < 0) return "";
  const before = text.slice(0, i);
  let start = 0;
  for (const m of before.matchAll(URL_G)) start = m.index + m[0].length;
  const end = text.indexOf("\n", i);
  return (before.slice(start) + (end > 0 ? text.slice(i + link.length, end) : text.slice(i + link.length))).replace(URL_G, " ").trim();
};
const btn = "flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-200";
const toDeal = (it) => ({ title: it.title, price: it.price, mrp: it.mrp, store: it.store, image: it.image, link: it.converted,
  offers: it.offers, store_price: it.store_price, preview: it.share_code ? previewUrl(it.share_code) : null });

const CopySettings = () => {
  const [header, setHeader] = useState(prefs.header);
  const [style, setStyle] = useState(prefs.style);
  useEffect(() => {
    api.get("/settings").then(({ data }) => { setPrefs(data); setHeader(data.copy_header ?? ""); setStyle(data.copy_link_style || "direct"); }).catch(() => {});
  }, []);
  const save = async (extra = {}) => {
    try {
      const { data } = await api.put("/settings", { copy_header: header, copy_link_style: style, ...extra });
      setPrefs(data);
      setStyle(data.copy_link_style);
      toast.success("Copy settings saved");
    } catch (e) { toast.error(errMsg(e)); }
  };
  const opt = (v, label) => (
    <button data-testid={`copy-style-${v}`} onClick={() => { setStyle(v); save({ copy_link_style: v }); }}
      className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors ${style === v ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"}`}>{label}</button>
  );
  return (
    <Panel testid="copy-settings-panel" title="Copy & share settings" desc="Top line is added when you copy all deals (1 to 10). Picture links show the product photo in Telegram/WhatsApp and open your affiliate link.">
      <div className="space-y-3">
        <div className="flex gap-2">
          <Input data-testid="copy-header-input" value={header} onChange={(e) => setHeader(e.target.value)} placeholder="Top line (empty = none)" className={fieldCls} />
          <Button data-testid="copy-header-save-button" className={primaryBtn} onClick={() => save()}>Save</Button>
        </div>
        <div className="flex flex-wrap gap-2">{opt("direct", "My affiliate link")}{opt("preview", "Website link with picture preview")}</div>
      </div>
    </Panel>
  );
};

const AddPicture = ({ it, i, onImage }) => {
  const [url, setUrl] = useState("");
  const save = async () => {
    try { await api.put(`/go/${it.share_code}`, { image: url.trim() }); onImage(url.trim()); toast.success("Picture added — copy again to share it"); }
    catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="flex gap-2 pt-1">
      <Input data-testid={`bulk-image-input-${i}`} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="No picture found — paste a picture link" className={`${fieldCls} h-8 text-xs`} />
      <button data-testid={`bulk-image-save-${i}`} className={btn} onClick={save} disabled={!url.trim()}>Add picture</button>
    </div>
  );
};

const ResultCard = ({ it, i, onImage }) => {
  const deal = toDeal(it);
  return (
    <div data-testid={`bulk-result-${i}`} className="flex gap-4 rounded-xl border border-slate-200 bg-white p-3">
      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-100">
        {it.image ? <img src={`/api/public/image-proxy?url=${encodeURIComponent(it.image)}`} alt={it.title || "deal"} className="h-full w-full object-contain" /> :
          <div className="grid h-full place-items-center text-2xl font-black text-slate-300">{it.store?.[0]}</div>}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-slate-900 px-2 py-0.5 font-mono text-[10px] uppercase text-white">{it.store}</span>
          {it.price && <span className="text-sm font-bold">{inr(it.price)}</span>}
          {it.mrp > it.price && <span className="text-xs text-slate-400 line-through">{inr(it.mrp)}</span>}
          {it.store_price && it.store_price !== it.price && <span data-testid={`bulk-store-price-${i}`} className="text-[11px] text-slate-500">store now {inr(it.store_price)} (before offers)</span>}
          {it.price_history?.lowest && <span data-testid={`bulk-lowest-price-${i}`} className="text-[11px] text-emerald-700">tracked low {inr(it.price_history.lowest)}</span>}
          <span data-testid={`bulk-status-${i}`} className={`text-xs font-semibold ${it.changed ? "text-emerald-700" : "text-amber-600"}`}>
            {it.changed ? "Converted to your affiliate link" : it.error}
          </span>
        </div>
        {it.title && <p className="line-clamp-1 text-sm font-semibold">{it.title}</p>}
        {(it.offers || []).length > 0 && <p data-testid={`bulk-offers-${i}`} className="text-xs text-slate-600">{it.offers.map((offer) => offer.label).join(" · ")}</p>}
        <p className="break-all font-mono text-[11px] text-slate-400 line-through">{it.original}</p>
        <p data-testid={`bulk-converted-${i}`} className="break-all font-mono text-xs text-slate-800">{it.converted}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button data-testid={`bulk-copy-link-${i}`} className={btn} onClick={() => copyText(it.converted, "Link copied")}><Copy className="h-3.5 w-3.5" /> Link only</button>
          <button data-testid={`bulk-copy-details-${i}`} className={btn} onClick={() => copyDeal(deal)}><Copy className="h-3.5 w-3.5" /> Copy details + link</button>
          <button data-testid={`bulk-share-${i}`} className={btn} onClick={() => shareDeal(deal)}><Share2 className="h-3.5 w-3.5" /> Share</button>
          {it.image && <button data-testid={`bulk-share-image-${i}`} className={btn} onClick={() => shareWithImage(deal)}><ImageDown className="h-3.5 w-3.5" /> Share with image</button>}
        </div>
        {!it.image && it.share_code && <AddPicture it={it} i={i} onImage={onImage} />}
      </div>
    </div>
  );
};

export const BulkConvertTab = () => {
  const [text, setText] = useState("");
  useEffect(() => {
    const t = localStorage.getItem("bulk_prefill");
    if (t) { setText(t); localStorage.removeItem("bulk_prefill"); }
  }, []);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState([]);
  const run = async () => {
    const urls = [...new Set((text.match(/https?:\/\/[^\s<>"')\]]+/g) || []).map((u) => u.replace(/[.,;!]+$/, "")).filter((u) => !u.includes("t.me/") && !done.includes(u)))];
    if (!urls.length) return toast.error("No links found. Paste one or more deal links.");
    const batch = urls.slice(0, MAX), chunks = [];
    for (let k = 0; k < batch.length; k += 3) chunks.push(batch.slice(k, k + 3));
    setBusy(`0/${batch.length}`);
    try {
      const items = [];
      for (const c of chunks) {
        const body = c.map((u) => `${linkContext(text, u)}\n${u}`).join("\n");
        const { data } = await api.post("/convert/bulk", { text: body, base: window.location.origin });
        items.push(...data.items);
        setBusy(`${items.length}/${batch.length}`);
      }
      const map = Object.fromEntries(items.map((it) => [it.original, it.converted]));
      const pattern = new RegExp([...batch].sort((a, b) => b.length - a.length).map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
      const skipped = urls.slice(MAX);
      setRes({ items, message: text.replace(pattern, (m) => map[m] || m).trim(), total_found: urls.length, skipped });
      if (skipped.length) toast.warning(`Found ${urls.length} links — converted the first ${MAX}. Load the next batch for the rest.`);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const nextBatch = () => { setDone([...done, ...res.items.map((it) => it.converted)]); setText(res.message); setRes(null); };
  return (
    <div className="space-y-6">
      <Panel testid="bulk-convert-panel" title="Convert up to 10 links at once"
        desc="Paste links or a whole deal message from anyone. Their tracking is removed, then each link uses your selected affiliate service for that store.">
        <Textarea data-testid="bulk-input" value={text} onChange={(e) => { setText(e.target.value); if (!e.target.value) setDone([]); }} rows={7}
          placeholder={"Paste here, e.g.\nBoat earbuds at 399 https://fkrt.it/xyz\nhttps://amzn.to/abc"} className="rounded-xl border-slate-300 bg-[#F5F2EA] font-mono text-xs" />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button data-testid="bulk-convert-button" className={primaryBtn} disabled={busy || !text.trim()} onClick={run}>{busy ? `Converting… ${busy} done` : "Convert links"}</Button>
          {res?.skipped?.length > 0 && <Button data-testid="bulk-next-batch-button" className={ghostBtn} onClick={nextBatch}>Load next {Math.min(res.skipped.length, MAX)} links</Button>}
        </div>
      </Panel>
      {res && (
        <Panel testid="bulk-results-panel" title={`${res.items.filter((x) => x.changed).length} of ${res.items.length} links converted`}
          action={<div className="flex flex-wrap gap-2">
            <Button data-testid="bulk-copy-all-details-button" className={primaryBtn} onClick={() => copyText(allDealsText(res.items.map(toDeal)), "All deals with details copied")}><Copy className="mr-1 h-4 w-4" /> Copy all deals with details</Button>
            <Button data-testid="bulk-copy-message-button" className={ghostBtn} onClick={() => copyText(res.message, "Full message with your links copied")}><Copy className="mr-1 h-4 w-4" /> Copy original message</Button>
          </div>}>
          <pre data-testid="bulk-message" className="mb-4 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-[#F5F2EA] p-3 font-mono text-xs">{res.message}</pre>
          <div className="space-y-3">{res.items.map((it, i) => <ResultCard key={it.original} it={it} i={i}
            onImage={(image) => setRes({ ...res, items: res.items.map((x, j) => (j === i ? { ...x, image } : x)) })} />)}</div>
        </Panel>
      )}
      <CopySettings />
    </div>
  );
};
