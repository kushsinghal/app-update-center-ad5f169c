// @ts-nocheck — ported from the original app
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Panel, fieldCls, primaryBtn } from "./Panel";

const Row = ({ label, desc, checked, onToggle, testid, children }) => (
  <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-[#F5F2EA] p-4">
    <Switch data-testid={testid} checked={!!checked} onCheckedChange={onToggle} />
    <div className="min-w-0 flex-1">
      <p className="font-semibold">{label}</p>
      <p className="text-xs text-slate-500">{desc}</p>
    </div>
    {children}
  </div>
);

export const RulesTab = () => {
  const [s, setS] = useState(null);
  useEffect(() => { api.get("/settings").then((r) => setS({ ...r.data, keywordsText: (r.data.keywords || []).join(", ") })); }, []);
  if (!s) return null;
  const set = (k) => (v) => setS({ ...s, [k]: v?.target ? v.target.value : v });
  const save = async () => {
    try { await api.put("/settings", {
      auto_post: s.auto_post, split_multi: s.split_multi !== false, gold_enabled: s.gold_enabled !== false, supercoin_enabled: s.supercoin_enabled, giftcard_enabled: s.giftcard_enabled,
      giftcard_min: Number(s.giftcard_min), product_enabled: s.product_enabled, product_min: Number(s.product_min),
      loot_enabled: s.loot_enabled, post_style: s.post_style || "simple", check_interval_seconds: Number(s.check_interval_seconds),
      website_max_age_hours: Math.max(Number(s.website_max_age_hours) || 1, 1), telegram_max_age_minutes: Math.max(Number(s.telegram_max_age_minutes) || 1, 1),
      max_posts_per_update: Math.min(Math.max(Number(s.max_posts_per_update) || 20, 1), 200), keywords: s.keywordsText.split(",").map((k) => k.trim()).filter(Boolean),
    }); toast.success("Rules saved"); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Panel testid="rules-panel" title="What counts as a deal" desc="Only posts that match at least one rule are saved and sent to your channels.">
      <div className="space-y-3">
        <Row testid="rule-auto-post-switch" label="Auto-post to Telegram" desc="Send matching deals to your channels as soon as they're found" checked={s.auto_post} onToggle={set("auto_post")} />
        <Row testid="rule-split-multi-switch" label="Split posts with many links" desc="A post with several product links becomes one deal per product (up to 10), each with its own picture and your link" checked={s.split_multi !== false} onToggle={set("split_multi")} />
        <div className="rounded-xl border border-slate-200 bg-[#F5F2EA] p-4">
          <p className="font-semibold">Telegram post style</p>
          <p className="mb-2 text-xs text-slate-500">Simple = product photo + bold title + your link (like big deal channels). Detailed = adds headline, MRP, % off and store.</p>
          <Select value={s.post_style || "simple"} onValueChange={set("post_style")}>
            <SelectTrigger data-testid="rule-post-style-select" className={fieldCls}><SelectValue /></SelectTrigger>
            <SelectContent className="border-slate-200 bg-white text-slate-900">
              <SelectItem value="simple">Simple (photo + title + link)</SelectItem>
              <SelectItem value="detailed">Detailed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-[#F5F2EA] p-4">
            <p className="font-semibold">Check for deals every</p>
            <p className="mb-2 text-xs text-slate-500">How often all sources are scanned</p>
            <Select value={String(s.check_interval_seconds)} onValueChange={set("check_interval_seconds")}>
              <SelectTrigger data-testid="rule-interval-select" className={fieldCls}><SelectValue /></SelectTrigger>
              <SelectContent className="border-slate-200 bg-white text-slate-900">
                {[30, 60, 120, 300, 600, 900, 1800, 3600].map((m) => (
                  <SelectItem key={m} value={String(m)}>{m < 60 ? `${m} seconds` : m < 3600 ? `${m / 60} minute${m > 60 ? "s" : ""}` : "1 hour"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-xl border border-slate-200 bg-[#F5F2EA] p-4">
            <p className="font-semibold">Max deals posted per update</p>
            <p className="mb-2 text-xs text-slate-500">Between 1 and 200. Extra deals still show on the website.</p>
            <Input data-testid="rule-max-posts-input" type="number" min={1} max={200} value={s.max_posts_per_update} onChange={set("max_posts_per_update")} className={fieldCls} />
          </div>
          <div className="rounded-xl border border-slate-200 bg-[#F5F2EA] p-4">
            <p className="font-semibold">Show on website if posted within</p>
            <p className="mb-2 text-xs text-slate-500">Older posts from sources are ignored (hours)</p>
            <Input data-testid="rule-website-age-input" type="number" min={1} value={s.website_max_age_hours} onChange={set("website_max_age_hours")} className={fieldCls} />
          </div>
          <div className="rounded-xl border border-slate-200 bg-[#F5F2EA] p-4">
            <p className="font-semibold">Send to Telegram if posted within</p>
            <p className="mb-2 text-xs text-slate-500">Only fresh deals go to your channels (minutes)</p>
            <Input data-testid="rule-telegram-age-input" type="number" min={1} value={s.telegram_max_age_minutes} onChange={set("telegram_max_age_minutes")} className={fieldCls} />
          </div>
        </div>
        <Row testid="rule-supercoin-switch" label="Flipkart 100% SuperCoin" desc="Posts mentioning 100% off with SuperCoins" checked={s.supercoin_enabled} onToggle={set("supercoin_enabled")} />
        <Row testid="rule-gold-switch" label="Gold & Silver deals" desc="Gold/silver coins, bars, jewellery and digital gold (24K, 22K, MMTC, Augmont, Tanishq…)" checked={s.gold_enabled !== false} onToggle={set("gold_enabled")} />
        <Row testid="rule-giftcard-switch" label="Gift card discounts" desc="Gift cards / vouchers at or above this discount" checked={s.giftcard_enabled} onToggle={set("giftcard_enabled")}>
          <div className="flex items-center gap-2"><Input data-testid="rule-giftcard-min-input" type="number" value={s.giftcard_min} onChange={set("giftcard_min")} className={`${fieldCls} w-20`} /><span className="text-sm text-slate-600">% off</span></div>
        </Row>
        <Row testid="rule-product-switch" label="Price drop deals" desc="Any product at or above this discount (default 70%)" checked={s.product_enabled} onToggle={set("product_enabled")}>
          <div className="flex items-center gap-2"><Input data-testid="rule-product-min-input" type="number" value={s.product_min} onChange={set("product_min")} className={`${fieldCls} w-20`} /><span className="text-sm text-slate-600">% off</span></div>
        </Row>
        <Row testid="rule-loot-switch" label="Loot & price errors" desc="Posts with words like loot, price error, bug, glitch" checked={s.loot_enabled} onToggle={set("loot_enabled")} />
        <div className="rounded-xl border border-slate-200 bg-[#F5F2EA] p-4">
          <p className="font-semibold">Extra keywords</p>
          <p className="mb-2 text-xs text-slate-500">Comma separated — any post containing these is treated as a loot deal</p>
          <Input data-testid="rule-keywords-input" value={s.keywordsText} onChange={set("keywordsText")} placeholder="free, ₹1 deal, steal" className={fieldCls} />
        </div>
        <Button data-testid="rules-save-button" className={primaryBtn} onClick={save}>Save rules</Button>
      </div>
    </Panel>
  );
};
