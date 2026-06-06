import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { Sparkles, Eye, Award } from "lucide-react";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "عن PIXEL01" },
      { name: "description", content: "نبني أدوات لمن يبني — تعرف على قصة PIXEL01 وقيمنا." },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  const { t } = useI18n();
  const values = [
    { icon: Sparkles, k: "v1" },
    { icon: Eye, k: "v2" },
    { icon: Award, k: "v3" },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <section className="py-20 bg-gradient-soft">
        <div className="container mx-auto px-4 text-center max-w-3xl">
          <h1 className="text-4xl md:text-5xl font-extrabold mb-6">{t("about.title")}</h1>
          <p className="text-muted-foreground text-lg leading-relaxed mb-4">{t("about.p1")}</p>
          <p className="text-muted-foreground text-lg leading-relaxed">{t("about.p2")}</p>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">{t("about.values")}</h2>
          <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
            {values.map(({ icon: Icon, k }) => (
              <Card key={k} className="p-7 text-center hover:shadow-soft transition-smooth">
                <div className="h-14 w-14 mx-auto rounded-2xl bg-gradient-primary flex items-center justify-center shadow-soft mb-5">
                  <Icon className="h-6 w-6 text-primary-foreground" />
                </div>
                <h3 className="font-bold text-lg mb-2">{t(`about.${k}.title`)}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{t(`about.${k}.desc`)}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
