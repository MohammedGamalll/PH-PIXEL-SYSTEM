import { Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { Logo } from "./Logo";

export function Footer() {
  const { t } = useI18n();

  return (
    <footer className="border-t border-border bg-muted/30 mt-24">
      <div className="container mx-auto px-4 py-14">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="space-y-4">
            <Logo />
            <p className="text-sm text-muted-foreground max-w-xs">
              {t("hero.subtitle")}
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-4">{t("footer.product")}</h4>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li><Link to="/features" className="hover:text-foreground transition-smooth">{t("nav.features")}</Link></li>
              <li><Link to="/login" className="hover:text-foreground transition-smooth">{t("nav.login")}</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-4">{t("footer.company")}</h4>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li><Link to="/about" className="hover:text-foreground transition-smooth">{t("nav.about")}</Link></li>
              <li><Link to="/contact" className="hover:text-foreground transition-smooth">{t("nav.contact")}</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-4">{t("footer.legal")}</h4>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li><a className="hover:text-foreground transition-smooth" href="#">{t("footer.terms")}</a></li>
              <li><a className="hover:text-foreground transition-smooth" href="#">{t("footer.privacy")}</a></li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-border text-sm text-muted-foreground text-center">
          {t("footer.rights")}
        </div>
      </div>
    </footer>
  );
}
