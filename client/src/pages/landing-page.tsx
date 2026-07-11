import { useEffect, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  Blocks,
  Fingerprint,
  LockKeyhole,
  Network,
  ScanSearch,
  ShieldCheck,
  Siren,
} from "lucide-react";
import { Link } from "wouter";
import {
  ActurusFooter,
  ActurusMark,
  ActurusPublicHeader,
  Reveal,
  SectionKicker,
  usePublicReducedMotion,
} from "@/components/acturus-public-shell";
import { ACTURUS_BRAND } from "@/lib/brand";

const CAPABILITIES = [
  {
    number: "01",
    icon: ScanSearch,
    title: "See every AI system",
    body: "Create one governed inventory for models, copilots, agents, owners, use cases, data context, and deployment state.",
  },
  {
    number: "02",
    icon: ShieldCheck,
    title: "Turn policy into control",
    body: "Translate risk appetite into approvals, runtime checks, human oversight, and tenant-scoped exceptions.",
  },
  {
    number: "03",
    icon: Siren,
    title: "Respond while it matters",
    body: "Block unsafe turns, route serious signals into incidents, and keep ownership attached to the affected system.",
  },
  {
    number: "04",
    icon: Fingerprint,
    title: "Keep defensible evidence",
    body: "Connect decisions, policy reasons, reviewer actions, incidents, and audit records in one traceable operating history.",
  },
];

const CONTROL_STEPS = [
  {
    step: "Register",
    body: "Capture purpose, owner, deployment context, affected users, and the data an AI system can touch.",
  },
  {
    step: "Assess",
    body: "Classify risk and map the controls, approvals, and evidence the use case requires.",
  },
  {
    step: "Enforce",
    body: "Evaluate prompts and candidate outputs at runtime—before an unsafe action reaches the user.",
  },
  {
    step: "Prove",
    body: "Preserve the decision trail so operators, executives, and auditors can reconstruct what happened.",
  },
];

const OPERATOR_VIEWS = [
  ["CISO", "Runtime policy, sensitive-data signals, incident containment, and technical assurance."],
  ["Risk & compliance", "System inventory, proportional assessment, framework mapping, approvals, and evidence."],
  ["AI leaders", "A practical path to ship useful AI without separating delivery from accountability."],
  ["Portfolio teams", "Roll-up visibility across operating companies while preserving local ownership and isolation."],
];

function AmbientOrb({
  className,
  delay = 0,
}: {
  className: string;
  delay?: number;
}) {
  const reduceMotion = usePublicReducedMotion();
  return (
    <motion.div
      aria-hidden="true"
      className={`pointer-events-none absolute rounded-full blur-[2px] ${className}`}
      initial={false}
      animate={reduceMotion ? undefined : { y: [0, -15, 0], x: [0, 7, 0], scale: [1, 1.035, 1] }}
      transition={{ duration: 9, delay, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

function DepthCard({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduceMotion = usePublicReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 24 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      whileHover={reduceMotion ? undefined : { y: -8, rotateX: 1.5, rotateY: -1.5 }}
      viewport={{ once: true, amount: 0.18 }}
      transition={{ duration: 0.62, delay, ease: [0.22, 0.61, 0.36, 1] }}
      style={{ transformPerspective: 1000, transformStyle: "preserve-3d" }}
    >
      {children}
    </motion.div>
  );
}

function ControlGridScene() {
  const reduceMotion = usePublicReducedMotion();

  return (
    <Reveal className="relative mx-auto min-w-0 w-full max-w-[620px] lg:mx-0" delay={0.12}>
      <div
        className="relative aspect-[1.02/1] min-h-[420px] w-full [perspective:1200px] max-sm:min-h-[370px]"
        role="img"
        aria-label="A governed AI request moving through identity, policy, runtime decision, incident response, and evidence controls"
      >
        <div className="absolute inset-[8%] rounded-full bg-[#356cff]/20 blur-[90px]" aria-hidden="true" />
        <AmbientOrb className="right-[4%] top-[10%] h-16 w-16 border border-[#8b7cff]/30 bg-[#8b7cff]/10 shadow-[0_0_50px_rgba(139,124,255,0.25)]" />
        <AmbientOrb className="bottom-[13%] left-[3%] h-11 w-11 border border-[#75e6ff]/30 bg-[#75e6ff]/10 shadow-[0_0_42px_rgba(117,230,255,0.22)]" delay={1.2} />

        <motion.div
          className="absolute inset-[10%_3%_8%] [transform-style:preserve-3d] sm:inset-[10%_5%_8%]"
          initial={false}
          animate={reduceMotion ? undefined : { rotateX: [4, 7, 4], rotateY: [-7, -2, -7], y: [0, -10, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: "50% 54%", transformStyle: "preserve-3d" }}
        >
          <div
            className="absolute inset-[11%_8%] rounded-[26px] border border-[#356cff]/[0.15] bg-[#356cff]/[0.035] shadow-[0_40px_100px_rgba(0,0,0,0.5)]"
            style={{ transform: "translateZ(-80px) scale(1.08)" }}
            aria-hidden="true"
          />
          <div
            className="absolute inset-[7%_5%] rounded-[24px] border border-[#9deaff]/10 bg-[#0a1322]/70"
            style={{ transform: "translateZ(-38px)" }}
            aria-hidden="true"
          />

          <div
            className="absolute inset-[14%_7%_11%] overflow-hidden rounded-[22px] border border-[#9deaff]/25 bg-[linear-gradient(145deg,rgba(17,27,46,0.96),rgba(6,10,18,0.98))] shadow-[0_30px_90px_rgba(0,0,0,0.65),inset_0_1px_rgba(255,255,255,0.08)] backdrop-blur-xl sm:inset-[12%_9%_10%]"
            style={{ transform: "translateZ(12px)" }}
          >
            <div className="flex h-12 items-center justify-between border-b border-white/10 px-4 sm:px-5">
              <div className="flex items-center gap-2.5">
                <span className="h-2 w-2 rounded-full bg-[#65e5ff] shadow-[0_0_16px_rgba(101,229,255,0.85)]" />
                <span className="font-mono text-[9px] uppercase tracking-[0.19em] text-[#cfefff]">Runtime control plane</span>
              </div>
              <span className="rounded-full border border-[#65e5ff]/20 bg-[#65e5ff]/10 px-2 py-1 text-[8px] uppercase tracking-[0.16em] text-[#9deaff] max-[430px]:hidden">Policy online</span>
            </div>

            <div className="grid h-[calc(100%-3rem)] grid-cols-[0.78fr_1.22fr] max-[430px]:grid-cols-1">
              <div className="border-r border-white/10 p-4 max-[430px]:hidden sm:p-5">
                <div className="text-[8px] uppercase tracking-[0.2em] text-white/[0.58]">Request context</div>
                <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.035] p-3.5">
                  <div className="text-xs font-medium text-[#f2f7ff]">Collections assistant</div>
                  <div className="mt-1 text-[10px] text-white/[0.62]">Production · Tier 2</div>
                  <div className="mt-4 h-px bg-white/10" />
                  <div className="mt-3 space-y-2.5">
                    {["Identity bound", "Sensitive data", "Restricted content"].map((label, index) => (
                      <div key={label} className="flex items-center gap-2 text-[9px] text-white/[0.65]">
                        <span className={`h-1.5 w-1.5 rounded-full ${index === 0 ? "bg-[#65e5ff]" : "bg-[#8b7cff]"}`} />
                        {label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-col justify-between p-4 sm:p-5">
                <div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[8px] uppercase tracking-[0.2em] text-[#9deaff]">Decision receipt</span>
                    <LockKeyhole className="h-3.5 w-3.5 text-[#9deaff]" />
                  </div>
                  <div className="mt-4 rounded-xl border border-[#728bff]/[0.35] bg-[linear-gradient(135deg,rgba(53,108,255,0.2),rgba(139,124,255,0.1))] p-4 shadow-[inset_0_1px_rgba(255,255,255,0.06)]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-acturus-display text-base tracking-[0.05em] text-white sm:text-lg">BLOCK</span>
                      <span className="rounded-full bg-[#d9f8ff] px-2 py-1 text-[7px] font-bold uppercase tracking-[0.14em] text-[#07101f]">Before model</span>
                    </div>
                    <p className="mt-3 text-[10px] leading-4 text-white/[0.68] sm:text-[11px]">Sensitive-data and restricted-content policy crossed. No unsafe response released.</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {["Policy reason", "Incident opened", "Owner assigned", "Evidence linked"].map((label) => (
                    <div key={label} className="rounded-lg border border-white/[0.08] bg-black/[0.15] px-2.5 py-2 text-[8px] text-white/[0.62]">{label}</div>
                  ))}
                </div>
              </div>
            </div>

            {!reduceMotion ? (
              <motion.div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-[#7ceaff]/70 to-transparent shadow-[0_0_18px_rgba(124,234,255,0.6)]"
                animate={{ top: ["15%", "88%", "15%"] }}
                transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
              />
            ) : null}
          </div>

          <div
            className="absolute left-[-1%] top-[7%] rounded-xl border border-[#9deaff]/20 bg-[#0d1727]/90 px-3 py-2.5 shadow-[0_16px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:left-[1%]"
            style={{ transform: "translateZ(82px)" }}
          >
            <div className="text-[7px] uppercase tracking-[0.18em] text-white/40">Request</div>
            <div className="mt-1 text-[10px] font-medium text-[#dff9ff]">Context bound</div>
          </div>

          <div className="absolute bottom-[4%] right-[1%] rounded-xl border border-[#8b7cff]/25 bg-[#111429]/90 px-3 py-2.5 shadow-[0_18px_45px_rgba(0,0,0,0.5)] backdrop-blur-xl [transform:translateZ(96px)] max-[430px]:right-[8%] max-[430px]:[transform:translateZ(42px)]">
            <div className="flex items-center gap-2">
              <BadgeCheck className="h-3.5 w-3.5 text-[#9deaff]" />
              <span className="text-[7px] uppercase tracking-[0.18em] text-white/40">Evidence</span>
            </div>
            <div className="mt-1 text-[10px] font-medium text-white">Decision connected</div>
          </div>
        </motion.div>
      </div>
    </Reveal>
  );
}

function ControlLoop() {
  return (
    <section id="control-loop" className="relative scroll-mt-[72px] overflow-hidden bg-[#eaf2ff] px-5 py-24 text-[#07101f] sm:px-6 lg:py-32">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_12%,rgba(53,108,255,0.13),transparent_32%),linear-gradient(rgba(53,108,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(53,108,255,0.06)_1px,transparent_1px)] bg-[size:auto,64px_64px,64px_64px]" />
      <div className="relative mx-auto max-w-[1200px]">
        <div className="grid gap-14 lg:grid-cols-[0.68fr_1.32fr] lg:gap-20">
          <Reveal>
            <SectionKicker theme="grid" dark>One operating loop</SectionKicker>
            <h2 className="font-acturus-display mt-8 max-w-md text-3xl leading-[1.16] tracking-[-0.03em] sm:text-4xl">
              Governance that keeps moving after launch.
            </h2>
            <p className="mt-6 max-w-md text-base leading-7 text-[#42516a]">
              AI CONTROL GRID connects the work teams do before deployment with the evidence produced during real use.
            </p>
          </Reveal>

          <div className="relative [perspective:1100px]">
            <div className="absolute bottom-8 left-[23px] top-8 w-px bg-gradient-to-b from-[#356cff] via-[#76ddff] to-[#8b7cff] sm:left-[34px]" aria-hidden="true" />
            <div className="space-y-4">
              {CONTROL_STEPS.map((item, index) => (
                <DepthCard key={item.step} delay={index * 0.06}>
                  <article className="relative grid gap-4 rounded-2xl border border-[#8ea8d3]/[0.35] bg-white/80 p-5 shadow-[0_18px_50px_rgba(42,75,126,0.1)] backdrop-blur-xl sm:grid-cols-[54px_0.4fr_1fr] sm:items-center sm:p-6">
                    <span className="relative z-10 flex h-9 w-9 items-center justify-center rounded-xl border border-[#356cff]/20 bg-[#eef4ff] font-mono text-[10px] text-[#315abf] shadow-[0_7px_18px_rgba(53,108,255,0.14)]">0{index + 1}</span>
                    <h3 className="font-acturus-display text-base tracking-[-0.01em]">{item.step}</h3>
                    <p className="text-sm leading-6 text-[#42516a]">{item.body}</p>
                  </article>
                </DepthCard>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  useEffect(() => {
    if (typeof window === "undefined" || !window.location.hash) return;
    const targetId = decodeURIComponent(window.location.hash.slice(1));
    if (!["platform", "control-loop", "evidence"].includes(targetId)) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#05070d] text-[#f4f8ff] antialiased" data-public-theme="grid" data-testid="page-welcome">
      <ActurusPublicHeader theme="grid" />

      <main id="public-main-content" tabIndex={-1}>
        <section className="relative isolate overflow-hidden px-5 pb-24 pt-32 sm:px-6 lg:min-h-[820px] lg:pb-28 lg:pt-40">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_74%_24%,rgba(53,108,255,0.2),transparent_31%),radial-gradient(circle_at_21%_72%,rgba(117,230,255,0.1),transparent_28%),radial-gradient(circle_at_55%_115%,rgba(139,124,255,0.15),transparent_35%)]" />
          <div className="pointer-events-none absolute inset-0 opacity-[0.24] [background-image:linear-gradient(rgba(157,234,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(157,234,255,0.08)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_92%)]" />
          <div className="pointer-events-none absolute left-1/2 top-[58%] h-[420px] w-[880px] rounded-[50%] border border-[#356cff]/10 [transform:translate(-50%,-50%)_rotateX(70deg)]" aria-hidden="true" />

          <div className="relative mx-auto max-w-[1200px]">
            <div className="grid items-center gap-12 lg:grid-cols-[0.93fr_1.07fr] lg:gap-12">
              <div className="relative z-10 min-w-0">
                <Reveal>
                  <SectionKicker theme="grid">AI governance · at runtime</SectionKicker>
                  <div className="mt-7 inline-flex items-center gap-2 rounded-full border border-[#9deaff]/20 bg-[#9deaff]/[0.06] px-3 py-2 text-[9px] uppercase tracking-[0.18em] text-[#c7f4ff] shadow-[inset_0_1px_rgba(255,255,255,0.06)] backdrop-blur-xl">
                    <ActurusMark className="h-4 w-4 text-[#9deaff]" />
                    {ACTURUS_BRAND.productByline}
                  </div>
                </Reveal>

                <Reveal delay={0.08}>
                  <h1 className="font-acturus-display mt-7 text-[clamp(2.5rem,7vw,6.3rem)] leading-[0.97] tracking-[-0.05em] text-[#f7faff]">
                    AI CONTROL
                    <span className="block bg-gradient-to-r from-[#9deaff] via-[#6fb8ff] to-[#9b8cff] bg-clip-text text-transparent">GRID</span>
                  </h1>
                </Reveal>

                <Reveal delay={0.15}>
                  <p className="mt-7 max-w-xl text-lg leading-8 text-[#aab8ce] sm:text-xl">
                    The operating layer between enterprise AI and real-world consequence. See every system, enforce policy in the flow, and keep the evidence connected.
                  </p>
                </Reveal>

                <Reveal delay={0.22} className="mt-9 flex flex-col gap-3 sm:flex-row">
                  <Link href="/book-demo" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#82e8ff]/25 bg-[linear-gradient(135deg,#75efff,#4aaeff_58%,#8f82ff)] px-6 text-xs font-semibold uppercase tracking-[0.14em] text-[#06101e] shadow-[0_14px_34px_rgba(53,108,255,0.28),inset_0_1px_rgba(255,255,255,0.28)] transition duration-300 hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9deaff]">
                    Book a private demo <ArrowRight className="h-4 w-4" />
                  </Link>
                  <a href="#control-loop" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/[0.14] bg-white/[0.035] px-6 text-xs uppercase tracking-[0.14em] text-[#cad5e6] backdrop-blur-md transition duration-300 hover:-translate-y-0.5 hover:border-[#9deaff]/[0.35] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9deaff]">
                    See the control loop
                  </a>
                </Reveal>

                <Reveal delay={0.28} className="mt-10 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {["Register", "Assess", "Enforce", "Prove"].map((item, index) => (
                    <div key={item} className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-3.5 text-center text-[9px] uppercase tracking-[0.18em] text-[#9fb0c8] backdrop-blur-md">
                      <span className="mr-1.5 text-[#65dfff]">0{index + 1}</span>{item}
                    </div>
                  ))}
                </Reveal>
              </div>

              <ControlGridScene />
            </div>
          </div>
        </section>

        <section className="relative border-y border-white/[0.07] bg-[#080c14] px-5 py-24 sm:px-6 lg:py-32">
          <div className="pointer-events-none absolute right-0 top-0 h-full w-1/2 bg-[radial-gradient(circle_at_80%_50%,rgba(53,108,255,0.12),transparent_55%)]" />
          <div className="relative mx-auto max-w-[1200px]">
            <Reveal>
              <SectionKicker theme="grid">The operating shift</SectionKicker>
            </Reveal>
            <div className="mt-10 grid gap-10 lg:grid-cols-[1.25fr_0.75fr] lg:gap-20">
              <Reveal>
                <h2 className="font-acturus-display max-w-4xl text-3xl leading-[1.16] tracking-[-0.03em] sm:text-5xl">
                  AI has moved from experiments to operations. <span className="text-[#82dff5]">Governance has to move with it.</span>
                </h2>
              </Reveal>
              <Reveal delay={0.1}>
                <p className="text-base leading-7 text-[#9cabc0]">
                  Policies, spreadsheets, and launch reviews matter—but they cannot tell you what an AI system is doing now. AI CONTROL GRID brings inventory, risk, approval, runtime control, incidents, and evidence into the same operating model.
                </p>
              </Reveal>
            </div>
          </div>
        </section>

        <section id="platform" className="relative scroll-mt-[72px] overflow-hidden bg-[#0c111c] px-5 py-24 sm:px-6 lg:py-32">
          <div className="pointer-events-none absolute left-[-15%] top-[8%] h-[520px] w-[520px] rounded-full bg-[#356cff]/10 blur-[130px]" />
          <div className="relative mx-auto max-w-[1200px]">
            <div className="grid gap-12 lg:grid-cols-[0.68fr_1.32fr] lg:gap-20">
              <Reveal>
                <SectionKicker theme="grid">Platform</SectionKicker>
                <h2 className="font-acturus-display mt-8 text-3xl leading-[1.18] tracking-[-0.025em] sm:text-4xl">One surface for the whole governance lifecycle.</h2>
                <p className="mt-6 text-base leading-7 text-[#9cabc0]">Designed for teams that need control without turning every AI release into a manual programme.</p>
              </Reveal>

              <div className="grid gap-4 [perspective:1200px] sm:grid-cols-2">
                {CAPABILITIES.map((capability, index) => (
                  <DepthCard key={capability.title} delay={index * 0.06} className="h-full">
                    <article className="group relative h-full overflow-hidden rounded-2xl border border-[#8eb7ff]/[0.15] bg-[linear-gradient(145deg,rgba(21,31,50,0.92),rgba(10,15,25,0.95))] p-6 shadow-[0_22px_55px_rgba(0,0,0,0.25)] backdrop-blur-xl sm:p-7">
                      <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#79e5ff]/40 to-transparent" />
                      <div className="flex items-start justify-between gap-5">
                        <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#9deaff]/20 bg-[#356cff]/10 text-[#9deaff] shadow-[inset_0_1px_rgba(255,255,255,0.06)] transition-colors duration-300 group-hover:bg-[#356cff]/20">
                          <capability.icon className="h-5 w-5" />
                        </span>
                        <span className="font-mono text-[10px] text-[#70809a]">{capability.number}</span>
                      </div>
                      <h3 className="font-acturus-display mt-8 text-base leading-6 text-white">{capability.title}</h3>
                      <p className="mt-4 text-sm leading-6 text-[#9cabc0]">{capability.body}</p>
                    </article>
                  </DepthCard>
                ))}
              </div>
            </div>
          </div>
        </section>

        <ControlLoop />

        <section id="evidence" className="relative scroll-mt-[72px] overflow-hidden bg-[#070a12] px-5 py-24 sm:px-6 lg:py-32">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_27%,rgba(139,124,255,0.16),transparent_32%),radial-gradient(circle_at_16%_80%,rgba(53,108,255,0.1),transparent_30%)]" />
          <div className="relative mx-auto max-w-[1200px]">
            <div className="grid gap-14 lg:grid-cols-[0.76fr_1.24fr] lg:items-center lg:gap-20">
              <Reveal>
                <SectionKicker theme="grid">Connected evidence</SectionKicker>
                <h2 className="font-acturus-display mt-8 text-3xl leading-[1.18] tracking-[-0.025em] sm:text-4xl">Know what happened. Know why. Know who owned the next step.</h2>
                <p className="mt-6 text-base leading-7 text-[#9cabc0]">Every significant runtime decision can carry the system, case, policy reason, human action, incident, and correlation trail forward.</p>
              </Reveal>

              <Reveal delay={0.08}>
                <div className="relative [perspective:1000px]">
                  <div className="absolute -inset-7 rounded-[30px] bg-[#356cff]/10 blur-[65px]" />
                  <div className="relative overflow-hidden rounded-2xl border border-[#9deaff]/20 bg-[#0d1422]/90 shadow-[0_34px_90px_rgba(0,0,0,0.5)] backdrop-blur-xl lg:[transform:rotateY(-3deg)_rotateX(1deg)]">
                    <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                      <span className="text-[9px] uppercase tracking-[0.2em] text-[#9eb1ca]">Decision trace · latest</span>
                      <BadgeCheck className="h-4 w-4 text-[#9deaff]" />
                    </div>
                    {[
                      ["Prompt evaluated", "Input", "Context and policy checks completed"],
                      ["Restricted request stopped", "Decision", "Model execution path skipped"],
                      ["Incident created", "Response", "Owner and containment target attached"],
                      ["Evidence connected", "Audit", "Correlation retained across records"],
                    ].map(([title, label, body], index) => (
                      <div key={title} className="group grid gap-3 border-b border-white/[0.08] px-5 py-5 last:border-0 sm:grid-cols-[42px_0.34fr_1fr] sm:items-center">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#9deaff]/20 bg-[#356cff]/10 text-[9px] text-[#9deaff] transition-colors group-hover:bg-[#356cff]/20">0{index + 1}</span>
                        <div>
                          <div className="text-[8px] uppercase tracking-[0.18em] text-[#75849b]">{label}</div>
                          <div className="mt-1 text-sm font-medium text-[#eef5ff]">{title}</div>
                        </div>
                        <div className="text-xs leading-5 text-[#91a1b8]">{body}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden bg-[#edf4ff] px-5 py-24 text-[#07101f] sm:px-6 lg:py-32">
          <div className="pointer-events-none absolute left-1/2 top-0 h-80 w-[900px] -translate-x-1/2 rounded-full bg-[#75dfff]/[0.15] blur-[64px] sm:blur-[100px]" />
          <div className="relative mx-auto max-w-[1200px]">
            <Reveal>
              <SectionKicker theme="grid" dark>Built for operators</SectionKicker>
              <h2 className="font-acturus-display mt-8 max-w-3xl text-3xl leading-[1.18] tracking-[-0.025em] sm:text-4xl">One product. Clear views for every accountable team.</h2>
            </Reveal>
            <div className="mt-12 grid gap-4 [perspective:1000px] md:grid-cols-2">
              {OPERATOR_VIEWS.map(([title, body], index) => (
                <DepthCard key={title} delay={index * 0.05} className="h-full">
                  <article className="h-full rounded-2xl border border-[#8da5ca]/30 bg-white/75 p-6 shadow-[0_18px_45px_rgba(44,74,119,0.09)] backdrop-blur-xl sm:p-8">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[10px] text-[#356cff]">0{index + 1}</span>
                      <h3 className="font-acturus-display text-base">{title}</h3>
                    </div>
                    <p className="mt-5 text-sm leading-6 text-[#42516a]">{body}</p>
                  </article>
                </DepthCard>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-white/[0.08] bg-[#0a0f19] px-5 py-9 sm:px-6">
          <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-center gap-x-10 gap-y-5 text-[10px] uppercase tracking-[0.2em] text-[#8798b1]">
            <span className="text-[#9deaff]">Framework-aligned operations</span>
            <span>EU AI Act</span>
            <span>NIST AI RMF</span>
            <span>ISO/IEC 42001</span>
            <span>Tenant-isolated governance</span>
          </div>
        </section>

        <section className="relative overflow-hidden bg-[#10182a] px-5 py-24 sm:px-6 lg:py-32">
          <div className="pointer-events-none absolute -right-32 top-1/2 h-[520px] w-[520px] -translate-y-1/2 rounded-full border border-[#9deaff]/10 bg-[#356cff]/10 blur-[1px]" />
          <div className="pointer-events-none absolute -right-14 top-1/2 h-[340px] w-[340px] -translate-y-1/2 rounded-full border border-[#8b7cff]/[0.15]" />
          <div className="relative mx-auto grid max-w-[1200px] gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-end lg:gap-20">
            <Reveal>
              <SectionKicker theme="grid">Behind the product</SectionKicker>
              <h2 className="font-acturus-display mt-8 max-w-3xl text-3xl leading-[1.16] tracking-[-0.03em] sm:text-5xl">AI CONTROL GRID is developed by ACTURUS.</h2>
              <p className="mt-6 max-w-2xl text-base leading-7 text-[#a7b5ca]">
                Founded by Revanth Meda and Hitesh Thakkarr around one practical question: how do enterprise teams turn AI governance from policy into day-to-day operations?
              </p>
            </Reveal>
            <Reveal delay={0.08} className="flex flex-col gap-3 sm:flex-row lg:justify-end">
              <Link href="/acturus" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#e7f8ff] px-6 text-xs font-semibold uppercase tracking-[0.14em] text-[#07101f] shadow-[0_14px_35px_rgba(117,223,255,0.16)] transition duration-300 hover:-translate-y-0.5 hover:bg-white">
                Meet ACTURUS <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/book-demo" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/[0.15] bg-white/[0.035] px-6 text-xs uppercase tracking-[0.14em] text-[#c7d3e4] transition duration-300 hover:-translate-y-0.5 hover:border-[#9deaff]/[0.35] hover:text-white">
                Book a demo
              </Link>
            </Reveal>
          </div>
        </section>

        <section className="relative isolate overflow-hidden bg-[#05070d] px-5 py-24 sm:px-6 lg:py-32">
          <div className="pointer-events-none absolute left-1/2 top-full h-[620px] w-[920px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-[#356cff]/20 blur-[120px]" />
          <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(157,234,255,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(157,234,255,0.07)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(circle_at_center,black,transparent_70%)]" />
          <Reveal className="relative mx-auto max-w-[900px] text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#9deaff]/20 bg-[#356cff]/10 text-[#9deaff] shadow-[0_18px_45px_rgba(53,108,255,0.18)]">
              <Network className="h-6 w-6" />
            </span>
            <h2 className="font-acturus-display mt-7 text-3xl leading-[1.16] tracking-[-0.03em] sm:text-5xl">Move from AI improvisation to AI operations.</h2>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-[#9cabc0]">See how AI CONTROL GRID connects visibility, enforcement, response, and evidence in one live product story.</p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/book-demo" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#75efff,#4aaeff_58%,#8f82ff)] px-7 text-xs font-semibold uppercase tracking-[0.14em] text-[#06101e] shadow-[0_14px_34px_rgba(53,108,255,0.28)] transition duration-300 hover:-translate-y-0.5 hover:brightness-110">
                Book an ACTURUS demo <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/trust-center" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/[0.15] bg-white/[0.03] px-7 text-xs uppercase tracking-[0.14em] text-[#c2cfe0] transition duration-300 hover:-translate-y-0.5 hover:border-[#9deaff]/[0.35] hover:text-white">
                <Blocks className="h-4 w-4" /> Review trust posture
              </Link>
            </div>
          </Reveal>
        </section>
      </main>

      <ActurusFooter theme="grid" />
    </div>
  );
}
