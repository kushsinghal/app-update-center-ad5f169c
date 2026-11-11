import { useEffect, useState } from "react";
import { Send, RefreshCw, Unplug, Bot, CheckCircle2, CircleDashed } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function TelegramConverterPanel({ settings, reload }: { settings: any; reload: () => void }) {
  const [token, setToken] = useState("");
  const [address, setAddress] = useState(settings.telegram_converter_url || window.location.origin);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const saved = !!settings.telegram_converter_token_masked;
  const connected = status ? !!status.connected : !!settings.telegram_converter_connected;
  const username = settings.telegram_converter_username;
  const labelStyle = settings.converter_label_style || "store";
  useEffect(() => { if (saved) run("status"); }, []);
  async function setLabelStyle(style: "store" | "link") {
    try { await api.put("/settings", { converter_label_style: style }); reload(); } catch (error) { toast.error(errMsg(error)); }
  }
  async function run(action: "connect" | "status" | "disconnect") {
    setBusy(true);
    try {
      if (action === "connect" && token) {
        await api.put("/settings", { telegram_converter_token: token });
        setToken("");
      }
      const { data } = await api.post(`/telegram/converter/${action}`, action === "connect" ? { origin: address || window.location.origin } : {});
      setStatus(data);
      reload();
      if (action === "connect") toast.success("Telegram bot connected");
      if (action === "status") toast.success(data.connected ? "Telegram connection is working" : "Telegram is not receiving messages yet");
      if (action === "disconnect") toast.success("Telegram converter disconnected");
    } catch (error) { toast.error(errMsg(error)); } finally { setBusy(false); }
  }
  return (
    <section data-testid="telegram-converter-panel" className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2"><Send className="h-4 w-4" /><h2 className="text-lg font-bold">Telegram converter</h2></div>
        <span data-testid="telegram-converter-status" className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${connected ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>
          {connected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleDashed className="h-3.5 w-3.5" />}
          {connected ? "Connected" : saved ? "Not connected" : "Not set up"}
        </span>
      </div>
      <div className="flex items-center gap-2 text-sm text-slate-700">
        <Bot className="h-4 w-4 shrink-0" />
        {username ? <a className="font-semibold underline" href={`https://t.me/${username}`} target="_blank" rel="noreferrer">@{username}</a> : <span className="text-slate-500">No bot connected yet</span>}
      </div>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
        <li>Create a bot with @BotFather and paste its token below.</li>
        <li>Connect the bot using your live site address.</li>
        <li>In each group or channel, send the connection command shown after connecting.</li>
      </ol>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="converter-token">Bot token {saved ? "· saved" : ""}</Label>
          <Input id="converter-token" data-testid="telegram-converter-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder={saved ? "Leave empty to keep saved token" : "BotFather token"} /></div>
        <div className="space-y-2"><Label htmlFor="converter-address">Site address</Label>
          <Input id="converter-address" data-testid="telegram-converter-address" type="url" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="https://your-app.onrender.com" /></div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button data-testid="telegram-converter-connect" disabled={busy || (!token && !saved)} onClick={() => run("connect")}><Send className="mr-2 h-4 w-4" />{busy ? "Please wait…" : "Connect bot"}</Button>
        <Button variant="outline" disabled={busy || !saved} onClick={() => run("status")}><RefreshCw className="mr-2 h-4 w-4" />Check connection</Button>
        <Button variant="ghost" disabled={busy || !saved} onClick={() => run("disconnect")}><Unplug className="mr-2 h-4 w-4" />Disconnect</Button>
      </div>
      <p className="text-xs text-slate-500">Disconnect stops Telegram from sending messages to this site. Your bot token and connected chats are kept, so you can reconnect at any time.</p>
      {status?.pairing_code && <div className="space-y-2 text-sm">
        <Label>Chat connection command · expires in 15 minutes</Label>
        <Input readOnly aria-label="Telegram connection command" value={`/connect ${status.pairing_code}`} className="font-mono text-xs" />
      </div>}
      {status?.chats && <p className="text-sm text-slate-600">Connected chats: {status.chats.length ? status.chats.map((c: any) => `${c.type} ${c.chat_id}`).join(", ") : "None"}</p>}
      {status?.error && <p role="alert" className="text-sm text-destructive">{status.error}</p>}
      <div className="space-y-2 border-t border-slate-200 pt-4">
        <Label>Bot reply style</Label>
        <div className="inline-flex rounded-full border border-slate-300 p-0.5 text-xs font-semibold" role="group" aria-label="Bot reply style">
          {([["store", "Store name"], ["link", "Link text"]] as const).map(([value, text]) => (
            <button key={value} type="button" data-testid={`converter-label-${value}`} aria-pressed={labelStyle === value} onClick={() => setLabelStyle(value)}
              className={`rounded-full px-3 py-1 transition-colors ${labelStyle === value ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-200"}`}>{text}</button>
          ))}
        </div>
        <Label>Preview</Label>
        <p data-testid="telegram-converter-preview" className="rounded-xl bg-[#F5F2EA] p-3 text-sm text-slate-800">
          Deal price ₹399 at <a href="https://www.flipkart.com/" className="font-semibold text-sky-700 underline" onClick={(e) => e.preventDefault()}>{labelStyle === "link" ? "https://fkrt.cc/your-link" : "@Flipkart"}</a>
        </p>
        <p className="text-xs text-slate-500">{labelStyle === "link" ? "The converted link is shown as the clickable text." : "Store names become clickable links to your affiliate page."} Your links are never shown as raw text.</p>
      </div>
    </section>
  );
}
