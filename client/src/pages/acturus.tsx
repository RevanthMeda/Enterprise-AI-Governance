import { motion } from "framer-motion";
import {
  ArrowRight,
  Compass,
  ExternalLink,
  Eye,
  Fingerprint,
  Link2,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import { Link } from "wouter";
import {
  ActurusFooter,
  ActurusMark,
  ActurusPublicHeader,
  Reveal,
  usePublicReducedMotion,
} from "@/components/acturus-public-shell";
import {
  ActurusLiquidBackdrop,
  ActurusLiquidCore,
} from "@/components/acturus-liquid-scene";
import { ACTURUS_BRAND } from "@/lib/brand";

const FOUNDERS = [
  {
    initials: "RM",
    name: "Revanth Meda",
    role: "Co-founder",
    linkedin: ACTURUS_BRAND.founderLinkedIn.revanth,
    bio: "An industrial automation and software engineer working across SCADA, PLC, and AI-enabled enterprise tools. Revanth began AI CONTROL GRID after seeing a familiar operational gap: powerful technology entering production without the live controls, ownership, and evidence expected in mission-critical systems.",
    focus: ["Industrial automation", "Software engineering", "Enterprise AI"],
    accent: "copper",
  },
  {
    initials: "HT",
    name: "Hitesh Thakkarr",
    role: "Co-founder",
    linkedin: ACTURUS_BRAND.founderLinkedIn.hitesh,
    bio: "A business and technology leader with a background spanning strategic management, information security, and enterprise relationships. Hitesh brings the customer, security, and adoption perspective needed to turn a deeply technical governance platform into an operating model organisations can use.",
    focus: ["Strategic management", "Information security", "Enterprise relationships"],
    accent: "lilac",
  },
] as const;

const ORIGIN_STEPS = [
  {
    number: "01",
    title: "The observation",
    body: "Enterprise AI was moving into real workflows faster than ownership, controls, and evidence could follow it.",
  },
  {
    number: "02",
    title: "The engineering response",
    body: "Bring the operating discipline of mission-critical systems to AI: visibility, explicit control, incident response, and a reconstructable trail.",
  },
  {
    number: "03",
    title: "The company",
    body: "ACTURUS is being built to develop AI CONTROL GRID and turn that model into a practical enterprise platform.",
  },
];

const PRINCIPLES = [
  {
    icon: Eye,
    title: "Make AI visible",
    body: "Teams cannot govern systems they cannot see. Inventory, ownership, context, and live posture belong in one operating picture.",
    number: "01",
  },
  {
    icon: ShieldCheck,
    title: "Put control in the flow",
    body: "Governance has to reach prompts, outputs, approvals, and incidents while the work is happening—not only after review.",
    number: "02",
  },
  {
    icon: Fingerprint,
    title: "Keep evidence connected",
    body: "A decision is defensible when the policy reason, system, human action, and response history can be reconstructed together.",
    number: "03",
  },
];

function LiquidKicker({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div className={`flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.24em] ${dark ? "text-[#57263A]" : "text-[#F4B982]"}`}>
      <span className={`h-px w-8 bg-gradient-to-r ${dark ? "from-[#C36F57] to-[#9B6ABC]" : "from-[#F4B982] to-[#C5A0FA]"}`} />
      {children}
    </div>
  );
}

function FounderCard({ founder, index }: { founder: (typeof FOUNDERS)[number]; index: number }) {
  const reduceMotion = usePublicReducedMotion();
  const copper = founder.accent === "copper";

  return (
    <Reveal delay={index * 0.09} className="h-full">
      <motion.article
        whileHover={reduceMotion ? undefined : { y: -8, rotateX: 1.2, rotateY: index === 0 ? -1.2 : 1.2 }}
        transition={{ duration: 0.35, ease: [0.22, 0.61, 0.36, 1] }}
        className="group relative flex h-full flex-col overflow-hidden rounded-[28px] border border-white/[0.13] bg-white/[0.065] p-6 shadow-[0_28px_90px_rgba(5,2,9,0.3)] backdrop-blur-xl sm:p-8 lg:p-10 [transform-style:preserve-3d]"
      >
        <div
          className={`pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-[42%_58%_60%_40%/56%_42%_58%_44%] blur-3xl transition-opacity duration-500 group-hover:opacity-90 ${copper ? "bg-[#E98162]/25" : "bg-[#B997F0]/25"}`}
          aria-hidden="true"
        />
        <div className="relative flex min-w-0 items-center gap-3 pr-8 sm:gap-4 sm:pr-10">
          <div className={`relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[46%_54%_43%_57%/59%_42%_58%_41%] border border-white/30 shadow-[inset_10px_10px_30px_rgba(255,255,255,0.12)] sm:h-[72px] sm:w-[72px] ${copper ? "bg-[linear-gradient(145deg,#F2BE8F,#A95363_72%,#3A183B)]" : "bg-[linear-gradient(145deg,#E5CCFF,#9B76BF_62%,#48204E)]"}`}>
              <span className="font-acturus-display relative z-10 text-sm tracking-[0.08em] text-[#170B1D]">{founder.initials}</span>
              <span className="absolute left-2 top-2 h-5 w-9 -rotate-12 rounded-full bg-white/[0.45] blur-[1px]" />
          </div>
          <div className="min-w-0">
            <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#F4B982]">{founder.role}</div>
            <h3 className="font-acturus-display mt-2 break-words text-base tracking-[-0.01em] text-[#FFF8EF] sm:text-xl">{founder.name}</h3>
          </div>
          <span className="absolute right-0 top-0 font-mono text-[10px] text-white/[0.58]">0{index + 1}</span>
        </div>

        <p className="relative mt-8 flex-1 text-[15px] leading-7 text-white/[0.66]">{founder.bio}</p>

        <div className="relative mt-8 flex flex-wrap gap-2">
          {founder.focus.map((item) => (
            <span key={item} className="rounded-full border border-white/[0.12] bg-white/[0.045] px-3 py-1.5 text-[9px] uppercase tracking-[0.13em] text-white/[0.62]">
              {item}
            </span>
          ))}
        </div>

        <a
          href={founder.linkedin}
          target="_blank"
          rel="noopener noreferrer"
          className="relative mt-8 inline-flex min-h-11 items-center justify-between gap-2 border-t border-white/10 pt-6 text-[10px] font-semibold uppercase tracking-[0.17em] text-[#FFD3A7] transition-colors duration-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFD0A2] focus-visible:ring-offset-4 focus-visible:ring-offset-[#170B1E]"
          aria-label={`View ${founder.name}'s LinkedIn profile (opens in a new tab)`}
        >
          View LinkedIn profile
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.14] bg-white/[0.04]">
            <ExternalLink className="h-3.5 w-3.5" />
          </span>
        </a>
      </motion.article>
    </Reveal>
  );
}

export default function ActurusPage() {
  return (
    <div className="min-h-screen overflow-clip bg-[#100916] text-white antialiased" data-public-theme="acturus" data-testid="page-acturus">
      <ActurusPublicHeader theme="acturus" />

      <main id="public-main-content" tabIndex={-1}>
        <section className="relative isolate flex min-h-[880px] overflow-hidden px-5 pb-28 pt-32 sm:px-6 lg:min-h-[940px] lg:items-center lg:pb-32 lg:pt-36">
          <ActurusLiquidBackdrop />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(16,9,22,0.58)_0%,rgba(16,9,22,0.8)_46%,rgba(16,9,22,0.74)_100%)] lg:bg-[linear-gradient(90deg,rgba(16,9,22,0.9)_0%,rgba(16,9,22,0.62)_48%,rgba(16,9,22,0.12)_78%)]" aria-hidden="true" />
          <div className="pointer-events-none absolute left-1/2 top-20 h-[620px] w-[620px] -translate-x-1/2 rounded-full border border-white/[0.07]" aria-hidden="true" />
          <div className="pointer-events-none absolute left-1/2 top-36 h-[500px] w-[500px] -translate-x-1/2 rounded-full border border-white/[0.05]" aria-hidden="true" />

          <div className="relative z-10 mx-auto grid w-full max-w-[1200px] items-center gap-12 lg:grid-cols-[1.08fr_0.92fr] lg:gap-14">
            <div>
              <Reveal>
                <LiquidKicker>The company behind AI CONTROL GRID</LiquidKicker>
                <div className="mt-8 inline-flex items-center gap-3 rounded-full border border-white/[0.14] bg-[#1A0F22]/[0.45] px-4 py-2 text-[#FFD1A1] shadow-[0_18px_55px_rgba(7,2,11,0.2)] backdrop-blur-xl">
                  <ActurusMark className="h-5 w-5" />
                  <span className="text-[9px] uppercase tracking-[0.2em] text-white/[0.68]">Building for accountable AI</span>
                </div>
              </Reveal>
              <Reveal delay={0.08}>
                <h1 className="font-acturus-display mt-7 text-[clamp(2.55rem,10.5vw,8.25rem)] leading-[0.88] tracking-[-0.055em] text-[#FFF9F1]">
                  ACTURUS
                </h1>
              </Reveal>
              <Reveal delay={0.15}>
                <p className="mt-8 max-w-2xl text-lg leading-8 text-white/[0.68] sm:text-xl sm:leading-9">
                  We build the operating layer that helps enterprise AI move with clarity, control, and evidence.
                </p>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-white/[0.66] sm:text-[15px]">
                  ACTURUS develops AI CONTROL GRID, bringing system registration, risk, controls, approvals, runtime monitoring, incidents, and audit evidence into one governed workspace.
                </p>
              </Reveal>
              <Reveal delay={0.22} className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link href="/welcome" className="inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-[#F0AD79] px-5 text-[10px] font-semibold uppercase tracking-[0.11em] text-[#26101E] shadow-[0_16px_46px_rgba(224,131,93,0.25)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#FFD0A2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFD0A2] focus-visible:ring-offset-2 focus-visible:ring-offset-[#100916] sm:px-6 sm:text-xs sm:tracking-[0.14em]">
                  Explore AI CONTROL GRID <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/book-demo" className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/[0.18] bg-white/[0.06] px-6 text-xs uppercase tracking-[0.14em] text-white/75 backdrop-blur-xl transition-colors duration-300 hover:border-[#D0ACFF]/50 hover:bg-white/[0.1] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D0ACFF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#100916]">
                  Book a demo
                </Link>
              </Reveal>
            </div>

            <Reveal delay={0.1}>
              <ActurusLiquidCore />
            </Reveal>
          </div>

          <div className="absolute bottom-8 left-1/2 z-10 hidden -translate-x-1/2 items-center gap-3 text-[9px] uppercase tracking-[0.22em] text-white/60 sm:flex">
            <span className="h-8 w-px bg-gradient-to-b from-[#F3B17D] to-transparent" />
            Follow the story
          </div>
        </section>

        <section className="relative overflow-hidden bg-[#F4EADD] px-5 py-24 text-[#29142E] sm:px-6 lg:py-32">
          <div className="pointer-events-none absolute -right-24 -top-36 h-[430px] w-[430px] rounded-[42%_58%_48%_52%/52%_38%_62%_48%] bg-[#D7BCF0]/[0.45] blur-3xl" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-48 -left-28 h-[500px] w-[500px] rounded-[58%_42%_62%_38%/46%_61%_39%_54%] bg-[#F2AD7F]/[0.35] blur-3xl" aria-hidden="true" />
          <div className="relative mx-auto max-w-[1200px]">
            <div className="grid gap-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-24">
              <Reveal>
                <LiquidKicker dark>How it started</LiquidKicker>
                <h2 className="font-acturus-display mt-8 text-3xl leading-[1.16] tracking-[-0.03em] sm:text-5xl">
                  A practical question became a company.
                </h2>
                <p className="mt-7 max-w-md text-base leading-7 text-[#664D61]">
                  How can enterprise teams turn AI governance from policy into day-to-day operations? The idea behind ACTURUS is to connect governance decisions to the systems, workflows, and evidence teams use every day.
                </p>
                <div className="mt-10 flex items-center gap-3 text-[#744537]">
                  <Sparkles className="h-4 w-4" />
                  <span className="text-[9px] font-semibold uppercase tracking-[0.2em]">Technology with operational discipline</span>
                </div>
              </Reveal>

              <div className="space-y-4">
                {ORIGIN_STEPS.map((item, index) => (
                  <Reveal key={item.number} delay={index * 0.07}>
                    <article className="group grid gap-5 rounded-[24px] border border-white/80 bg-white/[0.55] p-6 shadow-[0_24px_80px_rgba(71,37,55,0.08)] backdrop-blur-xl transition-transform duration-300 hover:-translate-y-1 sm:grid-cols-[56px_0.7fr_1.3fr] sm:items-start sm:p-7">
                      <span className="font-mono text-[10px] text-[#7B4038]">{item.number}</span>
                      <h3 className="font-acturus-display text-base leading-6 text-[#321734]">{item.title}</h3>
                      <p className="text-sm leading-6 text-[#6E5669]">{item.body}</p>
                    </article>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="relative isolate overflow-hidden bg-[#120A19] px-5 py-24 sm:px-6 lg:py-32">
          <ActurusLiquidBackdrop soft className="opacity-40" />
          <div className="relative z-10 mx-auto max-w-[1200px]">
            <Reveal>
              <LiquidKicker>The co-founders</LiquidKicker>
              <div className="mt-8 grid gap-8 lg:grid-cols-[1.05fr_0.75fr] lg:items-end">
                <h2 className="font-acturus-display text-3xl leading-[1.16] tracking-[-0.03em] text-[#FFF8EF] sm:text-5xl">
                  Two perspectives.<br />One shared focus.
                </h2>
                <p className="text-base leading-7 text-white/[0.62]">
                  Revanth Meda and Hitesh Thakkarr are the co-founders of ACTURUS and are building AI CONTROL GRID together.
                </p>
              </div>
            </Reveal>
            <div className="mt-12 grid gap-5 [perspective:1400px] lg:grid-cols-2">
              {FOUNDERS.map((founder, index) => <FounderCard key={founder.name} founder={founder} index={index} />)}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden bg-[#21112A] px-5 py-24 sm:px-6 lg:py-32">
          <div className="pointer-events-none absolute left-[12%] top-0 h-72 w-72 rounded-full bg-[#D59BFF]/10 blur-[90px]" aria-hidden="true" />
          <div className="pointer-events-none absolute bottom-0 right-[8%] h-80 w-80 rounded-full bg-[#F29B6E]/10 blur-[100px]" aria-hidden="true" />
          <div className="relative mx-auto max-w-[1200px]">
            <Reveal>
              <LiquidKicker>What guides the work</LiquidKicker>
              <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_0.8fr] lg:items-end">
                <h2 className="font-acturus-display max-w-3xl text-3xl leading-[1.18] tracking-[-0.03em] sm:text-5xl">
                  Principles designed to stay in motion.
                </h2>
                <p className="text-sm leading-7 text-white/[0.55]">
                  Governance becomes useful when it travels with the work—visible to teams, active in decisions, and connected to evidence.
                </p>
              </div>
            </Reveal>
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {PRINCIPLES.map((principle, index) => (
                <Reveal key={principle.title} delay={index * 0.07} className="h-full">
                  <article className="group relative h-full min-h-[310px] overflow-hidden rounded-[26px] border border-white/[0.11] bg-[#170B1E]/[0.65] p-7 shadow-[0_24px_80px_rgba(5,2,9,0.22)] backdrop-blur-xl">
                    <div className={`absolute -right-10 -top-12 h-36 w-36 rounded-[48%_52%_38%_62%/61%_42%_58%_39%] blur-2xl transition-transform duration-700 group-hover:scale-125 ${index === 1 ? "bg-[#C09BEF]/20" : "bg-[#EE986C]/20"}`} aria-hidden="true" />
                    <div className="relative flex items-center justify-between">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/[0.14] bg-white/[0.055] text-[#F2B17D]">
                        <principle.icon className="h-5 w-5" />
                      </span>
                      <span className="font-mono text-[10px] text-white/60">{principle.number}</span>
                    </div>
                    <h3 className="font-acturus-display relative mt-8 text-lg text-[#FFF8EF]">{principle.title}</h3>
                    <p className="relative mt-5 text-sm leading-7 text-white/[0.58]">{principle.body}</p>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden bg-[#F0C89F] px-5 py-24 text-[#2A1228] sm:px-6 lg:py-32">
          <div className="pointer-events-none absolute -left-24 top-1/2 h-[380px] w-[620px] -translate-y-1/2 rotate-[-13deg] rounded-[50%] bg-[linear-gradient(110deg,rgba(255,246,229,0.5),rgba(205,156,226,0.48),rgba(235,118,95,0.28))] opacity-[0.35] blur-2xl sm:opacity-100" aria-hidden="true" />
          <div className="pointer-events-none absolute -right-24 top-1/2 h-[300px] w-[500px] -translate-y-1/2 rotate-[16deg] rounded-[50%] border border-white/40 bg-white/[0.15] backdrop-blur-2xl" aria-hidden="true" />
          <Reveal className="relative mx-auto max-w-[930px] text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[45%_55%_58%_42%/56%_42%_58%_44%] border border-[#5C314D]/20 bg-[#35172F] text-[#FFD1A0] shadow-[0_20px_55px_rgba(78,39,58,0.2)]">
              <Compass className="h-6 w-6" />
            </div>
            <div className="mt-7 flex justify-center"><LiquidKicker dark>See the product</LiquidKicker></div>
            <h2 className="font-acturus-display mt-8 text-3xl leading-[1.14] tracking-[-0.035em] sm:text-5xl">
              See AI CONTROL GRID in action.
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-[#503040]">
              Walk through the full loop—from governed inventory to a live allow-or-block decision and the incident evidence it creates.
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/book-demo" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#35172F] px-7 text-xs font-semibold uppercase tracking-[0.14em] text-white shadow-[0_16px_42px_rgba(62,24,49,0.2)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#512343] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35172F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F0C89F]">
                Book a private demo <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/welcome" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[#5D364F]/30 bg-white/20 px-7 text-xs uppercase tracking-[0.14em] transition-colors duration-300 hover:bg-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35172F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F0C89F]">
                <Workflow className="h-4 w-4" /> Explore the platform
              </Link>
            </div>
          </Reveal>
        </section>

        <section className="border-y border-white/10 bg-[#100916] px-5 py-8 sm:px-6">
          <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-center gap-x-10 gap-y-5 text-[9px] uppercase tracking-[0.2em] text-white/[0.5]">
            <span className="flex items-center gap-2 text-[#F3B17D]"><ActurusMark className="h-4 w-4" /> ACTURUS</span>
            <span className="flex items-center gap-2"><Link2 className="h-3.5 w-3.5" /> Product + policy + evidence</span>
            <span className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-[#C5A0FA]" /> AI CONTROL GRID</span>
          </div>
        </section>
      </main>

      <ActurusFooter theme="acturus" />
    </div>
  );
}
