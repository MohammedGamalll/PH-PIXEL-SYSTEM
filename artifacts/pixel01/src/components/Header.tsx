import { Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import { Languages, Menu, X } from "lucide-react";
import { useState } from "react";

export function Header() {
  const { t, lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);

  const links = [
    { to: "/features", label: t("nav.features") },
    { to: "/about", label: t("nav.about") },
    { to: "/contact", label: t("nav.contact") },
  ] as const;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-lg">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center">
          <Logo />
        </Link>

        <nav className="hidden md:flex items-center gap-7">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="text-sm font-medium text-muted-foreground transition-smooth hover:text-foreground"
              activeProps={{ className: "text-foreground" }}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLang(lang === "ar" ? "en" : "ar")}
            className="gap-1.5"
          >
            <Languages className="h-4 w-4" />
            {t("lang.switch")}
          </Button>
          <Link to="/login">
            <Button size="sm" className="bg-gradient-primary shadow-soft hover:shadow-elegant transition-smooth">
              {t("nav.login")}
            </Button>
          </Link>
        </div>

        <button
          className="md:hidden p-2"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-border bg-background">
          <div className="container mx-auto px-4 py-4 flex flex-col gap-3">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className="text-sm font-medium py-1.5"
              >
                {l.label}
              </Link>
            ))}
            <div className="flex gap-2 pt-2 border-t border-border">
              <Button variant="ghost" size="sm" onClick={() => setLang(lang === "ar" ? "en" : "ar")} className="gap-1.5">
                <Languages className="h-4 w-4" /> {t("lang.switch")}
              </Button>
            </div>
            <div className="flex gap-2">
              <Link to="/login" className="flex-1" onClick={() => setOpen(false)}>
                <Button size="sm" className="w-full bg-gradient-primary">{t("nav.login")}</Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
