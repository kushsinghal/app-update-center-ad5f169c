// @ts-nocheck — ported from the original app
import { CreditCard, Ticket, Coins, Wallet } from "lucide-react";
import { inr } from "@/lib/api";

const ICONS = { bank: CreditCard, coupon: Ticket, supercoin: Coins, cashback: Wallet };

export const OffersBox = ({ deal }) => {
  const offers = deal.offers || [];
  const showStore = deal.store_price && deal.price && deal.store_price > deal.price;
  if (!offers.length && !showStore) return null;
  return (
    <div data-testid={`deal-offers-${deal.id}`} className="space-y-1.5 rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-2.5">
      {showStore && (
        <p data-testid={`deal-store-price-${deal.id}`} className="text-xs font-semibold text-slate-700">
          Store {inr(deal.store_price)} → <span className="text-emerald-700">you pay {inr(deal.price)}</span>
          <span className="text-slate-500"> (save {inr(deal.store_price - deal.price)})</span>
        </p>
      )}
      {offers.map((o, i) => {
        const Icon = ICONS[o.kind] || Ticket;
        if (o.best) return (
          <p key={i} data-testid={`deal-best-card-${deal.id}`} className="flex items-start gap-1.5 rounded-lg bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-800">
            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {o.wallet ? "Best payment offer" : "Best card offer"} (full payment): {o.label}{o.saving ? ` · save ${inr(o.saving)}` : ""}
          </p>
        );
        return (
          <p key={i} className={`flex items-start gap-1.5 text-xs ${o.kind === "supercoin" ? "font-bold text-purple-700" : "text-slate-700"}`}>
            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {o.label}
          </p>
        );
      })}
    </div>
  );
};
