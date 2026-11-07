import { Link } from "@tanstack/react-router";
import { Zap, LayoutDashboard, Flame } from "lucide-react";

const base = "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-200";
const active = "bg-slate-900 text-white";
const idle = "text-slate-700 hover:bg-slate-100 hover:text-slate-950";

export const Navbar = () => (
  <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-xl">
    <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-8">
      <Link to="/" data-testid="brand-logo-link" className="flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#FF5A1F] text-white">
          <Zap className="h-5 w-5" strokeWidth={2.5} />
        </span>
        <span className="font-display text-xl font-extrabold tracking-tight">
          Deal<span className="text-[#FF5A1F]">Loot</span>
        </span>
      </Link>
      <nav className="flex items-center gap-1">
        <Link to="/" activeOptions={{ exact: true }} className={base} activeProps={{ className: active }} inactiveProps={{ className: idle }} data-testid="public-deals-nav-link">
          <Flame className="h-4 w-4" /> <span className="hidden sm:inline">Deals</span>
        </Link>
        <Link to="/admin" className={base} activeProps={{ className: active }} inactiveProps={{ className: idle }} data-testid="admin-dashboard-nav-link">
          <LayoutDashboard className="h-4 w-4" /> <span className="hidden sm:inline">Control Room</span>
        </Link>
      </nav>
    </div>
  </header>
);
