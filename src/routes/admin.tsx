import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
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
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data: d }) => setSession(d.session));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setIsAdmin(null);
      return;
    }
    supabase.rpc("has_role", { _user_id: session.user.id, _role: "admin" }).then(({ data }) => setIsAdmin(!!data));
  }, [session]);

  if (session === undefined || (session && isAdmin === null)) return <main className="mx-auto max-w-7xl px-4 py-16 text-sm text-slate-500">Loading…</main>;
  if (!session) return <SignIn />;
  if (!isAdmin)
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <h1 className="text-2xl font-black">No access</h1>
        <p className="mt-2 text-sm text-slate-600">{session.user.email} is not the admin of this site. The first account created becomes the admin.</p>
        <Button className="mt-6 rounded-xl" variant="outline" onClick={() => supabase.auth.signOut()}>Sign out</Button>
      </main>
    );
  return (
    <>
      <div className="mx-auto flex max-w-7xl justify-end px-4 pt-4 sm:px-8">
        <button className="text-xs font-semibold text-slate-500 underline" onClick={() => supabase.auth.signOut()}>Sign out ({session.user.email})</button>
      </div>
      <AdminPage />
    </>
  );
}

function SignIn() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
        if (error) throw error;
        if (!data.session) toast.success("Check your email to confirm your account, then sign in.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Could not sign in");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/auth/callback` });
    if (r.error) toast.error(r.error.message || "Google sign-in failed");
  };

  return (
    <main className="mx-auto max-w-md px-4 py-12 sm:py-16">
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-[#B7791F]">Control room</p>
      <h1 className="mt-3 text-3xl font-black tracking-tight">{mode === "in" ? "Sign in" : "Create the admin account"}</h1>
      <p className="mt-2 text-sm text-slate-600">Only the site admin can manage sources, channels and links.</p>
      <div className="mt-6 rounded-2xl border border-slate-300 bg-white p-6">
        <button type="button" onClick={google}
          className="flex h-10 w-full items-center justify-center gap-[10px] rounded-xl border border-[#747775] bg-[#FFFFFF] px-3 text-sm font-medium text-[#1F1F1F]">
          <svg aria-hidden="true" width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>
          Continue with Google
        </button>
        <div className="my-5 flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" />or<span className="h-px flex-1 bg-slate-200" /></div>
        <form onSubmit={submit} className="space-y-3">
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={field} />
          <Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className={field} />
          <Button type="submit" disabled={busy} className={`w-full ${primary}`}>{busy ? "…" : mode === "in" ? "Sign in" : "Create account"}</Button>
        </form>
        <button className="mt-4 text-xs font-semibold text-slate-600 underline" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "First time? Create the admin account" : "Already have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
