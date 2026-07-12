import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  ExternalLink,
  Fingerprint,
  Network,
  ScanLine,
  ShieldCheck,
} from "lucide-react";
import { Link } from "wouter";
import { ActurusControlPlane } from "@/components/acturus-control-plane";
import {
  ActurusFooter,
  ActurusMark,
  ActurusPublicHeader,
  Reveal,
  usePublicReducedMotion,
} from "@/components/acturus-public-shell";
import { ACTURUS_BRAND } from "@/lib/brand";

const FOUNDERS = [
  {
    initials: "RM",
    name: "Revanth Meda",
    role: "Co-founder",
    linkedin: ACTURUS_BRAND.founderLinkedIn.revanth,
    statement: "Mission-critical engineering, applied to enterprise AI.",
    bio: "An industrial automation and software engineer whose work spans mission-critical SCADA and PLC systems and AI-enabled enterprise software. Revanth brings field-engineering discipline to AI CONTROL GRID: know what is running, define the control boundary, and keep evidence connected to every decision.",
    focus: ["Industrial automation", "Software engineering", "Enterprise AI"],
  },
  {
    initials: "HT",
    name: "Hitesh Thakkarr",
    role: "Co-founder",
    linkedin: ACTURUS_BRAND.founderLinkedIn.hitesh,
    statement: "Turning technical control into an enterprise operating model.",
    bio: "A business and technology leader with experience in strategic management and information security. Hitesh brings the commercial, security, and adoption perspective needed to turn deep platform capability into an operating model enterprise teams can understand and use.",
    focus: ["Strategic management", "Information security", "Enterprise adoption"],
  },
] as const;

const ORIGIN_STEPS = [
  {
    number: "01",
    title: "The gap",
    body: "Enterprise AI moved into real workflows faster than ownership, controls, and evidence could keep up.",
  },
  {
    number: "02",
    title: "The conviction",
    body: "AI needs the same operating discipline as any mission-critical system: visibility, explicit control, accountable response, and a reconstructable trail.",
  },
  {
    number: "03",
    title: "The build",
    body: "ACTURUS was formed to turn that discipline into AI CONTROL GRID—a practical control layer for enterprise AI in motion.",
  },
] as const;

const CONTROL_STAGES = ["Register", "Assess", "Enforce", "Respond", "Prove"] as const;

const BUILD_AREAS = [
  {
    number: "01",
    icon: ScanLine,
    title: "System intelligence",
    body: "One governed record of AI systems, owners, purpose, risk, approvals, and control readiness.",
  },
  {
    number: "02",
    icon: ShieldCheck,
    title: "Runtime control",
    body: "Policy checks that travel with prompts, outputs, approvals, and high-consequence actions.",
  },
  {
    number: "03",
    icon: Network,
    title: "Incident operations",
    body: "Turn a serious policy breach into owned response work with severity, context, and containment.",
  },
  {
    number: "04",
    icon: Fingerprint,
    title: "Decision evidence",
    body: "Keep the system, human action, policy reason, outcome, and response history connected.",
  },
] as const;

const PRINCIPLES = [
  {
    number: "01",
    title: "Visible by default",
    body: "Teams cannot govern AI they cannot see. Inventory, ownership, context, and live posture belong in one operating picture.",
  },
  {
    number: "02",
    title: "Control in the flow",
    body: "Governance becomes useful when it reaches the decision while the work is happening—not only after a review.",
  },
  {
    number: "03",
    title: "Evidence with meaning",
    body: "A record is defensible when teams can reconstruct what happened, why it happened, and who owned the next step.",
  },
] as const;

function EditorialKicker({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div
      className={
        "inline-flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.24em] " +
        (dark ? "text-black/65" : "text-white/60")
      }
    >
      <span
        className={
          "relative h-2.5 w-2.5 border " +
          (dark ? "border-black/70" : "border-[#F58227]")
        }
        aria-hidden="true"
      >
        <span
          className={
            "absolute left-1/2 top-1/2 h-px w-4 -translate-x-1/2 -translate-y-1/2 " +
            (dark ? "bg-black/35" : "bg-[#F58227]/60")
          }
        />
      </span>
      {children}
    </div>
  );
}

function ControlSpine() {
  return (
    <div className="border-y border-black/25 bg-[#F58227] text-[#090909]" aria-label="AI CONTROL GRID operating loop">
      <div className="mx-auto max-w-[1180px] px-2 sm:px-6">
        <ol className="grid grid-cols-5">
          {CONTROL_STAGES.map((stage, index) => (
            <li
              key={stage}
              className={
                "relative flex min-h-[80px] flex-col items-center justify-center gap-2 px-1 text-center sm:min-h-[86px] sm:flex-row sm:gap-4 sm:px-4 sm:text-left sm:first:pl-0 sm:last:pr-0 " +
                (index < CONTROL_STAGES.length - 1 ? "border-r border-black/20" : "")
              }
            >
              <span className="font-mono text-[7px] text-black/50 sm:text-[9px]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="font-acturus-display text-[9px] uppercase tracking-[0.02em] sm:text-base sm:tracking-[0.06em]">
                {stage}
              </span>
              {index < CONTROL_STAGES.length - 1 ? (
                <span className="absolute right-[-4px] top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 border border-black/50 bg-[#F58227]" aria-hidden="true" />
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function FounderPlate({
  initials,
  index,
}: {
  initials: string;
  index: number;
}) {
  const orange = index === 0;
  return (
    <div
      className={
        "relative min-h-[320px] overflow-hidden border-b border-black/25 p-7 text-black lg:min-h-full lg:border-b-0 lg:border-r " +
        (orange ? "bg-[#F58227]" : "bg-[#EEE9DF]")
      }
    >
      <div
        className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(0,0,0,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.16)_1px,transparent_1px)] [background-size:34px_34px]"
        aria-hidden="true"
      />
      <div className="absolute inset-y-0 left-1/2 w-px bg-black/20" aria-hidden="true" />
      <div className="absolute inset-x-0 top-1/2 h-px bg-black/20" aria-hidden="true" />
      <div className="absolute left-1/2 top-1/2 h-36 w-36 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-black/30 sm:h-44 sm:w-44" aria-hidden="true">
        <div className="absolute inset-5 border border-black/20" />
      </div>
      <div className="relative flex items-center justify-between text-[9px] font-semibold uppercase tracking-[0.2em]">
        <span>Founder / {String(index + 1).padStart(2, "0")}</span>
        <ActurusMark className="h-5 w-5" />
      </div>
      <div
        className="font-acturus-display absolute bottom-5 left-5 text-[clamp(6.5rem,21vw,11rem)] leading-[0.72] tracking-[-0.09em] sm:bottom-7 sm:left-7"
        aria-hidden="true"
      >
        {initials}
      </div>
      <span className="absolute bottom-7 right-7 font-mono text-[9px] uppercase tracking-[0.18em]">
        ACT / {String(index + 1).padStart(2, "0")}
      </span>
    </div>
  );
}

function FounderCard({ founder, index }: { founder: (typeof FOUNDERS)[number]; index: number }) {
  const reduceMotion = usePublicReducedMotion();

  return (
    <Reveal delay={index * 0.07}>
      <motion.article
        whileHover={reduceMotion ? undefined : { y: -4 }}
        transition={{ duration: 0.25, ease: [0.22, 0.61, 0.36, 1] }}
        className="group grid overflow-hidden border border-white/12 bg-[#101010] lg:grid-cols-[0.76fr_1.24fr]"
      >
        <FounderPlate initials={founder.initials} index={index} />

        <div className="flex flex-col p-7 sm:p-10 lg:p-12">
          <div className="flex items-center justify-between gap-4">
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#F58227]">{founder.role}</span>
            <span className="h-px w-16 bg-white/15" aria-hidden="true" />
          </div>
          <h3 className="font-acturus-display mt-7 text-3xl leading-tight tracking-[-0.03em] text-white sm:text-4xl">{founder.name}</h3>
          <p className="mt-5 max-w-xl text-lg leading-8 text-white/90">{founder.statement}</p>
          <p className="mt-7 max-w-2xl text-[15px] leading-8 text-white/55">{founder.bio}</p>

          <div className="mt-8 flex flex-wrap gap-x-5 gap-y-3 border-t border-white/10 pt-6">
            {founder.focus.map((item) => (
              <span key={item} className="flex items-center gap-2 text-[9px] uppercase tracking-[0.14em] text-white/55">
                <span className="h-1.5 w-1.5 rotate-45 bg-[#F58227]" aria-hidden="true" />
                {item}
              </span>
            ))}
          </div>

          <a
            href={founder.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-10 inline-flex min-h-12 items-center justify-between gap-4 border-t border-white/10 pt-6 text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:text-[#F8A45E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F58227] focus-visible:ring-offset-4 focus-visible:ring-offset-[#101010]"
            aria-label={"View " + founder.name + "'s LinkedIn profile (opens in a new tab)"}
          >
            View LinkedIn profile
            <span className="flex h-10 w-10 items-center justify-center border border-white/15 bg-white/[0.03] transition-colors group-hover:border-[#F58227]/50">
              <ExternalLink className="h-4 w-4" />
            </span>
          </a>
        </div>
      </motion.article>
    </Reveal>
  );
}

export default function ActurusPage() {
  return (
    <div className="min-h-screen overflow-clip bg-[#090909] text-white antialiased" data-public-theme="acturus" data-testid="page-acturus">
      <ActurusPublicHeader theme="acturus" />

      <main id="public-main-content" tabIndex={-1}>
        <section className="relative overflow-hidden px-5 pb-14 pt-32 sm:px-6 sm:pb-20 sm:pt-36 lg:pt-40">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:linear-gradient(to_bottom,black,transparent_88%)]"
            aria-hidden="true"
          />
          <div className="relative mx-auto grid max-w-[1180px] gap-14 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:gap-16">
            <div className="relative z-10">
              <Reveal>
                <EditorialKicker>ACTURUS / The company</EditorialKicker>
              </Reveal>
              <Reveal delay={0.07}>
                <h1 className="font-acturus-display mt-8 max-w-3xl text-[clamp(3.1rem,7.4vw,6.9rem)] leading-[0.88] tracking-[-0.065em] text-[#F6F3EE]">
                  CONTROL FOR AI IN MOTION.
                </h1>
              </Reveal>
              <Reveal delay={0.14}>
                <p className="mt-8 max-w-xl text-base leading-8 text-white/60 sm:text-lg sm:leading-9">
                  ACTURUS is the company behind AI CONTROL GRID—an operating layer that helps enterprise teams see what is running, apply control in the flow, and keep evidence connected to every decision.
                </p>
              </Reveal>
              <Reveal delay={0.21} className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link href="/welcome" className="inline-flex min-h-12 items-center justify-center gap-2 bg-[#F58227] px-7 text-[11px] font-semibold uppercase tracking-[0.16em] text-black transition-colors duration-200 hover:bg-[#FFA65E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F58227] focus-visible:ring-offset-4 focus-visible:ring-offset-black">
                  Explore the product <ArrowRight className="h-4 w-4" />
                </Link>
                <a href="#founders" className="inline-flex min-h-12 items-center justify-center gap-2 border border-white/20 bg-[#0F0F0F] px-7 text-[11px] uppercase tracking-[0.16em] text-white/75 transition-colors duration-200 hover:border-white/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F58227] focus-visible:ring-offset-4 focus-visible:ring-offset-black">
                  Meet the founders <ArrowUpRight className="h-4 w-4" />
                </a>
              </Reveal>
            </div>

            <div className="relative">
              <div className="absolute -left-3 -top-3 h-8 w-8 border-l border-t border-[#F58227]" aria-hidden="true" />
              <div className="absolute -bottom-3 -right-3 h-8 w-8 border-b border-r border-[#F58227]" aria-hidden="true" />
              <div className="relative overflow-hidden border border-white/10 bg-[#F58227] p-3 sm:p-5">
                <ActurusControlPlane />
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4 font-mono text-[9px] uppercase tracking-[0.17em] text-white/40">
                <span>Govern what is running</span>
                <span>Prove every decision</span>
              </div>
            </div>
          </div>
        </section>

        <ControlSpine />

        <section id="story" className="scroll-mt-20 bg-[#EEE9DF] px-5 py-24 text-black sm:px-6 lg:py-32">
          <div className="mx-auto max-w-[1180px]">
            <Reveal>
              <EditorialKicker dark>Why ACTURUS exists</EditorialKicker>
              <div className="mt-8 grid gap-8 lg:grid-cols-[1.18fr_0.82fr] lg:items-end">
                <h2 className="font-acturus-display max-w-5xl text-[clamp(2.35rem,5.8vw,5rem)] leading-[1.01] tracking-[-0.05em]">
                  AI MOVED INTO THE WORKFLOW. GOVERNANCE STAYED IN DOCUMENTS.
                </h2>
                <p className="max-w-xl text-base leading-8 text-black/62 lg:justify-self-end">
                  ACTURUS began with a practical observation: enterprise AI was becoming operational while governance remained disconnected from the moment of use. Revanth Meda and Hitesh Thakkarr are building the operating response together.
                </p>
              </div>
            </Reveal>

            <div className="mt-14 border-t border-black/25">
              {ORIGIN_STEPS.map((item) => (
                <article key={item.number} className="grid gap-5 border-b border-black/25 py-8 sm:grid-cols-[80px_0.8fr_1.2fr] sm:items-start sm:px-4 lg:py-10">
                  <span className="font-mono text-xs text-black/50">{item.number}</span>
                  <h3 className="font-acturus-display text-lg leading-7">{item.title}</h3>
                  <p className="max-w-2xl text-sm leading-7 text-black/62 sm:text-[15px]">{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="founders" className="scroll-mt-20 bg-[#0C0C0C] px-5 py-24 sm:px-6 lg:py-32">
          <div className="mx-auto max-w-[1180px]">
            <Reveal>
              <EditorialKicker>The co-founders</EditorialKicker>
              <div className="mt-8 grid gap-8 lg:grid-cols-[1.08fr_0.72fr] lg:items-end">
                <h2 className="font-acturus-display min-w-0 break-words text-[clamp(2.15rem,5.4vw,4.8rem)] leading-[1.02] tracking-[-0.05em]">
                  ENGINEERING DISCIPLINE. ENTERPRISE PERSPECTIVE.
                </h2>
                <p className="max-w-xl text-base leading-8 text-white/50 lg:justify-self-end">
                  ACTURUS is co-founded by Revanth Meda and Hitesh Thakkarr. Their work brings together operational engineering, software, strategy, and information security.
                </p>
              </div>
            </Reveal>

            <div className="mt-14 space-y-7">
              {FOUNDERS.map((founder, index) => (
                <FounderCard key={founder.name} founder={founder} index={index} />
              ))}
            </div>
          </div>
        </section>

        <section id="product" className="scroll-mt-20 bg-[#090909] px-5 py-24 sm:px-6 lg:py-32">
          <div className="mx-auto max-w-[1180px]">
            <Reveal>
              <EditorialKicker>What we are building</EditorialKicker>
              <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_0.72fr] lg:items-end">
                <h2 className="font-acturus-display max-w-4xl text-[clamp(2.25rem,5.2vw,4.7rem)] leading-[1.03] tracking-[-0.05em]">
                  GOVERNANCE THAT MOVES WITH THE WORK.
                </h2>
                <p className="max-w-lg text-base leading-8 text-white/50 lg:justify-self-end">
                  AI CONTROL GRID connects four operating responsibilities—system intelligence, runtime control, incident operations, and decision evidence—into one enterprise control layer.
                </p>
              </div>
            </Reveal>

            <div className="mt-14 grid border-l border-t border-white/12 md:grid-cols-2">
              {BUILD_AREAS.map((area) => (
                <article key={area.title} className="group relative min-h-[300px] overflow-hidden border-b border-r border-white/12 bg-[#101010] p-7 transition-colors duration-200 hover:bg-[#141414] sm:p-9">
                  <div className="absolute inset-x-0 top-0 h-px bg-[#F58227]/80" aria-hidden="true" />
                  <span className="absolute right-8 top-0 h-2.5 w-2.5 -translate-y-1/2 rotate-45 bg-[#F58227]" aria-hidden="true" />
                  <div className="relative flex items-center justify-between">
                    <span className="flex h-12 w-12 rotate-45 items-center justify-center border border-white/15 bg-white/[0.03] text-[#F58227]">
                      <area.icon className="h-5 w-5 -rotate-45" />
                    </span>
                    <span className="font-mono text-[10px] text-white/30">{area.number}</span>
                  </div>
                  <h3 className="font-acturus-display relative mt-11 text-xl tracking-[-0.02em] text-white sm:text-2xl">{area.title}</h3>
                  <p className="relative mt-5 max-w-xl text-sm leading-7 text-white/50 sm:text-[15px]">{area.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="principles" className="scroll-mt-20 bg-[#EEE9DF] px-5 py-24 text-black sm:px-6 lg:py-32">
          <div className="mx-auto max-w-[1180px]">
            <Reveal>
              <EditorialKicker dark>What guides the work</EditorialKicker>
              <h2 className="font-acturus-display mt-8 max-w-5xl break-words text-[clamp(2.15rem,5vw,4.6rem)] leading-[1.03] tracking-[-0.05em]">
                CLARITY WHEN CONSEQUENCES ARE REAL.
              </h2>
            </Reveal>

            <div className="mt-14 border-t border-black/20">
              {PRINCIPLES.map((principle) => (
                <article key={principle.title} className="grid gap-5 border-b border-black/20 py-8 sm:grid-cols-[80px_0.8fr_1.2fr] sm:items-start lg:py-10">
                  <span className="font-mono text-[10px] text-black/45">{principle.number}</span>
                  <h3 className="font-acturus-display text-xl leading-7 tracking-[-0.02em]">{principle.title}</h3>
                  <p className="max-w-2xl text-sm leading-7 text-black/60 sm:text-[15px]">{principle.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden bg-[#F58227] px-5 py-24 text-black sm:px-6 lg:py-32">
          <div
            className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(0,0,0,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.18)_1px,transparent_1px)] [background-size:36px_36px]"
            aria-hidden="true"
          />
          <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 overflow-hidden whitespace-nowrap text-center font-acturus-display text-[clamp(7rem,20vw,18rem)] leading-none tracking-[-0.08em] text-black/[0.045]" aria-hidden="true">
            ACTURUS
          </div>
          <div className="pointer-events-none absolute left-6 top-6 h-10 w-10 border-l border-t border-black/35" aria-hidden="true" />
          <div className="pointer-events-none absolute bottom-6 right-6 h-10 w-10 border-b border-r border-black/35" aria-hidden="true" />

          <Reveal className="relative mx-auto max-w-[980px] text-center">
            <div className="mx-auto flex h-14 w-14 rotate-45 items-center justify-center border border-black/30 bg-black text-[#F58227]">
              <ActurusMark className="h-7 w-7 -rotate-45" />
            </div>
            <div className="mt-7"><EditorialKicker dark>See AI governance operate</EditorialKicker></div>
            <h2 className="font-acturus-display mt-8 break-words text-[clamp(2.15rem,5.8vw,5.1rem)] leading-[1.01] tracking-[-0.055em]">
              SEE AI GOVERNANCE OPERATE.
            </h2>
            <p className="mx-auto mt-7 max-w-2xl text-base leading-8 text-black/65">
              Walk through one governed AI request—from useful work released to a risky action stopped, investigated, and preserved as evidence.
            </p>
            <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/book-demo" className="inline-flex min-h-12 items-center justify-center gap-2 bg-black px-7 text-[11px] font-semibold uppercase tracking-[0.16em] text-white transition-colors duration-200 hover:bg-[#1B1B1B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-4 focus-visible:ring-offset-[#F58227]">
                Book a private demo <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/welcome" className="inline-flex min-h-12 items-center justify-center gap-2 border border-black/30 bg-[#F58227] px-7 text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors hover:bg-[#FFA65E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-4 focus-visible:ring-offset-[#F58227]">
                Explore the platform <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </Reveal>
        </section>
      </main>

      <ActurusFooter theme="acturus" />
    </div>
  );
}
