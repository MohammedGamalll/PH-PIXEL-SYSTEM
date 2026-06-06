import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";
import { Mail, Phone, MapPin } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "اتصل بنا — PIXEL01" },
      { name: "description", content: "تواصل مع فريق PIXEL01 — نرد خلال 24 ساعة." },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const { t } = useI18n();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("تم إرسال رسالتك");
    (e.target as HTMLFormElement).reset();
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <section className="py-20 bg-gradient-soft">
        <div className="container mx-auto px-4 text-center max-w-2xl">
          <h1 className="text-4xl md:text-5xl font-extrabold mb-4">{t("contact.title")}</h1>
          <p className="text-muted-foreground text-lg">{t("contact.subtitle")}</p>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="space-y-4">
              {[
                { icon: Mail, label: t("contact.email_us"), value: "hello@pixeltest.app" },
                { icon: Phone, label: t("contact.call_us"), value: "+971 4 000 0000" },
                { icon: MapPin, label: t("contact.visit"), value: "Dubai, UAE" },
              ].map((c, i) => (
                <Card key={i} className="p-5 flex items-center gap-4">
                  <div className="h-10 w-10 rounded-xl bg-gradient-primary flex items-center justify-center shrink-0">
                    <c.icon className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{c.label}</div>
                    <div className="font-medium text-sm">{c.value}</div>
                  </div>
                </Card>
              ))}
            </div>

            <Card className="lg:col-span-2 p-8">
              <form onSubmit={onSubmit} className="space-y-5">
                <div>
                  <Label htmlFor="name">{t("contact.name")}</Label>
                  <Input id="name" required maxLength={100} className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="email">{t("contact.email")}</Label>
                  <Input id="email" type="email" required maxLength={255} className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="message">{t("contact.message")}</Label>
                  <Textarea id="message" required maxLength={1000} rows={5} className="mt-1.5" />
                </div>
                <Button type="submit" className="bg-gradient-primary shadow-soft">
                  {t("contact.send")}
                </Button>
              </form>
            </Card>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
