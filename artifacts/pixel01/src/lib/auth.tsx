import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { logAuthEvent } from "@/lib/activity.functions";

type AuthCtx = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let lastUserId: string | null = null;
    // Set listener FIRST
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setUser(s?.user ?? null);

      // Log auth events (deferred so the supabase call doesn't deadlock the listener)
      const ua = typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null;
      if (event === "SIGNED_IN" && s?.user && s.user.id !== lastUserId) {
        lastUserId = s.user.id;
        setTimeout(() => {
          logAuthEvent({ data: { action_type: "sign_in", user_agent: ua } }).catch(() => {});
        }, 0);
      } else if (event === "SIGNED_OUT") {
        lastUserId = null;
        // Skip server-side logging on SIGNED_OUT: the bearer token is already
        // gone, so requireSupabaseAuth would 401. Log sign_out from signOut() instead.
      }

    });

    // Then read existing session
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      lastUserId = data.session?.user?.id ?? null;
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    try {
      const ua = typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null;
      await logAuthEvent({ data: { action_type: "sign_out", user_agent: ua } }).catch(() => {});
    } catch {}
    await supabase.auth.signOut();
  };


  return <Ctx.Provider value={{ user, session, loading, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

