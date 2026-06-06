import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { FileText, Users, Package, BarChart3, Building2, Cloud } from "lucide-react";

export const Route = createFileRoute("/features")({
  head: () => ({
    meta: [
      { title: "المزايا — PIXEL01" },
      { name: "description", content: "اكتشف كل المزايا التي تجعل PIXEL01 خياراً ذكياً لإدارة عملك." },
    ],
  }),
  component: FeaturesPage,
});

function FeaturesPage() {
  const { t } = useI18n();
  const items = [
    { icon: FileText, k: "invoices" },
    { icon: Users, k: "customers" },
    { icon: Package, k: "inventory" },
    { icon: BarChart3, k: "reports" },
    { icon: Building2, k: "multi" },
    { icon: Cloud, k: "cloud" },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <section className="py-20 bg-gradient-soft">
        <div className="container mx-auto px-4 text-center max-w-2xl">
          <h1 className="text-4xl md:text-5xl font-extrabold mb-4">{t("features.title")}</h1>
          <p className="text-muted-foreground text-lg">{t("features.subtitle")}</p>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid gap-6 md:grid-cols-2 max-w-5xl mx-auto">
            {items.map(({ icon: Icon, k }) => (
              <Card key={k} className="p-7 hover:shadow-soft hover:border-primary/40 transition-smooth">
                <div className="flex gap-5 items-start">
                  <div className="h-12 w-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-soft shrink-0">
                    <Icon className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-2">{t(`features.${k}.title`)}</h3>
                    <p className="text-muted-foreground leading-relaxed">{t(`features.${k}.desc`)}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
