// @ts-nocheck — ported from the original app
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Panel, fieldCls, primaryBtn, ghostBtn } from "./Panel";

const Tester = () => {
  const [url, setUrl] = useState("");
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { const { data } = await api.post("/convert", { url }); setRes(data); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Panel testid="sankmo-test-panel" title="Test a link" desc="Paste any store link and see the link that will be posted. Other people's tracking tags are removed first.">
      <div className="flex gap-2">
        <Input data-testid="sankmo-test-url-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://amzn.to/… or flipkart link" className={fieldCls} />
        <Button data-testid="sankmo-test-button" className={ghostBtn} onClick={run} disabled={busy}>{busy ? "…" : "Convert"}</Button>
      </div>
      {res && (
        <div data-testid="sankmo-test-result" className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-[#F5F2EA] p-4 font-mono text-xs">
          <p className="text-slate-500">Cleaned: <span className="break-all text-slate-700">{res.cleaned}</span></p>
          <p className={res.changed ? "text-emerald-700" : "text-amber-600"}>
            {res.changed ? "Converted to your affiliate link" : res.error ? `Failed: ${res.error}` : "Not converted yet (check the selected service settings)"}
          </p>
          <p className="break-all text-slate-800">{res.converted}</p>
        </div>
      )}
    </Panel>
  );
};

const TelegramConnect = () => (
  <div data-testid="tg-unavailable" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
    Converting links through your personal Telegram account (@sankmo_bot) is not available in this version. Use the Sankmo API token option instead.
  </div>
);

const ALL_STORES = ["Flipkart", "Myntra", "Ajio", "Shopsy", "Meesho", "Croma", "Tata CLiQ", "JioMart", "Nykaa", "Xiaomi", "Snapdeal",
  "Reliance Digital", "Paytm", "Swiggy", "Zomato", "Woohoo", "Gyftr"];

const StoresPanel = ({ s, setS }) => {
  const routes = s.affiliate_routes || {};
  const routeFor = (name) => routes[name] || ((s.sankmo_stores || []).includes(name) ? "sankmo" : "earnkaro");
  const change = async (name, route) => {
    const next = { ...routes, [name]: route };
    try { const { data } = await api.put("/settings", { affiliate_routes: next }); setS(data); toast.success(`${name} now uses ${route === "original" ? "clean link" : route}`); }
    catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Panel testid="sankmo-stores-panel" title="Affiliate route by store" desc="Choose one service per store. Amazon is routed through EarnKaro.">
      <div className="space-y-2">
        {["Amazon", ...ALL_STORES, "Other"].map((n) => (
          <div key={n} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 py-2">
            <span className="text-sm font-semibold">{n}</span>
            {n === "Amazon" ? <span data-testid="affiliate-route-amazon" className="text-xs font-semibold">EarnKaro</span> :
              <select aria-label={`${n} affiliate service`} data-testid={`affiliate-route-${n.toLowerCase().replace(/\s+/g, "-")}`} value={routeFor(n)}
                onChange={(e) => change(n, e.target.value)} className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold">
                <option value="sankmo">Sankmo → EarnKaro fallback</option>
                <option value="earnkaro">EarnKaro</option>
                <option value="original">Keep clean link</option>
              </select>}
          </div>
        ))}
      </div>
    </Panel>
  );
};

export const SankmoTab = () => {
  const [s, setS] = useState(null);
  const [token, setToken] = useState("");
  const [earnkaroToken, setEarnkaroToken] = useState("");
  const load = () => api.get("/settings").then((r) => setS(r.data));
  useEffect(() => { load(); }, []);
  if (!s) return null;
  const save = async (extra = {}) => {
    try {
      const { data } = await api.put("/settings", { sankmo_api_url: s.sankmo_api_url,
        convert_enabled: s.convert_enabled, sankmo_bot: s.sankmo_bot, convert_mode: s.convert_mode, sankmo_token: token, earnkaro_token: earnkaroToken, ...extra });
      setS(data); setToken(""); setEarnkaroToken("");
      toast.success("Affiliate settings saved");
    } catch (e) { toast.error(errMsg(e)); }
  };
  const modeBtn = (m, label) => (
    <button data-testid={`sankmo-mode-${m}`} onClick={() => save({ convert_mode: m })}
      className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors ${s.convert_mode === m ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700 hover:text-slate-950"}`}>{label}</button>
  );
  return (
    <div className="grid gap-6 lg:grid-cols-2">
    <Panel testid="sankmo-panel" title="Affiliate links" desc="Choose a service for each store. Amazon always uses EarnKaro.">
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <Switch data-testid="sankmo-enabled-switch" checked={s.convert_enabled} onCheckedChange={(v) => save({ convert_enabled: v })} />
            <span className="text-sm">Convert links automatically</span>
          </div>
          <div className="flex flex-wrap gap-2">{modeBtn("sankmo_api", "Sankmo API token")}{modeBtn("api", "Custom Sankmo API")}</div>
          {s.convert_mode === "sankmo_api" ? (
              <p data-testid="sankmo-api-help" className="rounded-xl border border-slate-200 bg-[#F5F2EA] p-3 text-xs text-slate-700">
              This version already has a Sankmo converter address configured. Paste your Sankmo token below and test a link. Sankmo’s public pages do not document this token/API flow, so ask Sankmo support for the correct token type if testing fails.
            </p>
          ) : s.convert_mode === "telegram" ? <TelegramConnect s={s} reload={load} /> : (
            <div><Label className="text-xs text-slate-600">Converter API URL</Label>
              <Input data-testid="sankmo-api-url-input" value={s.sankmo_api_url} onChange={(e) => setS({ ...s, sankmo_api_url: e.target.value })}
                placeholder="https://… (use {url} and {token})" className={fieldCls} /></div>
          )}
          <div><Label className="text-xs text-slate-600">Sankmo token {s.sankmo_token_masked && <span className="font-mono text-emerald-700">· saved {s.sankmo_token_masked}</span>}</Label>
            <Input data-testid="sankmo-token-input" type="password" value={token} onChange={(e) => setToken(e.target.value)}
              placeholder={s.sankmo_token_masked ? "Leave empty to keep current token" : "Paste your Sankmo token"} className={fieldCls} /></div>
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <Label className="text-xs text-slate-600">EarnKaro API token {s.earnkaro_token_masked && <span className="font-mono text-emerald-700">· saved {s.earnkaro_token_masked}</span>}</Label>
            <Input data-testid="earnkaro-token-input" type="password" value={earnkaroToken} onChange={(e) => setEarnkaroToken(e.target.value)}
              placeholder={s.earnkaro_token_masked ? "Leave empty to keep current token" : "Paste your EarnKaro token"} className={fieldCls} />
            <p className="text-xs text-slate-500">No Telegram bot setup is needed for this app. The separate EarnKaro converter bots are for converting inside Telegram; this app uses the API details you shared for pasted links and new deals.</p>
          </div>
          <Button data-testid="sankmo-save-button" className={primaryBtn} onClick={() => save()}>Save</Button>
        </div>
      </Panel>
      <Tester />
      <StoresPanel s={s} setS={setS} />
      <Button data-testid="sankmo-reconvert-button" className={`${ghostBtn} lg:col-span-2`}
        onClick={async () => { await api.post("/deals/reconvert"); toast.success("Converting the last 24h of deals with your current affiliate settings in the background"); }}>
        Reconvert recent deals with current store settings
      </Button>
    </div>
  );
};
