// @ts-nocheck — ported from the original app
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api, timeAgo } from "@/lib/api";
import { formatKolkata } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Panel, ghostBtn } from "./Panel";

export const LogsTab = () => {
  const [logs, setLogs] = useState([]);
  const load = () => api.get("/logs").then((r) => setLogs(r.data));
  useEffect(() => { load(); }, []);
  return (
    <Panel testid="logs-panel" title="Post log" desc="Every message sent to Telegram, and whether it worked."
      action={<Button data-testid="logs-refresh-button" className={ghostBtn} onClick={load}><RefreshCw className="h-4 w-4" /></Button>}>
      <div className="space-y-2">
        {logs.map((l) => (
          <div key={l.id} data-testid={`log-row-${l.id}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-[#F5F2EA] p-3 text-sm">
            <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase ${l.status === "success" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}>{l.status}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{l.deal_title}</p>
              <p className="truncate font-mono text-[11px] text-slate-500">
                → {l.destination_name}
                {l.status === "success"
                  ? <> · Posted {formatKolkata(l.sent_at)}{l.message_id ? ` · message #${l.message_id}` : ""}</>
                  : <> · Not posted · attempted {timeAgo(l.created_at)}</>}
                {l.error && <span className="text-rose-600"> · {l.error}</span>}
              </p>
            </div>
          </div>
        ))}
        {logs.length === 0 && <p data-testid="logs-empty" className="text-sm text-slate-500">Nothing sent yet.</p>}
      </div>
    </Panel>
  );
};
