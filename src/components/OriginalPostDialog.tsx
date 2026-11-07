// @ts-nocheck — ported from the original app
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Send, Globe, Wand2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";

const fmt = (t) => new Date(t).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export const OriginalPostDialog = ({ deal, open, onOpenChange }) => {
  const [p, setP] = useState(null);
  const navigate = useNavigate();
  useEffect(() => {
    if (!open) return;
    setP(null);
    api.get(`/deals/${deal.id}/original`).then((r) => setP(r.data)).catch(() => setP({}));
  }, [open, deal.id]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="original-post-dialog" className="max-h-[90vh] max-w-lg overflow-y-auto border-slate-200 bg-white text-slate-900">
        <DialogHeader>
          <DialogTitle className="text-base">Original post · {deal.source}</DialogTitle>
          <DialogDescription data-testid="original-post-time" className="font-mono text-xs text-slate-500">
            {p?.posted_at ? `Posted ${fmt(p.posted_at)}` : "Loading…"}
          </DialogDescription>
        </DialogHeader>
        {p?.image && <img src={p.image} alt="" className="max-h-64 w-full rounded-xl object-contain bg-slate-50" />}
        <pre data-testid="original-post-text" className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 font-sans text-sm text-slate-800">{p?.text || "…"}</pre>
        <div className="flex flex-wrap gap-2">
          {p?.text && /https?:\/\//.test(p.text) && (
            <button data-testid="convert-post-links-button" onClick={() => { localStorage.setItem("bulk_prefill", p.text); navigate({ to: "/admin" }); }}
              className="flex items-center gap-2 rounded-xl bg-[#FF5A1F] px-4 py-2 text-sm font-bold text-white hover:bg-[#ff6d38]">
              <Wand2 className="h-4 w-4" /> Convert all links to mine
            </button>
          )}
          {p?.app_url && (
            <a href={p.app_url} data-testid="open-in-telegram-app" className="flex items-center gap-2 rounded-xl bg-[#229ED9] px-4 py-2 text-sm font-bold text-white hover:bg-[#1b8cc2]">
              <Send className="h-4 w-4" /> Open in Telegram app
            </a>
          )}
          {p?.web_url && (
            <a href={p.web_url} target="_blank" rel="noopener noreferrer" data-testid="open-on-web" className="flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
              <Globe className="h-4 w-4" /> Open on web
            </a>
          )}
        </div>
        <p className="text-[11px] text-slate-500">If the web link doesn't open, your internet provider may be blocking t.me. Use "Open in Telegram app" instead.</p>
      </DialogContent>
    </Dialog>
  );
};
