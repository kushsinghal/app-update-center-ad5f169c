import { createFileRoute } from "@tanstack/react-router";
import DealsPage from "@/views/DealsPage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DealLoot — Fresh loot deals, found for you" },
      { name: "description", content: "Live 100% SuperCoin, gift card, price-drop, loot and gold deals from India's top deal channels, updated every few minutes." },
      { property: "og:title", content: "DealLoot — Fresh loot deals, found for you" },
      { property: "og:description", content: "Live SuperCoin, gift card, price-drop and loot deals, updated every few minutes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DealsPage,
});
