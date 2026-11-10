import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api, errMsg, getToken, TOKEN_KEY } from "@/lib/api";
import AdminPage from "@/views/AdminPage";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Control Room — DealLoot" },
      { name: "description", content: "Manage deal sources, Telegram channels, rules and affiliate links for DealLoot." },
      { property: "og:title", content: "Control Room — DealLoot" },
      { property: "og:description", content: "Manage deal sources, Telegram channels, rules and affiliate links." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminGate,
});

const field = "h-10 rounded-xl border-slate-300 bg-[#F5F2EA] text-slate-900 placeholder:text-slate-400";
const primary = "rounded-xl bg-[#FF5A1F] font-bold text-white hover:bg-[#ff6d38]";

function AdminGate() {
  const [token, setToken] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const sync = () => setToken(getToken());
    sync();
    window.addEventListener("dealloot-auth", sync);
    return () => window.removeEventListener("dealloot-auth", sync);
  }, []);

  const signOut = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  };

  if (token === undefined) return <main className="mx-auto max-w-7xl px-4 py-16 text-sm text-slate-500">Loading…</main>;
  if (!token) return <SignIn onDone={setToken} />;
  return (
    <>
      <div className="mx-auto flex max-w-7xl justify-end px-4 pt-4 sm:px-8">
        <button className="text-xs font-semibold text-slate-500 underline" onClick={signOut}>Sign out</button>
      </div>
      <AdminPage />
    </>
  );
}

function SignIn({ onDone }: { onDone: (t: string) => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post<{ token: string }>("/auth/login", { password });
      localStorage.setItem(TOKEN_KEY, data.token);
      onDone(data.token);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-md px-4 py-12 sm:py-16">
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-[#B7791F]">Control room</p>
      <h1 className="mt-3 text-3xl font-black tracking-tight">Admin sign in</h1>
      <p className="mt-2 text-sm text-slate-600">Only the site admin can manage sources, channels and links.</p>
      <div className="mt-6 rounded-2xl border border-slate-300 bg-white p-6">
        <form onSubmit={submit} className="space-y-3">
          <Input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Admin password" className={field} />
          <Button type="submit" disabled={busy} className={`w-full ${primary}`}>{busy ? "…" : "Sign in"}</Button>
        </form>
      </div>
    </main>
  );
}
