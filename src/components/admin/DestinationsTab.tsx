// @ts-nocheck — ported from the original app
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Send, Trash2, Pencil } from "lucide-react";
import { api, errMsg, CATS } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Panel, fieldCls, primaryBtn, ghostBtn } from "./Panel";

const EMPTY = { name: "", bot_token: "", chat_id: "", categories: [], min_discount: 0, stores: [], enabled: true };

const CatPicker = ({ value, onChange }) => (
  <div className="flex flex-wrap gap-2">
    {Object.entries(CATS).map(([k, c]) => {
      const on = value.includes(k);
      return (
        <button type="button" key={k} data-testid={`dest-cat-${k}`}
          onClick={() => onChange(on ? value.filter((x) => x !== k) : [...value, k])}
          className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${on ? c.cls : "border-slate-300 text-slate-600 hover:text-slate-950"}`}>
          {c.label}
        </button>
      );
    })}
  </div>
);

const ChatFinder = ({ token, destId, onPick }) => {
  const [chats, setChats] = useState(null);
  const find = async () => {
    if (!token && !destId) return toast.error("Paste the bot token first");
    try { const { data } = await api.post("/telegram/chats", { bot_token: token || null, destination_id: destId || null }); setChats(data); if (!data.length) toast.error("No chats found yet — send /start to your bot (or post in the channel) and try again"); }
    catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-3">
      <p className="text-xs text-slate-600"><b>Chat ID is always needed</b> — it tells the bot where to send. <b>Personal chat:</b> open your bot in Telegram, send <b>/start</b>, then tap below and pick your name. <b>Public channel:</b> @channelname works. <b>Private channel:</b> add the bot as admin, post anything in the channel, then tap below and pick it (ID starts with -100).</p>
      <Button type="button" size="sm" data-testid="find-chat-id-button" className={`${ghostBtn} mt-2`} onClick={find}>Find my chat ID</Button>
      {chats?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {chats.map((c) => (
            <button type="button" key={c.id} data-testid={`pick-chat-${c.id}`} onClick={() => onPick(c.id)}
              className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-800 hover:bg-slate-200">{c.name} · {c.type} · {c.id}</button>
          ))}
        </div>
      )}
    </div>
  );
};

const DestForm = ({ initial, onDone, editing }) => {
  const [f, setF] = useState(initial);
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });
  const save = async () => {
    if (!f.chat_id || (!editing && !f.bot_token)) return toast.error("Bot token and chat ID are required");
    try {
      const body = { ...f, min_discount: Number(f.min_discount) || 0, stores: typeof f.stores === "string" ? f.stores.split(",").map((s) => s.trim()).filter(Boolean) : f.stores };
      editing ? await api.put(`/destinations/${editing}`, body) : await api.post("/destinations", body);
      toast.success(editing ? "Channel updated" : "Channel added");
      onDone();
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {editing && (
        <div data-testid="editing-banner" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 sm:col-span-2">
          <span>You are <b>editing</b> “{initial.name}”. Saving will change this channel, not add a new one.</span>
          <Button type="button" size="sm" className={ghostBtn} onClick={onDone} data-testid="switch-to-add-button">+ Add a new one instead</Button>
        </div>
      )}
      <div><Label className="text-xs text-slate-600">Name (optional, just for you)</Label>
        <Input data-testid="add-destination-name-input" value={f.name} onChange={set("name")} placeholder="SuperCoin Loot Channel" className={fieldCls} /></div>
      <div><Label className="text-xs text-slate-600">Chat ID / @channel</Label>
        <Input data-testid="add-destination-chat-id-input" value={f.chat_id} onChange={set("chat_id")} placeholder="@mychannel or -100123456789" className={fieldCls} /></div>
      <div className="sm:col-span-2"><Label className="text-xs text-slate-600">Bot token {editing && "(leave empty to keep current)"}</Label>
        <Input data-testid="add-destination-bot-token-input" type="password" value={f.bot_token} onChange={set("bot_token")} placeholder="123456:ABC-DEF…" className={fieldCls} /></div>
      <div className="sm:col-span-2"><ChatFinder token={f.bot_token} destId={editing} onPick={(id) => setF({ ...f, chat_id: id })} /></div>
      <div className="sm:col-span-2"><Label className="mb-2 block text-xs text-slate-600">Send these deal types (none selected = all types)</Label>
        <CatPicker value={f.categories} onChange={set("categories")} /></div>
      <div><Label className="text-xs text-slate-600">Minimum discount % (0 = any)</Label>
        <Input data-testid="add-destination-min-discount-input" type="number" value={f.min_discount} onChange={set("min_discount")} className={fieldCls} /></div>
      <div><Label className="text-xs text-slate-600">Only stores (comma separated, empty = all)</Label>
        <Input data-testid="add-destination-stores-input" value={Array.isArray(f.stores) ? f.stores.join(", ") : f.stores} onChange={set("stores")} placeholder="Flipkart, Amazon" className={fieldCls} /></div>
      <div className="flex gap-2 sm:col-span-2">
        <Button data-testid="add-destination-submit-button" className={primaryBtn} onClick={save}>{editing ? "Save changes" : "Add channel"}</Button>
        {editing && <Button className={ghostBtn} onClick={onDone} data-testid="cancel-edit-destination-button">Cancel</Button>}
      </div>
    </div>
  );
};

const DestRow = ({ d, reload, onEdit }) => {
  const test = async () => {
    try { await api.post(`/destinations/${d.id}/test`); toast.success("Test message sent"); }
    catch (e) { toast.error(errMsg(e)); }
  };
  const recent = async () => {
    try {
      toast.info("Sending recent matching deals…");
      const { data } = await api.post(`/destinations/${d.id}/send-recent`);
      data.matched ? toast.success(`Sent ${data.sent} of ${data.matched} deals from the last ${data.window_minutes} min`)
        : toast.error(`No new matching deals in the last ${data.window_minutes} min (channels are quiet, or they were already sent)`);
      reload();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const toggle = async (v) => { await api.put(`/destinations/${d.id}`, { ...d, bot_token: "", enabled: v }); reload(); };
  const remove = async () => { await api.delete(`/destinations/${d.id}`); toast.success("Channel removed"); reload(); };
  return (
    <div data-testid={`destination-row-${d.id}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-[#F5F2EA] p-3">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{d.name} <span className="font-mono text-xs text-slate-500">{d.chat_id}</span></p>
        <p className="font-mono text-[11px] text-slate-500">
          token {d.bot_token_masked} · {d.categories.length ? d.categories.map((c) => CATS[c]?.short).join(", ") : "all types"}
          {d.min_discount > 0 && ` · ≥${d.min_discount}%`}{d.stores?.length > 0 && ` · ${d.stores.join(", ")}`}
        </p>
      </div>
      <Switch data-testid={`destination-toggle-${d.id}`} checked={d.enabled} onCheckedChange={toggle} />
      <Button size="sm" className={ghostBtn} onClick={test} data-testid={`destination-test-${d.id}`}><Send className="h-4 w-4" /></Button>
      <Button size="sm" className={`${ghostBtn} text-xs`} onClick={recent} data-testid={`destination-send-recent-${d.id}`} title="Send recent matching deals now">Send recent</Button>
      <Button size="sm" className={ghostBtn} onClick={() => onEdit(d)} data-testid={`destination-edit-${d.id}`}><Pencil className="h-4 w-4" /></Button>
      <Button size="sm" className={ghostBtn} onClick={remove} data-testid={`destination-delete-${d.id}`}><Trash2 className="h-4 w-4" /></Button>
    </div>
  );
};

export const DestinationsTab = () => {
  const [list, setList] = useState([]);
  const [edit, setEdit] = useState(null);
  const [formKey, setFormKey] = useState(0);
  const load = () => api.get("/destinations").then((r) => setList(r.data));
  useEffect(() => { load(); }, []);
  const done = () => { setEdit(null); setFormKey((k) => k + 1); load(); };
  const startEdit = (d) => {
    setEdit(d);
    toast.info(`Editing ${d.name} — change the fields and tap Save changes`);
    setTimeout(() => document.querySelector('[data-testid="destination-form-panel"]')?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      <Panel testid="destination-form-panel" title={edit ? `Edit ${edit.name}` : "Add Telegram channel"}
        desc={edit ? "Editing — the bot token stays the same unless you paste a new one." : "Send deals to a channel or straight to your own Telegram chat. Each one can get its own kind of deals."}>
        <DestForm key={edit?.id || formKey} initial={edit ? { ...edit, bot_token: "" } : EMPTY} editing={edit?.id} onDone={done} />
      </Panel>
      <Panel testid="destinations-list-panel" title="Your channels" desc="Tap the send icon to post a test message.">
        <div className="space-y-2">
          {list.map((d) => <div key={d.id} className={edit?.id === d.id ? "rounded-xl ring-2 ring-amber-400" : ""}><DestRow d={d} reload={load} onEdit={startEdit} /></div>)}
          {list.length === 0 && <p data-testid="destinations-empty" className="text-sm text-slate-500">No channels yet — add one to start posting.</p>}
        </div>
      </Panel>
    </div>
  );
};
