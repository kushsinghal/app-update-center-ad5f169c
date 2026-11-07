// @ts-nocheck — ported from the original app
import { useState } from "react";
import { ExternalLink, Copy, Star, LineChart, TrendingDown, Link2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { api, CATS, inr, timeAgo } from "@/lib/api";
import { PriceHistoryDialog } from "@/components/PriceHistoryDialog";
import { OriginalPostDialog } from "@/components/OriginalPostDialog";
import { copyDeal, shareDeal, previewUrl } from "@/lib/share";
import { OffersBox } from "@/components/OffersBox";

const Thumb = ({ deal }) =>
  deal.image ? (
    <img src={deal.image} alt={deal.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
  ) : (
    <div className="grid h-full w-full place-items-center bg-gradient-to-br from-slate-100 to-slate-200">
      <span className="font-display text-5xl font-black text-slate-300">{deal.store?.[0] || "D"}</span>
    </div>
  );

const iconBtn = "grid shrink-0 place-items-center rounded-xl border border-slate-300 px-2.5 transition-colors hover:bg-slate-200";

export const DealCard = ({ deal, index = 0, onChange }) => {
  const [starred, setStarred] = useState(!!deal.featured);
  const [chart, setChart] = useState(false);
  const link = deal.affiliate_url || deal.url;
  const visibleCategories = [...new Set((deal.categories || []).map((category) =>
    category === "loot" || category === "heavy_discount" ? "loot_price_drop" : category,
  ))];
  const shareData = { title: deal.title, price: deal.price, mrp: deal.mrp, discount: deal.discount, store: deal.store, image: deal.image, link, preview: previewUrl(`d/${deal.id}`), offers: deal.offers, store_price: deal.store_price };
  const toggleStar = async () => {
    const next = !starred;
    setStarred(next);
    try {
      await api.put(`/deals/${deal.id}/feature`, { featured: next });
      toast.success(next ? "Starred" : "Star removed");
      onChange?.();
    } catch {
      setStarred(!next);
      toast.error("Could not update star");
    }
  };
  const [post, setPost] = useState(false);
  return (
    <article
      data-testid={`deal-card-${deal.id}`}
      className="rise group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.12)] transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-16px_rgba(15,23,42,0.25)]"
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <Thumb deal={deal} />
        <span className="absolute left-3 top-3 rounded-md bg-white/90 px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-slate-800">{deal.store}</span>
        <button onClick={toggleStar} data-testid={`star-deal-button-${deal.id}`} aria-label="Star deal"
          className="absolute bottom-3 right-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 transition-transform hover:scale-110">
          <Star className={`h-4 w-4 ${starred ? "fill-[#FFC200] text-[#B7791F]" : "text-slate-700"}`} />
        </button>
        {deal.lowest_ever && (
          <span data-testid={`deal-lowest-${deal.id}`} className="absolute bottom-3 left-3 flex items-center gap-1 rounded-md bg-emerald-500 px-2 py-1 text-[11px] font-bold text-[#0A0E17]">
            <TrendingDown className="h-3 w-3" /> Lowest ever
          </span>
        )}
        {deal.discount > 0 && (
          <span data-testid="deal-discount" className="absolute right-3 top-3 rounded-md bg-[#FF5A1F] px-2.5 py-1 font-display text-xs font-extrabold text-white shadow-sm">
            {Math.round(deal.discount)}% OFF
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap gap-1.5">
          {visibleCategories.map((c) => (
            <span key={c} className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${CATS[c === "loot_price_drop" ? "loot" : c]?.cls || ""}`}>{c === "loot_price_drop" ? "Loot / Errors & Price Drop" : CATS[c]?.short || c}</span>
          ))}
        </div>
        <h3 className="line-clamp-2 text-base font-semibold leading-snug text-slate-900">{deal.title}</h3>
        <div className="flex items-baseline gap-2">
          {deal.price ? <span className="font-display text-2xl font-extrabold text-slate-900">{inr(deal.price)}</span> : <span className="text-sm text-slate-600">Price on store</span>}
          {deal.mrp > deal.price && <span className="text-sm text-slate-500 line-through">{inr(deal.mrp)}</span>}
        </div>
        <OffersBox deal={deal} />
        <p data-testid={`deal-posted-${deal.id}`} className="font-mono text-[11px] text-slate-500">
          {deal.source} · posted {timeAgo(deal.posted_at || deal.created_at)}
        </p>
        <div className="mt-auto flex gap-1.5 pt-1">
          <a href={link} target="_blank" rel="noopener noreferrer" data-testid={`grab-deal-button-${deal.id}`}
            className="flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-slate-900 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#FF5A1F]">
            Grab <ExternalLink className="h-4 w-4" />
          </a>
          <button onClick={() => setChart(true)} data-testid={`price-history-button-${deal.id}`} aria-label="Price history" className={`${iconBtn} text-emerald-700`}>
            <LineChart className="h-4 w-4" />
          </button>
          <button onClick={() => copyDeal(shareData)} data-testid={`copy-deal-link-button-${deal.id}`} aria-label="Copy deal details" title="Copy name, MRP, deal price + link" className={`${iconBtn} text-slate-700`}>
            <Copy className="h-4 w-4" />
          </button>
          <button onClick={() => shareDeal(shareData)} data-testid={`share-deal-button-${deal.id}`} aria-label="Share deal" title="Share to any app" className={`${iconBtn} text-[#FF5A1F]`}>
            <Share2 className="h-4 w-4" />
          </button>
          {deal.source_post_url ? (
            <button onClick={() => setPost(true)} data-testid={`original-post-button-${deal.id}`} aria-label="Original post" title="See the original post"
              className={`${iconBtn} text-[#229ED9]`}>
              <Link2 className="h-4 w-4" />
            </button>
          ) : (
            <span className={`${iconBtn} cursor-not-allowed text-slate-300`} title="Added by hand — no original post"><Link2 className="h-4 w-4" /></span>
          )}
        </div>
      </div>
      <PriceHistoryDialog deal={deal} open={chart} onOpenChange={setChart} />
      {post && <OriginalPostDialog deal={deal} open={post} onOpenChange={setPost} />}
    </article>
  );
};
