import { useState } from "react";
import { Send, RefreshCw, Unplug } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function TelegramConverterPanel({ settings, reload }: { settings: any; reload: () => void }) {
  const [token, setToken] = useState("");
  const [address, setAddress] = useState(settings.telegram_converter_url || "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<any>(null);
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
      if (action === "disconnect") toast.success("Telegram converter disconnected");
    } catch (error) { toast.error(errMsg(error)); } finally { setBusy(false); }
  }
  return (
    <section data-testid="telegram-converter-panel" className="space-y-4 border-t border-border pt-6 lg:col-span-2">
      <div className="flex items-center gap-2"><Send className="h-4 w-4" /><h2 className="text-lg font-bold">Telegram link converter</h2></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="converter-token">Converter bot token {settings.telegram_converter_token_masked ? "· saved" : ""}</Label>
          <Input id="converter-token" data-testid="telegram-converter-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder={settings.telegram_converter_token_masked ? "Leave empty to keep saved token" : "BotFather token"} /></div>
        <div className="space-y-2"><Label htmlFor="converter-address">Site address</Label>
          <Input id="converter-address" data-testid="telegram-converter-address" type="url" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="https://your-app.onrender.com" /></div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button data-testid="telegram-converter-connect" disabled={busy || (!token && !settings.telegram_converter_token_masked)} onClick={() => run("connect")}><Send className="mr-2 h-4 w-4" />{busy ? "Please wait…" : "Connect bot"}</Button>
        <Button variant="outline" disabled={busy || !settings.telegram_converter_token_masked} onClick={() => run("status")}><RefreshCw className="mr-2 h-4 w-4" />Check connection</Button>
        <Button variant="ghost" disabled={busy || !settings.telegram_converter_token_masked} onClick={() => run("disconnect")}><Unplug className="mr-2 h-4 w-4" />Disconnect</Button>
        <span className="text-sm text-muted-foreground">{status ? status.connected === false ? "Disconnected" : status.webhook_url ? "Connected" : "Not connected" : settings.telegram_converter_connected ? `Connected · @${settings.telegram_converter_username}` : "Not connected"}</span>
      </div>
      {status?.pairing_code && <div className="space-y-2 text-sm">
        <Label>Chat connection command · expires in 15 minutes</Label>
        <Input readOnly aria-label="Telegram connection command" value={`/connect ${status.pairing_code}`} className="font-mono text-xs" />
        {settings.telegram_converter_username && <a className="underline" href={`https://t.me/${settings.telegram_converter_username}`} target="_blank" rel="noreferrer">Open @{settings.telegram_converter_username}</a>}
      </div>}
      {status?.chats && <p className="text-sm text-muted-foreground">Connected chats: {status.chats.length ? status.chats.map((c: any) => `${c.type} ${c.chat_id}`).join(", ") : "None"}</p>}
      {status?.error && <p role="alert" className="text-sm text-destructive">{status.error}</p>}
    </section>
  );
}