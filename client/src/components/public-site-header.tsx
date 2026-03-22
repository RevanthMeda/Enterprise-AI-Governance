import { useMemo, useState } from "react";
import { Menu, X } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand-mark";
import { usePageCopy } from "@/lib/page-copy";
import { useWorkspaceCopy } from "@/lib/workspace-copy";

export function PublicSiteHeader() {
  const [location, navigate] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pageCopy = usePageCopy();
  const workspaceCopy = useWorkspaceCopy();
  const landingBadges = pageCopy.landing.badges ?? {};
  const marketingLinks = useMemo(
    () => [
      { label: landingBadges.productNav ?? "Product", href: "/welcome#product" },
      { label: landingBadges.solutionsNav ?? "Solutions", href: "/welcome#solutions" },
      { label: landingBadges.frameworksNav ?? "Frameworks", href: "/welcome#frameworks" },
      { label: "How it Works", href: "/welcome#how-it-works" },
      { label: "FAQ", href: "/welcome#faq" },
      { label: landingBadges.pricingNav ?? "Pricing", href: "/welcome#pricing" },
      { label: landingBadges.trustCenterNav ?? pageCopy.trustCenter.badges?.trustCenter ?? pageCopy.trustCenter.title, href: "/trust-center" },
      { label: landingBadges.docsNav ?? pageCopy.apiDocs.title, href: "/api-docs" },
    ],
    [landingBadges, pageCopy.apiDocs.title, pageCopy.trustCenter.badges, pageCopy.trustCenter.title],
  );

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/95 text-foreground backdrop-blur supports-[backdrop-filter]:bg-background/90" data-testid="public-site-header">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/welcome" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
            <BrandMark className="h-4 w-4" />
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-semibold tracking-tight">{workspaceCopy.appName}</span>
            <span className="text-[11px] text-muted-foreground">{workspaceCopy.appTagline}</span>
          </div>
        </Link>

        <nav className="hidden items-center gap-6 lg:flex">
          {marketingLinks.map((item) => {
            const active = location === item.href || (item.href.startsWith("/welcome#") && location === "/welcome");
            const content = (
              <span className={`text-sm transition-colors hover:text-foreground ${active ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                {item.label}
              </span>
            );
            return (
              item.href.startsWith("/welcome#") ? (
                <a key={item.label} href={item.href}>
                  {content}
                </a>
              ) : (
                <Link key={item.label} href={item.href}>
                  {content}
                </Link>
              )
            );
          })}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Button variant="ghost" onClick={() => navigate("/auth/login")}>
            {landingBadges.signIn ?? "Sign In"}
          </Button>
          <Button className="rounded-full px-5" onClick={() => navigate("/book-demo")}>
            {landingBadges.bookDemo ?? "Book a Demo"}
          </Button>
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border text-muted-foreground lg:hidden"
          onClick={() => setMobileOpen((current) => !current)}
          aria-label="Toggle navigation"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen ? (
        <div className="border-t border-border bg-background px-4 py-4 sm:px-6 lg:hidden">
          <nav className="flex flex-col gap-3">
            {marketingLinks.map((item) => (
              item.href.startsWith("/welcome#") ? (
                <a
                  key={item.label}
                  href={item.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => setMobileOpen(false)}
                >
                  {item.label}
                </a>
              ) : (
                <Link
                  key={item.label}
                  href={item.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => setMobileOpen(false)}
                >
                  {item.label}
                </Link>
              )
            ))}
            <div className="mt-2 flex flex-col gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setMobileOpen(false);
                  navigate("/auth/login");
                }}
              >
                {landingBadges.signIn ?? "Sign In"}
              </Button>
              <Button
                onClick={() => {
                  setMobileOpen(false);
                  navigate("/book-demo");
                }}
              >
                {landingBadges.bookDemo ?? "Book a Demo"}
              </Button>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
