// @ts-nocheck — ported from the original app
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Trash2, Plus } from "lucide-react";
import { api, errMsg, timeAgo } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Panel, fieldCls, primaryBtn, ghostBtn } from "./Panel";

const SourceRow = ({ s, reload }) => {
  const [busy, setBusy] = useState(false);
  const fetchNow = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/sources/${s.id}/fetch`);
      data.error ? toast.error(data.error) : toast.success(`${data.fetched} posts scanned, ${data.new_deals} new deals`);
      reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const toggle = async (v) => { await api.put(`/sources/${s.id}`, { ...s, enabled: v }); reload(); };
  const remove = async () => { await api.delete(`/sources/${s.id}`); toast.success("Source removed"); reload(); };
  return (
    <div data-testid={`source-row-${s.id}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-[#F5F2EA] p-3">
      <span className="hidden rounded-md bg-slate-200 px-2 sm:inline py-0.5 font-mono text-[10px] uppercase text-slate-700">{s.kind}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{s.name}</p>
        <p className="font-mono text-[11px] text-slate-500">
          checked {timeAgo(s.last_fetched_at)} · {s.total_deals || 0} deal{s.total_deals === 1 ? "" : "s"} {s.last_error && <span className="text-rose-600">· {s.last_error}</span>}
        </p>
      </div>
      <Switch data-testid={`source-toggle-${s.id}`} checked={s.enabled} onCheckedChange={toggle} />
      <Button size="sm" data-testid={`source-fetch-${s.id}`} className={ghostBtn} onClick={fetchNow} disabled={busy}>
        <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
      </Button>
      <Button size="sm" data-testid={`source-delete-${s.id}`} className={ghostBtn} onClick={remove}><Trash2 className="h-4 w-4" /></Button>
    </div>
  );
};

export const SourcesTab = () => {
  const [list, setList] = useState([]);
  const [value, setValue] = useState("");
  const [kind, setKind] = useState("telegram");
  const load = () => api.get("/sources").then((r) => setList(r.data));
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!value.trim()) return;
    try {
      await api.post("/sources", { value, kind });
      setValue("");
      toast.success("Source added — tap refresh to scan it now");
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const fetchAll = async () => { await api.post("/fetch-all"); toast.success("Scanning all sources in background"); setTimeout(load, 8000); };

  return (
    <Panel testid="sources-panel" title="Deal sources"
      desc="Public Telegram channels, RSS feeds, or deal website pages (DesiDime, DealsMagnet). Checked automatically on every update (set the timing in Rules). Only fresh posts are sent to Telegram, so old posts won't flood your channels."
      action={<Button data-testid="fetch-all-button" className={ghostBtn} onClick={fetchAll}><RefreshCw className="mr-2 h-4 w-4" />Scan all now</Button>}>
      <div className="mb-5 flex flex-col gap-2 sm:flex-row">
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger data-testid="add-source-kind-select" className={`${fieldCls} sm:w-40`}><SelectValue /></SelectTrigger>
          <SelectContent className="border-slate-200 bg-white text-slate-900">
            <SelectItem value="telegram">Telegram</SelectItem>
            <SelectItem value="rss">RSS feed</SelectItem>
            <SelectItem value="web">Website page</SelectItem>
          </SelectContent>
        </Select>
        <Input data-testid="add-source-input" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={kind === "telegram" ? "@channelname or https://t.me/channelname" : kind === "web" ? "https://www.desidime.com/new or https://www.dealsmagnet.com/" : "https://site.com/feed"} className={fieldCls} />
        <Button data-testid="add-source-submit-button" className={primaryBtn} onClick={add}><Plus className="mr-1 h-4 w-4" />Add</Button>
      </div>
      <div className="space-y-2">
        {list.map((s) => <SourceRow key={s.id} s={s} reload={load} />)}
        {list.length === 0 && <p className="text-sm text-slate-500">No sources yet.</p>}
      </div>
    </Panel>
  );
};
