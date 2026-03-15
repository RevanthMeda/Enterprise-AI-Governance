import { useEffect, useState } from "react";
import {
  Menu,
  X,
  CheckCircle2,
  Building2,
  ClipboardCheck,
  Lock,
  Users,
  Workflow,
  FileCheck2,
  CalendarClock,
  ChartNoAxesCombined,
  FolderLock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { buildTrackedPath, trackMarketingEvent } from "@/lib/marketing";
import { BrandMark } from "@/components/brand-mark";

const navItems = [
  { label: "Product", href: "#product" },
  { label: "Solutions", href: "#solutions" },
  { label: "Frameworks", href: "#frameworks" },
  { label: "How it Works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
  { label: "Trust Center", href: "/trust-center" },
  { label: "Docs", href: "/api-docs" },
];

const proofItems = [
  "Multi-tenant foundation complete",
  "SAML + OIDC enterprise SSO",
  "DNS-verified domain claims",
  "Invite + JIT onboarding",
  "Decision traceability lifecycle",
  "SHA-256 audit hash chain",
  "AI incident playbooks",
  "Jira escalation sync",
  "Pilot-to-paid subscription controls",
  "Role-based approvals",
  "Audit-ready exports",
  "Tenant-safe architecture",
];

const painPoints = [
  "AI systems tracked in spreadsheets and ad hoc docs",
  "Approval workflows buried in email and chat",
  "Evidence scattered across folders and tools",
  "Incomplete audit trails during reviews",
  "Inconsistent risk classification between teams",
  "Siloed compliance, security, and product operations",
];

const useCases = [
  {
    title: "Compliance & Risk",
    body: "Track controls, evidence, approvals, and framework alignment from one operational record.",
    icon: ClipboardCheck,
  },
  {
    title: "Security & Governance",
    body: "Enforce review workflows, enterprise SSO, and governance posture controls across high-scrutiny systems.",
    icon: Lock,
  },
  {
    title: "Product & AI Teams",
    body: "Register systems, complete assessments, and move through review paths with less friction.",
    icon: Workflow,
  },
  {
    title: "Auditors",
    body: "Review evidence, activity history, control mapping, and approvals from a single workspace.",
    icon: FileCheck2,
  },
  {
    title: "Regulated Enterprises",
    body: "Prepare for customer due diligence and regulatory scrutiny with auditable governance operations and tenant-safe identity controls.",
    icon: Building2,
  },
  {
    title: "Portfolio Operators and PE Teams",
    body: "Roll out governance baselines across portfolio companies with buyer-grade audit evidence, incident handling, and commercial controls.",
    icon: ChartNoAxesCombined,
  },
  {
    title: "IT & Identity Teams",
    body: "Roll out SAML or OIDC, verified domains, JIT provisioning, and invite-based onboarding without custom glue.",
    icon: Users,
  },
];

const differentiators = [
  {
    title: "System-first governance",
    body: "Each AI system has profile, controls, workflows, evidence, and audit history in one context.",
  },
  {
    title: "Operational, not theoretical",
    body: "Approvals, notifications, calendars, and exports turn governance requirements into daily execution.",
  },
  {
    title: "Framework-aware",
    body: "Built for EU AI Act risk thinking with mapped controls across NIST AI RMF and ISO 42001.",
  },
  {
    title: "Enterprise identity built in",
    body: "Support SAML, OIDC, verified domains, invite workflows, and JIT provisioning from the same admin surface.",
  },
  {
    title: "AI roll-up diligence ready",
    body: "Decision traceability, human override capture, immutable audit chaining, and incident playbooks help answer buyer diligence questions directly.",
  },
  {
    title: "Tenant-safe foundation",
    body: "Organization isolation, route-level protections, and tenant-safe files/exports are built into the platform.",
  },
];

const howItWorks = [
  "Register every AI system",
  "Assess risk and classify impact",
  "Map controls and route approvals",
  "Collect evidence and maintain audit history",
  "Federate identity and onboard users safely",
  "Monitor readiness over time",
];

const features = [
  { title: "AI System Registry", body: "Central inventory with complete system metadata and governance context." },
  { title: "Risk Assessment Wizard", body: "Guided risk classification with rationale and control suggestions." },
  { title: "Control Mapping", body: "Framework-aware mapping linked directly to each system and status." },
  { title: "Approval Workflows", body: "Role-based review flows with ownership, status, and timeline visibility." },
  { title: "Evidence Management", body: "Attach and manage evidence in context with access control and auditability." },
  { title: "Audit Log", body: "Unified event history across systems, controls, workflows, and evidence." },
  { title: "Calendar & Activity Views", body: "Deadline visibility and personal work surfaces for follow-through." },
  { title: "Export & Reporting", body: "Generate organization-scoped outputs for review and audit readiness." },
  { title: "Enterprise Identity", body: "SAML and OIDC sign-in, verified domains, invite workflows, and JIT provisioning." },
  { title: "Admin Control Center", body: "Manage domains, identity mode, invites, members, and admin activity from one settings surface." },
  { title: "Decision Trace Center", body: "Track context, AI output, human override, rationale, and 30/60/90-day outcomes with chain verification." },
  { title: "Incident Response Playbooks", body: "Open AI incidents for bias, security, privacy, reliability, and safety with explicit containment workflows." },
  { title: "Jira Escalation Sync", body: "Open Jira tickets automatically for qualifying high-risk approval workflows and sync buyer-facing remediation work." },
  { title: "Billing Controls", body: "Manage pilot, growth, and enterprise tiers with seat limits and live usage to support pilot-to-paid conversion." },
  { title: "Multi-tenant SaaS Foundation", body: "Hardened tenant isolation with org-aware auth/session boundaries." },
];

const operationsHighlights = [
  {
    title: "Readiness and deployment discipline",
    body: "Health and readiness probes, deploy smoke checks, and promotion workflows keep releases predictable instead of hope-driven.",
    icon: CalendarClock,
  },
  {
    title: "Monitoring with traceable failures",
    body: "Structured request logging, request IDs, stable error codes, and queued monitoring webhooks give teams cleaner incident diagnosis.",
    icon: ChartNoAxesCombined,
  },
  {
    title: "Async delivery with retry paths",
    body: "Invite delivery and monitoring webhooks run through a persistent retryable job queue with admin-visible failure handling.",
    icon: Workflow,
  },
  {
    title: "Immutable trace and incident posture",
    body: "Decision lifecycle records, SHA-256 audit chains, and AI-specific incident playbooks give operators a clearer diligence and response story.",
    icon: CheckCircle2,
  },
  {
    title: "Tenant-safe operational controls",
    body: "Org-scoped files, exports, sessions, domains, and admin surfaces keep platform operations aligned with real enterprise boundaries.",
    icon: FolderLock,
  },
];

const roleValue = [
  {
    title: "For Compliance Leaders",
    body: "Track control coverage, evidence gaps, and deadlines with clear, centralized accountability.",
  },
  {
    title: "For Security & Risk Teams",
    body: "Monitor high-risk systems, workflow bottlenecks, and governance posture across portfolios.",
  },
  {
    title: "For Product Teams",
    body: "Move AI use cases through a clear review path instead of fragmented governance requests.",
  },
  {
    title: "For Auditors",
    body: "Access structured history, control mapping, evidence, and exports without chasing sources.",
  },
  {
    title: "For IT and Identity Owners",
    body: "Deploy enterprise sign-in with verified domains and controlled onboarding instead of stitching governance into the IdP by hand.",
  },
  {
    title: "For Operating Partners",
    body: "Assess portfolio readiness, buyer diligence posture, and escalation discipline from a single multi-tenant control plane.",
  },
];

const faqItems = [
  {
    q: "What is AI Control Tower?",
    a: "AI Control Tower is an enterprise AI governance platform for system registry, risk assessment, controls, approvals, evidence, and audit-ready operations.",
  },
  {
    q: "Who is it for?",
    a: "Compliance teams, risk leaders, security teams, AI governance groups, product/AI teams, and auditors in regulated or high-scrutiny environments.",
  },
  {
    q: "Does it support high-risk AI governance?",
    a: "Yes. The platform is designed for structured assessments, approval workflows, evidence collection, and audit trails around higher-scrutiny AI systems.",
  },
  {
    q: "Which frameworks does it align with?",
    a: "Current control mapping aligns with EU AI Act concepts and includes NIST AI RMF and ISO 42001 support.",
  },
  {
    q: "Can multiple organizations use it safely?",
    a: "Yes. Organization-aware auth/session context, scoped exports/files, route-level protections, and tenant guards are in place.",
  },
  {
    q: "Does it support enterprise identity and onboarding?",
    a: "Yes. The platform now supports SAML and OIDC, verified domain claims, invite workflows, and JIT provisioning with org-scoped audit trails.",
  },
  {
    q: "Can we export data for audits?",
    a: "Yes. Export/reporting flows are organization-scoped and designed for governance reviews and audit readiness.",
  },
  {
    q: "Can the platform support buyer diligence and AI roll-up operations?",
    a: "Yes. Decision traceability, human override capture, incident playbooks, immutable audit chains, trust-center documentation, and Jira escalation support are built into the platform.",
  },
  {
    q: "How does the platform fit into the enterprise stack?",
    a: "AI Control Tower supports identity federation, domain verification, Jira integration, API documentation, and billing controls so customers can move from pilot to production with less glue code.",
  },
];

function Section({
  id,
  eyebrow,
  title,
  subtitle,
  children,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="py-16 sm:py-20">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 space-y-3">
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/80">{eyebrow}</p>
          ) : null}
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
          {subtitle ? <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">{subtitle}</p> : null}
        </div>
        {children}
      </div>
    </section>
  );
}

export default function LandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const trackedPath = (path: string, cta: string) => buildTrackedPath(path, { cta });
  const handleCtaClick = (section: string, cta: string) => () => {
    void trackMarketingEvent("cta_click", { section, cta });
  };

  useEffect(() => {
    void trackMarketingEvent("page_view", { section: "landing" });

    const seenDepths = new Set<number>();
    const onScroll = () => {
      const maxScrollable = document.documentElement.scrollHeight - window.innerHeight;
      if (maxScrollable <= 0) return;
      const scrolledRatio = window.scrollY / maxScrollable;
      for (const depth of [25, 50, 75, 100]) {
        if (scrolledRatio >= depth / 100 && !seenDepths.has(depth)) {
          seenDepths.add(depth);
          void trackMarketingEvent("scroll_depth", {
            section: "landing",
            metadata: { depth },
          });
        }
      }
    };

    const sectionIds = ["product", "pain-points", "solutions", "frameworks", "how-it-works", "pricing", "faq"];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.target instanceof HTMLElement) {
            void trackMarketingEvent("section_engagement", {
              section: entry.target.id,
              metadata: { intersectionRatio: entry.intersectionRatio },
            });
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.35 },
    );

    for (const id of sectionIds) {
      const element = document.getElementById(id);
      if (element) {
        observer.observe(element);
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <a href="/welcome" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
              <BrandMark className="h-4 w-4" />
            </span>
            <span>AI Control Tower</span>
          </a>

          <nav className="hidden items-center gap-6 text-sm md:flex">
            {navItems.map((item) => (
              <a key={item.href} href={item.href} className="text-muted-foreground transition-colors hover:text-foreground">
                {item.label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex md:items-center md:gap-3">
            <a
              href="/auth/login"
              onClick={handleCtaClick("navbar", "sign_in")}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Sign In
            </a>
            <Button asChild>
              <a href={trackedPath("/book-demo", "navbar_book_demo")} onClick={handleCtaClick("navbar", "book_demo")}>Book a Demo</a>
            </Button>
          </div>

          <button
            type="button"
            className="inline-flex items-center rounded-md p-2 text-muted-foreground hover:bg-muted md:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {mobileOpen ? (
          <div className="border-t border-border/60 bg-background md:hidden">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-3 sm:px-6 lg:px-8">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className="rounded px-2 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {item.label}
                </a>
              ))}
              <a
                href="/auth/login"
                onClick={handleCtaClick("mobile_nav", "sign_in")}
                className="rounded px-2 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Sign In
              </a>
              <Button asChild className="mt-2">
                <a href={trackedPath("/book-demo", "mobile_nav_book_demo")} onClick={handleCtaClick("mobile_nav", "book_demo")}>Book a Demo</a>
              </Button>
            </div>
          </div>
        ) : null}
      </header>

      <section className="relative overflow-hidden border-b border-border/60">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(37,99,235,0.16),transparent_60%)]" />
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2 lg:items-center lg:px-8">
          <div className="space-y-6">
            <p className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
              <BrandMark className="h-3.5 w-3.5 text-primary" />
              Enterprise AI Governance Platform
            </p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
              Control enterprise AI before it becomes a compliance, security, or audit problem.
            </h1>
            <p className="text-sm text-muted-foreground sm:text-base">
              AI Control Tower helps organizations register AI systems, classify risk, map controls, manage approvals,
              store evidence, and stay audit-ready across GenAI and high-risk AI use cases.
            </p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {[
                "Centralize all AI systems in one registry",
                "Apply structured governance across workflows and controls",
                "Track evidence, deadlines, and audits in one platform",
                "Built for multi-team, multi-org operational governance",
                "Run with verified domains, queued delivery, and readiness checks instead of manual glue",
              ].map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <a href={trackedPath("/book-demo", "hero_book_demo")} onClick={handleCtaClick("hero", "book_demo")}>Book a Demo</a>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <a href="#product">Explore the Platform</a>
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <a href="/api-docs" className="inline-flex items-center rounded-full border border-border/70 bg-background/70 px-3 py-1.5 transition-colors hover:text-foreground">
                Review API docs
              </a>
              <a href="/security" className="inline-flex items-center rounded-full border border-border/70 bg-background/70 px-3 py-1.5 transition-colors hover:text-foreground">
                Security practices
              </a>
              <a href={trackedPath("/start-pilot", "hero_start_pilot")} onClick={handleCtaClick("hero", "start_pilot")} className="inline-flex items-center rounded-full border border-border/70 bg-background/70 px-3 py-1.5 transition-colors hover:text-foreground">
                Start a pilot
              </a>
            </div>
          </div>

          <Card className="border-border/70 bg-card/75">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Operational Governance Snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-md border border-border/70 bg-muted/30 p-3">
                  <p className="text-muted-foreground">High-Risk Systems</p>
                  <p className="mt-1 text-lg font-semibold">14</p>
                </div>
                <div className="rounded-md border border-border/70 bg-muted/30 p-3">
                  <p className="text-muted-foreground">Pending Approvals</p>
                  <p className="mt-1 text-lg font-semibold">9</p>
                </div>
                <div className="rounded-md border border-border/70 bg-muted/30 p-3">
                  <p className="text-muted-foreground">Evidence Items</p>
                  <p className="mt-1 text-lg font-semibold">147</p>
                </div>
                <div className="rounded-md border border-border/70 bg-muted/30 p-3">
                  <p className="text-muted-foreground">Audit Events (30d)</p>
                  <p className="mt-1 text-lg font-semibold">318</p>
                </div>
              </div>
              <div className="rounded-md border border-border/70 bg-muted/25 p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Approval Queue</p>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between rounded bg-background/60 px-2 py-1.5">
                    <span>Credit Risk Engine v2 Review</span>
                    <span className="rounded bg-amber-500/15 px-2 py-0.5 text-amber-500">In Review</span>
                  </div>
                  <div className="flex items-center justify-between rounded bg-background/60 px-2 py-1.5">
                    <span>Chatbot Transparency Controls</span>
                    <span className="rounded bg-sky-500/15 px-2 py-0.5 text-sky-500">Pending</span>
                  </div>
                </div>
              </div>
              <div className="grid gap-2 rounded-md border border-border/70 bg-background/40 p-3 text-xs sm:grid-cols-3">
                <div>
                  <p className="text-muted-foreground">Readiness</p>
                  <p className="mt-1 font-semibold text-foreground">Live probes + smoke checks</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Identity</p>
                  <p className="mt-1 font-semibold text-foreground">SAML, OIDC, verified domains</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Operations</p>
                  <p className="mt-1 font-semibold text-foreground">Queued delivery + audit trail</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <Section
        id="product"
        eyebrow="Credibility"
        title="Built for teams that need more than a spreadsheet"
        subtitle="Operational governance requires system context, workflow discipline, and tenant-safe architecture."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {proofItems.map((item) => (
            <div key={item} className="rounded-md border border-border/70 bg-card/60 px-4 py-3 text-sm text-muted-foreground">
              {item}
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="pain-points"
        eyebrow="Pain Points"
        title="Why AI governance breaks down in most organizations"
        subtitle="AI adoption accelerates while governance operations stay fragmented across tools and teams."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {painPoints.map((item) => (
            <Card key={item} className="border-border/70 bg-card/70">
              <CardContent className="pt-5 text-sm text-muted-foreground">{item}</CardContent>
            </Card>
          ))}
        </div>
        <p className="mt-6 text-sm text-foreground/90">
          AI Control Tower replaces fragmented governance with one operational system of record for enterprise AI.
        </p>
      </Section>

      <Section id="solutions" eyebrow="Use Cases" title="Who uses AI Control Tower">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {useCases.map((useCase) => (
            <Card key={useCase.title} className="border-border/70 bg-card/70">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <useCase.icon className="h-4 w-4 text-primary" />
                  {useCase.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{useCase.body}</CardContent>
            </Card>
          ))}
        </div>
      </Section>

      <Section id="frameworks" eyebrow="Why Us" title="Why teams choose AI Control Tower">
        <div className="grid gap-4 md:grid-cols-2">
          {differentiators.map((item) => (
            <Card key={item.title} className="border-border/70 bg-card/70">
              <CardHeader className="pb-1">
                <CardTitle className="text-base">{item.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{item.body}</CardContent>
            </Card>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Operations"
        title="Built to run in production, not just to demo well"
        subtitle="The platform now exposes the operational controls enterprise teams expect once governance moves into daily use."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {operationsHighlights.map((item) => (
            <Card key={item.title} className="border-border/70 bg-card/70">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <item.icon className="h-4 w-4 text-primary" />
                  {item.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{item.body}</CardContent>
            </Card>
          ))}
        </div>
        <div className="mt-6 grid gap-3 rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm sm:grid-cols-3">
          <div className="rounded-xl border border-border/70 bg-background/70 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">For platform teams</p>
            <p className="mt-2 font-medium">Use readiness, monitoring, and queue health to validate the system before users feel a problem.</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/70 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">For enterprise buyers</p>
            <p className="mt-2 font-medium">Show identity federation, auditability, and tenant-safe operations without promising hand-wavy future work.</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/70 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">For integrators</p>
            <p className="mt-2 font-medium">Expose API docs, public specs, and controlled onboarding paths from the same product surface.</p>
          </div>
        </div>
      </Section>

      <Section id="how-it-works" eyebrow="How it Works" title="A practical governance workflow from intake to audit">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {howItWorks.map((step, index) => (
            <Card key={step} className="border-border/70 bg-card/70">
              <CardContent className="flex h-full flex-col gap-3 pt-5">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                  {index + 1}
                </span>
                <p className="text-sm font-medium">{step}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="What the platform gives your team" subtitle="Capabilities designed for day-to-day governance execution.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title} className="border-border/70 bg-card/70">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{feature.body}</CardContent>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Value by role" subtitle="Different teams get a shared control layer with role-relevant visibility.">
        <div className="grid gap-4 sm:grid-cols-2">
          {roleValue.map((item) => (
            <Card key={item.title} className="border-border/70 bg-card/70">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{item.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{item.body}</CardContent>
            </Card>
          ))}
        </div>
      </Section>

      <Section id="pricing" eyebrow="Pricing" title="Pricing built for governance maturity">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="border-border/70 bg-card/70">
            <CardHeader>
              <CardTitle className="text-xl">Pilot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">For first deployments and governance setup.</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>AI registry and risk assessments</li>
                <li>Controls, approvals, audit logs</li>
                <li>Evidence and exports</li>
              </ul>
              <Button className="w-full" asChild>
                <a href={trackedPath("/start-pilot", "pricing_pilot_start")} onClick={handleCtaClick("pricing_pilot", "start_pilot")}>Start a Pilot</a>
              </Button>
            </CardContent>
          </Card>
          <Card className="border-primary/40 bg-card/70">
            <CardHeader>
              <CardTitle className="text-xl">Growth</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">For multi-team operational governance programs.</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>Everything in Pilot</li>
                <li>Dashboards, calendar, notifications</li>
                <li>Activity views and admin controls</li>
              </ul>
              <Button className="w-full" variant="outline" asChild>
                <a href={trackedPath("/book-demo", "pricing_growth_talk_sales")} onClick={handleCtaClick("pricing_growth", "talk_to_sales")}>Talk to Sales</a>
              </Button>
            </CardContent>
          </Card>
          <Card className="border-border/70 bg-card/70">
            <CardHeader>
              <CardTitle className="text-xl">Enterprise</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">For large or regulated deployments and enterprise onboarding.</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>Everything in Growth</li>
                <li>Advanced integrations and workflows</li>
                <li>Enterprise deployment options</li>
              </ul>
              <Button className="w-full" variant="outline" asChild>
                <a href={trackedPath("/book-demo", "pricing_enterprise_book_demo")} onClick={handleCtaClick("pricing_enterprise", "book_demo")}>Book Enterprise Demo</a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="Designed around real governance work">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-border/70 bg-card/70">
            <CardContent className="pt-6 text-sm text-muted-foreground">
              “Bring systems, approvals, evidence, and audits into one operating layer.”
            </CardContent>
          </Card>
          <Card className="border-border/70 bg-card/70">
            <CardContent className="pt-6 text-sm text-muted-foreground">
              “Turn governance expectations into repeatable daily workflows.”
            </CardContent>
          </Card>
          <Card className="border-border/70 bg-card/70">
            <CardContent className="pt-6 text-sm text-muted-foreground">
              “Use dashboards, calendar, and exports to maintain continuous readiness.”
            </CardContent>
          </Card>
        </div>
      </Section>

      <section className="border-y border-border/70 bg-muted/20 py-16 sm:py-20">
        <div className="mx-auto w-full max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Bring your AI systems, controls, approvals, and evidence into one control tower.
          </h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            See how your organization can move from scattered governance to operational oversight.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" asChild>
              <a href={trackedPath("/book-demo", "cta_strip_book_demo")} onClick={handleCtaClick("cta_strip", "book_demo")}>Book a Demo</a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href={trackedPath("/start-pilot", "cta_strip_start_pilot")} onClick={handleCtaClick("cta_strip", "start_pilot")}>Start a Pilot</a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="/api-docs">Review the API</a>
            </Button>
          </div>
        </div>
      </section>

      <Section id="faq" title="Frequently asked questions">
        <Accordion type="single" collapsible className="rounded-md border border-border/70 bg-card/70 px-4">
          {faqItems.map((item, index) => (
            <AccordionItem key={item.q} value={`faq-${index}`}>
              <AccordionTrigger className="text-left">{item.q}</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">{item.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Section>

      <footer className="border-t border-border/70 py-10">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 sm:px-6 md:grid-cols-3 lg:px-8">
          <div className="space-y-2">
            <p className="flex items-center gap-2 font-semibold">
              <BrandMark className="h-4 w-4 text-primary" />
              AI Control Tower
            </p>
            <p className="text-xs text-muted-foreground">
              Enterprise AI governance with operational workflow, evidence, and audit-ready control.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
            <a href="#product" className="hover:text-foreground">Product</a>
            <a href="/security" className="hover:text-foreground">Security</a>
            <a href="/privacy" className="hover:text-foreground">Privacy</a>
            <a href="/terms" className="hover:text-foreground">Terms</a>
            <a href={trackedPath("/book-demo", "footer_contact")} onClick={handleCtaClick("footer", "contact")} className="hover:text-foreground">Contact</a>
            <a href={trackedPath("/book-demo", "footer_book_demo")} onClick={handleCtaClick("footer", "book_demo")} className="hover:text-foreground">Book Demo</a>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5 text-primary" /> Role-based access</span>
            <span className="inline-flex items-center gap-1"><ChartNoAxesCombined className="h-3.5 w-3.5 text-primary" /> Audit logs</span>
            <span className="inline-flex items-center gap-1"><FolderLock className="h-3.5 w-3.5 text-primary" /> Tenant isolation</span>
            <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5 text-primary" /> Export controls</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
