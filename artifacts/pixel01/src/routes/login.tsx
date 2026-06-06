import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Header } from "@/components/Header";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { z } from "zod";
import loginBg from "@/assets/login-bg.jpg";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — ​" },
      { name: "description", content: "سجّل دخولك إلى نظام ​." },

    ],
  }),
  component: LoginPage,
});

const schema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(100),
});

function LoginPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate({ to: "/dashboard" });
  }, [user, navigate]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = schema.safeParse({
      email: fd.get("email"),
      password: fd.get("password"),
    });
    if (!parsed.success) {
      toast.error("البيانات غير صحيحة");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("مرحباً بعودتك");
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <section
        className="flex-1 flex items-center justify-center py-6 md:py-10 relative"
        style={{
          backgroundImage: `url(${loginBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 0, right: 0, bottom: 0, left: 0,
            backgroundColor: "rgba(255,255,255,0.55)",
          }}
        />
        <div className="container mx-auto px-4 relative" style={{ zIndex: 1 }}>
          <Card className="max-w-md mx-auto p-8 shadow-elegant" style={{ backgroundColor: "rgba(255,255,255,0.97)" }}>
            <div className="text-center mb-7">
              <h1 className="text-2xl font-bold mb-2">{t("auth.login.title")}</h1>
              <p className="text-sm text-muted-foreground">{t("auth.login.subtitle")}</p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <Label htmlFor="email">{t("auth.email")}</Label>
                <Input id="email" name="email" type="email" required autoComplete="email" className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="password">{t("auth.password")}</Label>
                <Input id="password" name="password" type="password" required minLength={8} autoComplete="current-password" className="mt-1.5" />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="remember" />
                <Label htmlFor="remember" className="text-sm font-normal cursor-pointer">{t("auth.remember")}</Label>
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-gradient-primary shadow-soft">
                {loading ? "..." : t("auth.login.cta")}
              </Button>
            </form>

          </Card>
        </div>
      </section>
      <footer className="border-t border-border bg-muted/30 py-3 text-center text-xs text-muted-foreground">
        {t("footer.rights")}
      </footer>
    </div>
  );
}
