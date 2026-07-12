import { useEffect, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Menu, X } from "lucide-react";
import { Link } from "wouter";
import { ACTURUS_BRAND } from "@/lib/brand";

export type PublicTheme = "grid" | "acturus";

export const ACTURUS_COLORS = {
  gridInk: "#050914",
  gridSurface: "#0d1526",
  gridBlue: "#3aa7ff",
  gridCyan: "#5eebff",
  gridViolet: "#7b6dff",
  acturusInk: "#090909",
  acturusAubergine: "#111111",
  acturusCream: "#f6f3ee",
  acturusCoral: "#f58227",
  acturusOrchid: "#f8a45e",
  acturusAmber: "#f58227",
} as const;

const SHELL_THEME = {
  grid: {
    header: "border-[#78c9ff]/[0.15] bg-[rgba(3,7,18,0.9)]",
    mark: "border-[#76c9ff]/[0.35] bg-[#3aa7ff]/10 text-[#8dddff] shadow-[inset_0_0_18px_rgba(58,167,255,0.12),0_0_24px_rgba(58,167,255,0.08)] group-hover:bg-[#3aa7ff]/20",
    subtitle: "AI Control Grid",
    subtitleColor: "text-[#aebbd0]",
    nav: "text-[#aebbd0] hover:text-[#8deaff]",
    cta: "border-[#8deaff]/50 bg-[linear-gradient(135deg,#5eebff_0%,#3aa7ff_55%,#7b6dff_100%)] text-[#06101e] shadow-[0_12px_38px_rgba(58,167,255,0.24)] hover:shadow-[0_16px_48px_rgba(94,235,255,0.32)]",
    mobile: "border-[#78c9ff]/[0.15] bg-[#050914]",
    accent: "text-[#8deaff]",
    footer: "border-[#78c9ff]/[0.15] bg-[#030712]",
    footerGlow: "bg-[radial-gradient(circle_at_18%_15%,rgba(58,167,255,0.12),transparent_30%),radial-gradient(circle_at_82%_70%,rgba(123,109,255,0.1),transparent_28%)]",
    footerCopy: "AI CONTROL GRID is the operating layer for visible, controlled, and accountable enterprise AI.",
    kicker: "text-[#9bddff]",
    kickerLine: "bg-[#5eebff]",
    kickerDark: "text-[#2455a8]",
    kickerLineDark: "bg-[#2f73d7]",
  },
  acturus: {
    header: "border-white/10 bg-[rgba(9,9,9,0.88)]",
    mark: "border-[#f58227]/45 bg-[#f58227]/10 text-[#f8a45e] shadow-[inset_0_0_18px_rgba(245,130,39,0.12),0_0_24px_rgba(245,130,39,0.08)] group-hover:bg-[#f58227]/20",
    subtitle: "Company · AI Control Grid",
    subtitleColor: "text-white/45",
    nav: "text-white/60 hover:text-white",
    cta: "border-[#f58227] bg-[#f58227] text-black shadow-[0_12px_38px_rgba(245,130,39,0.2)] hover:bg-[#f8a45e] hover:shadow-[0_16px_48px_rgba(245,130,39,0.28)]",
    mobile: "border-white/10 bg-[#090909]",
    accent: "text-[#f58227]",
    footer: "border-white/10 bg-[#090909]",
    footerGlow: "opacity-70 [background-image:linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,transparent_8%,rgba(245,130,39,0.18)_50%,transparent_92%)] [background-size:44px_44px,44px_44px,100%_1px] [background-position:0_0,0_0,0_28px] [background-repeat:repeat,repeat,no-repeat] [mask-image:linear-gradient(to_bottom,black,transparent_88%)]",
    footerCopy: "ACTURUS develops AI CONTROL GRID for enterprise teams moving AI from policy into accountable operations.",
    kicker: "text-[#f8a45e]",
    kickerLine: "bg-[#f58227]",
    kickerDark: "text-black/70",
    kickerLineDark: "bg-black",
  },
} as const;

export function usePublicReducedMotion(): boolean {
  const osReducedMotion = useReducedMotion();
  const [appReducedMotion, setAppReducedMotion] = useState(
    () => typeof document !== "undefined" && document.documentElement.dataset.motionMode === "reduced",
  );

  useEffect(() => {
    const root = document.documentElement;
    const syncPreference = () => setAppReducedMotion(root.dataset.motionMode === "reduced");
    syncPreference();
    const observer = new MutationObserver(syncPreference);
    observer.observe(root, { attributes: true, attributeFilter: ["data-motion-mode"] });
    return () => observer.disconnect();
  }, []);

  return Boolean(osReducedMotion || appReducedMotion);
}

export function ActurusMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden="true" focusable="false">
      <rect x="8.5" y="8.5" width="31" height="31" rx="3" transform="rotate(45 24 24)" stroke="currentColor" strokeWidth="1.4" />
      <rect x="14.5" y="14.5" width="19" height="19" rx="2" transform="rotate(45 24 24)" stroke="currentColor" strokeWidth="1.2" opacity="0.62" />
      <circle cx="24" cy="24" r="3.5" fill="currentColor" />
      <path d="M24 3.5v8M44.5 24h-8M24 44.5v-8M3.5 24h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.75" />
    </svg>
  );
}

const GRID_NAV_LINKS = [
  { label: "Platform", href: "/welcome#platform" },
  { label: "Control loop", href: "/welcome#control-loop" },
  { label: "Evidence", href: "/welcome#evidence" },
  { label: "Company", href: ACTURUS_BRAND.companyRoute },
  { label: "Trust", href: "/trust-center" },
];

const ACTURUS_NAV_LINKS = [
  { label: "Story", href: "#story" },
  { label: "Product", href: "#product" },
  { label: "Founders", href: "#founders" },
  { label: "Principles", href: "#principles" },
  { label: "Trust", href: "/trust-center" },
];

export function ActurusPublicHeader({
  position = "fixed",
  theme = "grid",
}: {
  position?: "fixed" | "sticky";
  theme?: PublicTheme;
} = {}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const visual = SHELL_THEME[theme];
  const navLinks = theme === "acturus" ? ACTURUS_NAV_LINKS : GRID_NAV_LINKS;
  const homeHref = theme === "acturus" ? "/acturus" : "/welcome";

  useEffect(() => {
    if (!mobileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mobileOpen]);

  return (
    <header
      className={`${position === "fixed" ? "fixed inset-x-0" : "sticky"} ${visual.header} top-0 z-50 border-b text-white ${theme === "grid" ? "backdrop-blur-xl" : ""}`}
      data-public-theme={theme}
      data-testid="public-site-header"
    >
      <a
        href="#public-main-content"
        className="absolute left-4 top-3 z-[60] -translate-y-20 rounded-[4px] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#111827] transition-transform focus:translate-y-0"
      >
        Skip to main content
      </a>
      <div className="mx-auto flex h-[72px] max-w-[1200px] items-center justify-between px-5 sm:px-6">
        <Link href={homeHref} className="group flex items-center gap-3" aria-label={theme === "acturus" ? "ACTURUS company home" : "ACTURUS home"}>
          <span className={`flex h-10 w-10 items-center justify-center rounded-[8px] border transition-all duration-300 ${visual.mark}`}>
            <ActurusMark className="h-6 w-6" />
          </span>
          <span className="leading-none">
            <span className="font-acturus-display block text-[13px] tracking-[0.08em] text-white">ACTURUS</span>
            <span className={`mt-1.5 block text-[9px] uppercase tracking-[0.2em] ${visual.subtitleColor}`}>{visual.subtitle}</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-6 lg:flex" aria-label="Primary navigation">
          {navLinks.map((item) => (
            item.href.includes("#") ? (
              <a key={item.label} href={item.href} className={`text-xs uppercase tracking-[0.14em] transition-colors duration-300 ${visual.nav}`}>
                {item.label}
              </a>
            ) : (
              <Link key={item.label} href={item.href} className={`text-xs uppercase tracking-[0.14em] transition-colors duration-300 ${visual.nav}`}>
                {item.label}
              </Link>
            )
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link href="/auth/login" className={`inline-flex min-h-11 items-center px-3 text-xs uppercase tracking-[0.13em] transition-colors ${visual.nav}`}>
            Sign in
          </Link>
          <Link href="/book-demo" className={`inline-flex min-h-11 items-center gap-2 rounded-[7px] border px-5 text-xs font-semibold uppercase tracking-[0.13em] transition-all duration-300 ${visual.cta}`}>
            Book a demo <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <button
          type="button"
          className={`flex h-11 w-11 items-center justify-center rounded-[7px] border text-white lg:hidden ${theme === "grid" ? "border-[#78c9ff]/25" : "border-[#f58227]/35"}`}
          onClick={() => setMobileOpen((value) => !value)}
          aria-expanded={mobileOpen}
          aria-label="Toggle navigation"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen ? (
        <div className={`max-h-[calc(100dvh-72px)] overflow-y-auto border-t px-5 py-5 lg:hidden ${visual.mobile}`}>
          <nav className="mx-auto flex max-w-[1200px] flex-col" aria-label="Mobile navigation">
            {navLinks.map((item) => (
              item.href.includes("#") ? (
                <a key={item.label} href={item.href} className={`flex min-h-12 items-center border-b border-white/10 text-sm uppercase tracking-[0.14em] ${visual.nav}`} onClick={() => setMobileOpen(false)}>
                  {item.label}
                </a>
              ) : (
                <Link key={item.label} href={item.href} className={`flex min-h-12 items-center border-b border-white/10 text-sm uppercase tracking-[0.14em] ${visual.nav}`} onClick={() => setMobileOpen(false)}>
                  {item.label}
                </Link>
              )
            ))}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Link href="/auth/login" className="inline-flex min-h-11 items-center justify-center rounded-[7px] border border-white/20 text-xs uppercase tracking-[0.12em] text-white" onClick={() => setMobileOpen(false)}>
                Sign in
              </Link>
              <Link href="/book-demo" className={`inline-flex min-h-11 items-center justify-center rounded-[7px] border text-xs font-semibold uppercase tracking-[0.12em] ${visual.cta}`} onClick={() => setMobileOpen(false)}>
                Book demo
              </Link>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

export function ActurusFooter({ theme = "grid" }: { theme?: PublicTheme } = {}) {
  const visual = SHELL_THEME[theme];
  return (
    <footer className={`relative overflow-hidden border-t px-5 py-12 text-white sm:px-6 ${visual.footer}`} data-public-theme={theme}>
      <div className={`pointer-events-none absolute inset-0 ${visual.footerGlow}`} aria-hidden="true" />
      <div className="relative mx-auto grid max-w-[1200px] gap-10 md:grid-cols-[1.2fr_0.8fr_0.8fr]">
        <div>
          <div className={`flex items-center gap-3 ${visual.accent}`}>
            <ActurusMark className="h-8 w-8" />
            <span className="font-acturus-display text-sm tracking-[0.08em] text-white">ACTURUS</span>
          </div>
          <p className="mt-5 max-w-sm text-sm leading-6 text-white/70">{visual.footerCopy}</p>
        </div>
        <div>
          <div className={`text-[10px] uppercase tracking-[0.2em] ${visual.accent}`}>Explore</div>
          <div className="mt-4 flex flex-col gap-3 text-sm text-white/60">
            <Link className="transition-colors hover:text-white" href="/welcome">AI CONTROL GRID</Link>
            <Link className="transition-colors hover:text-white" href="/acturus">Company</Link>
            <Link className="transition-colors hover:text-white" href="/trust-center">Trust Center</Link>
            <Link className="transition-colors hover:text-white" href="/api-docs">API Docs</Link>
          </div>
        </div>
        <div>
          <div className={`text-[10px] uppercase tracking-[0.2em] ${visual.accent}`}>Company</div>
          <div className="mt-4 flex flex-col gap-3 text-sm text-white/60">
            <Link className="transition-colors hover:text-white" href="/book-demo">Book a demo</Link>
            <Link className="transition-colors hover:text-white" href="/security">Security</Link>
            <Link className="transition-colors hover:text-white" href="/privacy">Privacy</Link>
            <Link className="transition-colors hover:text-white" href="/terms">Terms</Link>
          </div>
        </div>
      </div>
      <div className="relative mx-auto mt-10 flex max-w-[1200px] flex-col gap-3 border-t border-white/10 pt-5 text-[10px] uppercase tracking-[0.16em] text-white/60 sm:flex-row sm:items-center sm:justify-between">
        <span>AI CONTROL GRID — Developed by ACTURUS</span>
        <span>© 2026 ACTURUS</span>
      </div>
    </footer>
  );
}

export function Reveal({
  children,
  className = "",
  delay = 0,
  y = 24,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  const reduceMotion = usePublicReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y, clipPath: "inset(0 0 18% 0)" }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0, clipPath: "inset(0 0 0% 0)" }}
      viewport={{ once: true, amount: 0.18 }}
      transition={{ duration: 0.72, delay, ease: [0.22, 0.61, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function SectionKicker({
  children,
  dark = false,
  theme = "acturus",
  className = "",
}: {
  children: ReactNode;
  dark?: boolean;
  theme?: PublicTheme;
  className?: string;
}) {
  const visual = SHELL_THEME[theme];
  return (
    <div className={`flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.24em] ${dark ? visual.kickerDark : visual.kicker} ${className}`}>
      <span className={`h-px w-8 ${dark ? visual.kickerLineDark : visual.kickerLine}`} />
      {children}
    </div>
  );
}
