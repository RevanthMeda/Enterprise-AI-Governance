import { useState } from "react";
import { Menu, X } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand-mark";

const marketingLinks = [
  { label: "Product", href: "/welcome#product" },
  { label: "Solutions", href: "/welcome#solutions" },
  { label: "Frameworks", href: "/welcome#frameworks" },
  { label: "How it Works", href: "/welcome#how-it-works" },
  { label: "Pricing", href: "/welcome#pricing" },
  { label: "FAQ", href: "/welcome#faq" },
  { label: "Trust Center", href: "/trust-center" },
  { label: "Docs", href: "/api-docs" },
];

export function PublicSiteHeader() {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/95 text-foreground backdrop-blur supports-[backdrop-filter]:bg-background/90" data-testid="public-site-header">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <a href="/welcome" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
            <BrandMark className="h-4 w-4" />
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-semibold tracking-tight">AI Control Tower</span>
            <span className="text-[11px] text-muted-foreground">Enterprise Governance</span>
          </div>
        </a>

        <nav className="hidden items-center gap-6 lg:flex">
          {marketingLinks.map((item) => {
            const active = location === item.href || (item.href.startsWith("/welcome#") && location === "/welcome");
            return (
              <a
                key={item.label}
                href={item.href}
                className={`text-sm transition-colors hover:text-foreground ${active ? "font-medium text-foreground" : "text-muted-foreground"}`}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Button asChild variant="ghost">
            <a href="/auth/login">Sign In</a>
          </Button>
          <Button asChild className="rounded-full px-5">
            <a href="/book-demo">Book a Demo</a>
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
              <a
                key={item.label}
                href={item.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </a>
            ))}
            <div className="mt-2 flex flex-col gap-2">
              <Button asChild variant="outline">
                <a href="/auth/login" onClick={() => setMobileOpen(false)}>Sign In</a>
              </Button>
              <Button asChild>
                <a href="/book-demo" onClick={() => setMobileOpen(false)}>Book a Demo</a>
              </Button>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
