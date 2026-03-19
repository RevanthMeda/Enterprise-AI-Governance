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
  { label: "Control Layer", href: "#product" },
  { label: "Use Cases", href: "#solutions" },
  { label: "Governance", href: "#frameworks" },
  { label: "How it Works", href: "#how-it-works" },
  { label: "Deployment", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
  { label: "Trust Center", href: "/trust-center" },
  { label: "Docs", href: "/api-docs" },
];

const proofItems = [
  "Inline prompt preflight controls",
  "Output and tool-call postflight enforcement",
  "OpenAI, Anthropic, Gemini, Azure, Vertex, and Bedrock coverage",
  "Generic OpenAI-compatible provider gateway",
  "Tool allowlists and typed argument enforcement",
  "Runtime incidents and containment workflow",
  "Decision traces and SHA-256 audit chain",
  "Tenant-scoped reviewer exceptions",
  "Encrypted upstream provider credential vault",
  "Telemetry privacy profiles",
  "SAML, OIDC, verified domains, and JIT onboarding",
  "Tenant-safe architecture",
];

const painPoints = [
  "Prompts go straight to models with no central interception point",
  "Teams can see incidents after the fact but cannot stop unsafe output before release",
  "Tool calls are approved implicitly instead of through explicit action policy",
  "Runtime evidence is too thin to defend a decision during audit or investigation",
  "False positives and reviewer overrides are handled manually with no tenant memory",
  "Compliance, security, product, and platform teams operate on different facts",
];

const useCases = [
  {
    title: "Governance & Compliance",
    body: "Run one operating surface for registry, policy, evidence, incidents, approvals, and audit posture.",
    icon: ClipboardCheck,
  },
  {
    title: "Security & Runtime Control",
    body: "Intercept prompts, outputs, and tool calls before unsafe model behavior reaches downstream users or systems.",
    icon: Lock,
  },
  {
    title: "Platform & AI Teams",
    body: "Connect models through SDK or gateway mode and keep shipping without losing central control.",
    icon: Workflow,
  },
  {
    title: "Audit & Investigation",
    body: "Trace why a turn was allowed, warned, escalated, or blocked with linked evidence and incident history.",
    icon: FileCheck2,
  },
  {
    title: "Regulated Enterprises",
    body: "Apply stricter runtime policy in finance, healthcare, employment, and other high-scrutiny environments.",
    icon: Building2,
  },
  {
    title: "Portfolio Operators",
    body: "Roll out baseline policy, review workflows, and evidence standards across multiple operating companies.",
    icon: ChartNoAxesCombined,
  },
  {
    title: "Identity & Admin Teams",
    body: "Use enterprise sign-in, domain verification, invites, and tenant isolation without custom governance glue code.",
    icon: Users,
  },
];

const differentiators = [
  {
    title: "Inline control, not just monitoring",
    body: "AI Control Tower can evaluate prompts before the model call, evaluate outputs before release, and stop risky traffic in the middle of execution.",
  },
  {
    title: "System-bound governance",
    body: "Every runtime decision is attached to a registered AI system with known ownership, purpose, domain, and sensitivity.",
  },
  {
    title: "Action-level enforcement",
    body: "Tool calls can be allowed, denied, or schema-validated so the model cannot execute arbitrary actions just because it asks.",
  },
  {
    title: "Human review with memory",
    body: "Reviewer-approved exceptions can be scoped to one tenant or system so a false positive becomes manageable without weakening global policy.",
  },
  {
    title: "Multi-provider control plane",
    body: "The same governance path can sit in front of OpenAI, Anthropic, Gemini, Azure OpenAI, Vertex AI, Bedrock, and compatible providers.",
  },
  {
    title: "Operational evidence by default",
    body: "Runtime events, incidents, approvals, evidence, and decision traces stay linked so audits and investigations are answerable.",
  },
];

const howItWorks = [
  "Register the AI system and baseline its risk",
  "Bind a telemetry key, SDK, or inline gateway",
  "Run prompt preflight before model execution",
  "Evaluate output and tool calls before release",
  "Open incidents, update audit, and reassess posture",
  "Review exceptions and refine policy without losing control",
];

const features = [
  { title: "AI System Registry", body: "Track owner, purpose, domain, sensitivity, geography, and oversight for every governed system." },
  { title: "Risk Classification", body: "Baseline each AI system before runtime enforcement begins so policy decisions have business context." },
  { title: "Telemetry Adapter", body: "Rotate keys, bind default systems, set privacy profiles, and manage upstream provider configuration." },
  { title: "Telemetry Policy", body: "Configure allow, warn, escalate, and block rules for prompts, outputs, tools, and runtime thresholds." },
  { title: "Inline Gateway", body: "Intercept prompt and response traffic for supported providers through a central OpenAI-compatible control surface." },
  { title: "SDK Guard Mode", body: "Wrap application-side model calls when a full proxy is not the right deployment model." },
  { title: "Tool and Action Control", body: "Use default-deny allowlists and typed argument policy to constrain what models may trigger." },
  { title: "Runtime Monitoring", body: "Review live telemetry counts, threshold breaches, blocked decisions, and escalated incidents." },
  { title: "Incident Response", body: "Create or update AI incidents automatically when runtime behavior crosses security, privacy, or safety lines." },
  { title: "Decision Traces", body: "Maintain context, rationale, human override state, and linked outcomes with audit-chain verification." },
  { title: "Evidence and Compliance", body: "Keep controls, evidence, reviewer notes, and framework posture linked to the same systems." },
  { title: "Reviewer Exceptions", body: "Allow tenant-scoped false-positive suppression without weakening policy for every other customer." },
  { title: "Enterprise Identity", body: "Use SAML, OIDC, verified domains, invite workflows, and JIT onboarding in a tenant-safe model." },
  { title: "Provider Vault", body: "Store upstream provider credentials centrally and bind them to tenant policy and model allowlists." },
  { title: "Multi-tenant Control Plane", body: "Run all of this with tenant-aware auth, isolation, scoped exports, and organization-safe operations." },
];

const operationsHighlights = [
  {
    title: "Security floors that override weak policy",
    body: "Critical prompt-injection, PII, secret-exposure, and repeat-attack signals can hard-block even if a weaker tenant policy was configured.",
    icon: CalendarClock,
  },
  {
    title: "Runtime decisions with traceable failures",
    body: "Correlation IDs, stable decision envelopes, request logging, and incident linkage make enforcement behavior inspectable instead of opaque.",
    icon: ChartNoAxesCombined,
  },
  {
    title: "Adaptive hardening under attack",
    body: "Repeat adversarial attempts can trigger throttling, escalation, safe-model fallback, quarantine, or forced review.",
    icon: Workflow,
  },
  {
    title: "Immutable trace and incident posture",
    body: "Decision lifecycle records, SHA-256 audit chains, and AI-specific incident playbooks give operators a defendable response story.",
    icon: CheckCircle2,
  },
  {
    title: "Tenant-safe operational controls",
    body: "Org-scoped files, exports, sessions, domains, keys, exceptions, and admin surfaces stay inside real enterprise boundaries.",
    icon: FolderLock,
  },
];

const roleValue = [
  {
    title: "For Compliance Leaders",
    body: "Track control coverage, evidence gaps, incident trends, and reviewer decisions from one operating layer.",
  },
  {
    title: "For Security & Risk Teams",
    body: "Control prompt, output, and tool behavior centrally instead of relying on application teams to get enforcement right every time.",
  },
  {
    title: "For Product Teams",
    body: "Connect AI systems once, then use the gateway or SDK path without rebuilding governance logic inside every app.",
  },
  {
    title: "For Auditors",
    body: "Access structured history, control mapping, runtime evidence, incidents, and exports without chasing sources.",
  },
  {
    title: "For IT and Identity Owners",
    body: "Deploy enterprise sign-in, verified domains, and controlled onboarding without stitching governance into the IdP by hand.",
  },
  {
    title: "For Operating Partners",
    body: "Assess portfolio readiness, enforcement maturity, and escalation discipline from a single multi-tenant control plane.",
  },
];

const faqItems = [
  {
    q: "What is AI Control Tower?",
    a: "AI Control Tower is a runtime governance and control platform for AI systems. It combines registry, policy, inline enforcement, incidents, evidence, approvals, and audit operations in one control plane.",
  },
  {
    q: "Who is it for?",
    a: "Compliance teams, security teams, platform teams, AI governance owners, product teams, and auditors in regulated or high-scrutiny environments.",
  },
  {
    q: "Does it only monitor after the fact?",
    a: "No. The platform can run inline so prompts are checked before model execution and outputs are checked before release. It can also run in SDK mode when a full gateway is not the right fit.",
  },
  {
    q: "Which providers can it control?",
    a: "It supports OpenAI, Anthropic, Gemini, Azure OpenAI, Vertex AI, Bedrock, and OpenAI-compatible providers through a central gateway model.",
  },
  {
    q: "Can it control tool or action execution?",
    a: "Yes. Tool calls can be constrained with allowlists and typed argument validation so the model cannot execute arbitrary actions just because it requested them.",
  },
  {
    q: "How are false positives handled?",
    a: "Reviewers can create tenant-scoped exceptions so a known acceptable pattern can be allowed for one organization or system without weakening policy for everyone else.",
  },
  {
    q: "How much prompt and output data does it collect?",
    a: "Customers can choose minimal, redacted, or full-evidence telemetry profiles based on privacy, legal, and operational requirements.",
  },
  {
    q: "Can it support audits and investigations?",
    a: "Yes. Runtime events, incidents, approvals, evidence, and decision traces are linked so teams can explain what happened and why a decision was taken.",
  },
  {
    q: "How does it fit into the enterprise stack?",
    a: "AI Control Tower supports SDK integration, inline gateway mode, enterprise identity, provider credential vaulting, API documentation, and tenant-safe administration.",
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
              Control prompts, outputs, and AI actions before they become production incidents.
            </h1>
            <p className="text-sm text-muted-foreground sm:text-base">
              AI Control Tower is the runtime control plane for enterprise AI. Register systems, bind policy, intercept model traffic,
              govern tool execution, open incidents automatically, and keep the full evidence trail tied to business context.
            </p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {[
                "Inline prompt preflight and output postflight enforcement",
                "Gateway and SDK deployment modes for real application traffic",
                "Tool allowlists, typed argument policy, and multi-provider control",
                "Incidents, evidence, decision traces, and audit in one path",
                "Tenant-safe identity, provider vaulting, and review workflows",
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
              <CardTitle className="text-base">Runtime Control Snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-md border border-border/70 bg-muted/30 p-3">
                  <p className="text-muted-foreground">Telemetry Events</p>
                  <p className="mt-1 text-lg font-semibold">36</p>
                </div>
                <div className="rounded-md border border-border/70 bg-muted/30 p-3">
                  <p className="text-muted-foreground">Blocked Decisions</p>
                  <p className="mt-1 text-lg font-semibold">6</p>
                </div>
                <div className="rounded-md border border-border/70 bg-muted/30 p-3">
                  <p className="text-muted-foreground">Threshold Breaches</p>
                  <p className="mt-1 text-lg font-semibold">18</p>
                </div>
                <div className="rounded-md border border-border/70 bg-muted/30 p-3">
                  <p className="text-muted-foreground">Escalated Incidents</p>
                  <p className="mt-1 text-lg font-semibold">12</p>
                </div>
              </div>
              <div className="rounded-md border border-border/70 bg-muted/25 p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Latest Enforcement Outcomes</p>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between rounded bg-background/60 px-2 py-1.5">
                    <span>Claims Support Assistant Prompt</span>
                    <span className="rounded bg-rose-500/15 px-2 py-0.5 text-rose-500">Blocked</span>
                  </div>
                  <div className="flex items-center justify-between rounded bg-background/60 px-2 py-1.5">
                    <span>Talent Review Output Evaluation</span>
                    <span className="rounded bg-amber-500/15 px-2 py-0.5 text-amber-500">Escalated</span>
                  </div>
                </div>
              </div>
              <div className="grid gap-2 rounded-md border border-border/70 bg-background/40 p-3 text-xs sm:grid-cols-3">
                <div>
                  <p className="text-muted-foreground">Enforcement</p>
                  <p className="mt-1 font-semibold text-foreground">Prompt, output, and tool control</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Providers</p>
                  <p className="mt-1 font-semibold text-foreground">Native + compatible gateway coverage</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Auditability</p>
                  <p className="mt-1 font-semibold text-foreground">Incident, evidence, and decision trace linkage</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <Section
        id="product"
        eyebrow="Credibility"
        title="Built for teams that need more than passive monitoring"
        subtitle="Real AI control requires a system registry, inline enforcement, action policy, and tenant-safe operations."
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
        subtitle="AI adoption accelerates while runtime control stays fragmented across apps, gateways, and teams."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {painPoints.map((item) => (
            <Card key={item} className="border-border/70 bg-card/70">
              <CardContent className="pt-5 text-sm text-muted-foreground">{item}</CardContent>
            </Card>
          ))}
        </div>
        <p className="mt-6 text-sm text-foreground/90">
          AI Control Tower replaces fragmented governance with one control plane for AI registration, runtime enforcement, review, and audit.
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
        title="Built to run in production, not just to observe production"
        subtitle="The platform exposes the operational controls enterprise teams need once governance moves from policy documents into live traffic."
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
            <p className="mt-2 font-medium">Use gateway mode, SDK mode, provider vaulting, and enforcement telemetry to control runtime behavior centrally.</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/70 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">For enterprise buyers</p>
            <p className="mt-2 font-medium">Show identity federation, inline control, incident discipline, and tenant-safe operations without hand-wavy future claims.</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/70 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">For integrators</p>
            <p className="mt-2 font-medium">Expose API docs, OpenAI-compatible routes, and controlled onboarding paths from the same product surface.</p>
          </div>
        </div>
      </Section>

      <Section id="how-it-works" eyebrow="How it Works" title="A practical control flow from intake to audit">
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

      <Section title="What the platform gives your team" subtitle="Capabilities designed for day-to-day runtime governance execution.">
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

      <Section id="pricing" eyebrow="Deployment" title="Deployment models built for governance maturity">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="border-border/70 bg-card/70">
            <CardHeader>
              <CardTitle className="text-xl">SDK Guard</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">For teams that need application-side guardrails without changing upstream routing first.</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>Preflight and postflight checks in app code</li>
                <li>Linked telemetry, incidents, and audit</li>
                <li>Fastest path to first runtime control</li>
              </ul>
              <Button className="w-full" asChild>
                <a href={trackedPath("/start-pilot", "deployment_sdk_start")} onClick={handleCtaClick("deployment_sdk", "start_pilot")}>Start a Pilot</a>
              </Button>
            </CardContent>
          </Card>
          <Card className="border-primary/40 bg-card/70">
            <CardHeader>
              <CardTitle className="text-xl">Inline Gateway</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">For organizations that want all model traffic to pass through a central control point.</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>Prompt, output, and tool interception</li>
                <li>Provider vaulting and model allowlists</li>
                <li>Best fit for real control-tower operations</li>
              </ul>
              <Button className="w-full" variant="outline" asChild>
                <a href={trackedPath("/book-demo", "deployment_gateway_book_demo")} onClick={handleCtaClick("deployment_gateway", "book_demo")}>Book a Demo</a>
              </Button>
            </CardContent>
          </Card>
          <Card className="border-border/70 bg-card/70">
            <CardHeader>
              <CardTitle className="text-xl">Tenant Enterprise</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">For regulated deployments that need strict policy, review memory, and portfolio-wide governance controls.</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>Repeat-attack controls and forced review options</li>
                <li>Tenant-scoped exceptions and evidence workflows</li>
                <li>Enterprise identity and multi-org control plane</li>
              </ul>
              <Button className="w-full" variant="outline" asChild>
                <a href={trackedPath("/book-demo", "deployment_enterprise_book_demo")} onClick={handleCtaClick("deployment_enterprise", "book_demo")}>Book Enterprise Demo</a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="Designed around real governance work">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-border/70 bg-card/70">
            <CardContent className="pt-6 text-sm text-muted-foreground">
              “Intercept the turn before the model, not just the incident after the model.”
            </CardContent>
          </Card>
          <Card className="border-border/70 bg-card/70">
            <CardContent className="pt-6 text-sm text-muted-foreground">
              “Bind every runtime decision to a real system, real owner, and real policy.”
            </CardContent>
          </Card>
          <Card className="border-border/70 bg-card/70">
            <CardContent className="pt-6 text-sm text-muted-foreground">
              “Use incidents, evidence, and decision traces to keep governance explainable under pressure.”
            </CardContent>
          </Card>
        </div>
      </Section>

      <section className="border-y border-border/70 bg-muted/20 py-16 sm:py-20">
        <div className="mx-auto w-full max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Bring your AI systems, runtime policy, incidents, and evidence into one control tower.
          </h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            See how your organization can move from scattered governance to central runtime control.
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
              Enterprise AI runtime governance with policy enforcement, evidence, and audit-ready control.
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
            <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5 text-primary" /> Reviewer workflows</span>
            <span className="inline-flex items-center gap-1"><ChartNoAxesCombined className="h-3.5 w-3.5 text-primary" /> Runtime telemetry</span>
            <span className="inline-flex items-center gap-1"><FolderLock className="h-3.5 w-3.5 text-primary" /> Tenant isolation</span>
            <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5 text-primary" /> Incident discipline</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
