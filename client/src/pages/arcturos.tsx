/**
 * Arcturos company page — /arcturos
 *
 * Design language: dark cinematic hero (matches landing page) with
 * Three.js constellation field, Framer Motion scroll reveals, and
 * glassmorphism founder cards.  Completely self-contained; uses only
 * libs already in the dependency tree.
 */

import { Suspense, useRef, useMemo, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Points, PointMaterial, Float } from "@react-three/drei";
import {
  motion,
  useInView,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import {
  ArrowRight,
  ExternalLink,
  Shield,
  Layers,
  Globe,
  Cpu,
  Lock,
  TrendingUp,
} from "lucide-react";
import { Link } from "wouter";
import { BrandMark } from "@/components/brand-mark";
import * as THREE from "three";

/* ─────────────────────────────────────────────
   Brand tokens
───────────────────────────────────────────── */
const TEAL = "#00FFD1";
const TEAL_DIM = "rgba(0,255,209,0.12)";
const BG_VOID = "#020202";
const BG_DARK = "#05050a";
const GLASS =
  "border border-white/[0.07] bg-white/[0.03] backdrop-blur-xl shadow-[0_0_60px_rgba(0,255,209,0.04)]";

/* ─────────────────────────────────────────────
   Arcturos SVG mark
   Stellar compass: central star + hex frame +
   orbital ring + 6 node points.
───────────────────────────────────────────── */
function ArcturosLogo({
  size = 80,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 80 80"
      width={size}
      height={size}
      fill="none"
      aria-label="Arcturos mark"
      className={className}
    >
      {/* Outer hexagon frame */}
      <path
        d="M40 4 L72 22 L72 58 L40 76 L8 58 L8 22 Z"
        stroke={TEAL}
        strokeWidth="1.1"
        opacity="0.45"
      />
      {/* Inner hexagon (rotated 30°) */}
      <path
        d="M40 15 L60 27 L60 53 L40 65 L20 53 L20 27 Z"
        stroke={TEAL}
        strokeWidth="0.7"
        opacity="0.25"
      />
      {/* Vertical + horizontal grid lines */}
      <line x1="40" y1="4" x2="40" y2="76" stroke={TEAL} strokeWidth="0.55" opacity="0.2" />
      <line x1="8" y1="40" x2="72" y2="40" stroke={TEAL} strokeWidth="0.55" opacity="0.2" />
      {/* Diagonal structural lines */}
      <line x1="8" y1="22" x2="72" y2="58" stroke={TEAL} strokeWidth="0.4" opacity="0.14" />
      <line x1="72" y1="22" x2="8" y2="58" stroke={TEAL} strokeWidth="0.4" opacity="0.14" />
      {/* Orbital dashed ring */}
      <circle
        cx="40"
        cy="40"
        r="20"
        stroke={TEAL}
        strokeWidth="0.8"
        strokeDasharray="2.5 4"
        opacity="0.5"
      />
      {/* 8-pointed star / stellar burst */}
      <path
        d="M40 27 L42.7 36.3 L52 40 L42.7 43.7 L40 53 L37.3 43.7 L28 40 L37.3 36.3 Z"
        fill={TEAL}
        opacity="0.9"
      />
      {/* Core glow dot */}
      <circle cx="40" cy="40" r="3.5" fill={TEAL} opacity="0.98" />
      {/* Six orbital nodes at hex vertices */}
      <circle cx="40" cy="4"  r="2.4" fill={TEAL} opacity="0.85" />
      <circle cx="72" cy="22" r="1.9" fill={TEAL} opacity="0.65" />
      <circle cx="72" cy="58" r="1.9" fill={TEAL} opacity="0.65" />
      <circle cx="40" cy="76" r="2.4" fill={TEAL} opacity="0.85" />
      <circle cx="8"  cy="22" r="1.9" fill={TEAL} opacity="0.65" />
      <circle cx="8"  cy="58" r="1.9" fill={TEAL} opacity="0.65" />
      {/* Compass tick marks on orbital ring */}
      <line x1="40" y1="20.4" x2="40" y2="23.5" stroke={TEAL} strokeWidth="1.1" opacity="0.7" />
      <line x1="40" y1="56.5" x2="40" y2="59.6" stroke={TEAL} strokeWidth="1.1" opacity="0.7" />
      <line x1="20.4" y1="40" x2="23.5" y2="40" stroke={TEAL} strokeWidth="1.1" opacity="0.7" />
      <line x1="56.5" y1="40" x2="59.6" y2="40" stroke={TEAL} strokeWidth="1.1" opacity="0.7" />
    </svg>
  );
}

/* ─────────────────────────────────────────────
   3-D constellation field (Three.js)
───────────────────────────────────────────── */
function ConstellationField() {
  const ref = useRef<THREE.Points>(null!);

  const [positions, sizes] = useMemo(() => {
    const count = 1_600;
    const pos = new Float32Array(count * 3);
    const sz = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 2.8 + Math.random() * 4.5;
      pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
      sz[i] = Math.random() * 0.7 + 0.1;
    }
    return [pos, sz];
  }, []);

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.025;
      ref.current.rotation.x += delta * 0.008;
    }
  });

  return (
    <Points ref={ref} positions={positions} sizes={sizes} stride={3}>
      <PointMaterial
        transparent
        color={TEAL}
        size={0.022}
        sizeAttenuation
        depthWrite={false}
        opacity={0.55}
      />
    </Points>
  );
}

function HeroScene() {
  return (
    <Canvas
      camera={{ position: [0, 0, 5], fov: 65 }}
      style={{ position: "absolute", inset: 0 }}
      aria-hidden="true"
    >
      <Suspense fallback={null}>
        <ConstellationField />
        {/* Floating logo mark in 3D space */}
        <Float speed={1.4} rotationIntensity={0.18} floatIntensity={0.6}>
          <mesh position={[0, 0, 0]}>
            <circleGeometry args={[0.001, 6]} />
            <meshBasicMaterial transparent opacity={0} />
          </mesh>
        </Float>
      </Suspense>
    </Canvas>
  );
}

/* ─────────────────────────────────────────────
   Shared animation helpers
───────────────────────────────────────────── */
function FadeUp({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="mb-4 font-mono text-[11px] uppercase tracking-[0.26em] text-[#00FFD1]">
      {children}
    </div>
  );
}

/* ─────────────────────────────────────────────
   LineReveal — overflow:hidden clip reveal
   Text slides up from below the mask boundary
───────────────────────────────────────────── */
function LineReveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  as?: React.ElementType;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  return (
    <div ref={ref} style={{ overflow: "hidden" }} className={className}>
      <motion.div
        initial={{ y: "110%" }}
        animate={inView ? { y: "0%" } : {}}
        transition={{ duration: 0.85, delay, ease: [0.76, 0, 0.24, 1] }}
      >
        <Tag>{children}</Tag>
      </motion.div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   SeparatorLine — animated horizontal rule
───────────────────────────────────────────── */
function SeparatorLine() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      ref={ref}
      initial={{ scaleX: 0 }}
      animate={inView ? { scaleX: 1 } : {}}
      transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
      style={{ transformOrigin: "left" }}
      className="mb-14 h-px bg-[#00FFD1]/12"
    />
  );
}

/* ─────────────────────────────────────────────
   Founder avatar (styled initials)
   Pass photoSrc to use a real photo instead.
───────────────────────────────────────────── */
function FounderAvatar({
  initials,
  photoSrc,
}: {
  initials: string;
  photoSrc?: string;
}) {
  if (photoSrc) {
    return (
      <img
        src={photoSrc}
        alt={initials}
        className="h-20 w-20 rounded-full object-cover ring-2 ring-[#00FFD1]/30"
      />
    );
  }
  return (
    <div className="relative h-20 w-20 shrink-0">
      {/* Glow ring */}
      <div className="absolute inset-0 rounded-full bg-[#00FFD1]/10 blur-xl" />
      <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-[#00FFD1]/30 bg-[#0a1f1c]">
        <span className="font-mono text-xl font-bold tracking-widest text-[#00FFD1]">
          {initials}
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Founder data
───────────────────────────────────────────── */
const FOUNDERS = [
  {
    initials: "RM",
    name: "Revanth Meda",
    title: "Co-Founder, Arcturos",
    location: "Dublin, Ireland",
    bio: "Senior Automation Engineer with 5+ years designing and commissioning enterprise-grade SCADA systems and PLCs across water, metro, and industrial sectors — including Irish Water infrastructure, Qatar Rail, and 57 stations of Hyderabad Metro. Holds an MSc in Data Science & Analytics from the University of Hertfordshire. Built AI Control Grid to solve the accountability gap he kept hitting in production AI deployments: powerful models with zero runtime evidence.",
    linkedin: "https://www.linkedin.com/in/revanth-meda-1ab294226/",
    portfolio: "https://medarevanth.com",
    tags: ["SCADA & PLC Systems", "Full-Stack Python", "Generative AI & RAG", "Industrial Automation"],
  },
  {
    initials: "HT",
    name: "Hitesh Thakkarr",
    title: "Co-Founder, Arcturos",
    location: "Mumbai, India",
    bio: "Enterprise sales and GTM leader with 25+ years across cybersecurity, technology, and strategic partnerships — including Hewlett Packard Enterprise, HaltDos, eProtect 360, and founding Waldo Technologies. Holds an MBA from Cardiff University and information security certifications (CISC, CPH, CFA). Brings enterprise AI to regulated markets: turning AI Control Grid's technical depth into customer outcomes.",
    linkedin: "https://www.linkedin.com/in/hitesh-thakkarr-1aa2736/",
    portfolio: null,
    tags: ["Enterprise Sales Strategy", "Go-to-Market", "Cybersecurity", "Strategic Partnerships"],
  },
];

/* ─────────────────────────────────────────────
   Conviction cards (why we exist)
───────────────────────────────────────────── */
const CONVICTIONS = [
  {
    icon: Shield,
    title: "Governance is an engineering problem",
    body: "AI compliance frameworks read like policy documents but break at the software boundary. We translated EU AI Act, NIST AI RMF, and ISO 42001 into runtime-enforced behaviour — not a checkbox.",
  },
  {
    icon: Cpu,
    title: "Runtime is the last line of defence",
    body: "Static audits, pre-deployment reviews, and model cards do not catch what happens in production. Every AI decision needs a tamper-evident record — before, during, and after the fact.",
  },
  {
    icon: Layers,
    title: "Multi-tenant from day one",
    body: "Private equity and regulated operators run dozens of AI systems across portfolio companies. One control plane with hard tenant isolation is the only architecture that scales without becoming a liability.",
  },
];

/* ─────────────────────────────────────────────
   Timeline items (product story)
───────────────────────────────────────────── */
const STORY = [
  {
    year: "2023",
    title: "The gap from the field",
    body: "Commissioning enterprise SCADA systems for Irish Water and metro rail projects across three continents, Revanth kept hitting the same wall: AI tools being dropped into industrial workflows with no accountability layer. When something went wrong, nobody could explain why the model decided what it did.",
  },
  {
    year: "2024",
    title: "Engineering meets go-to-market",
    body: "Hitesh — with 25 years selling enterprise security and infrastructure at HPE, HaltDos, and Network Intelligence — saw the same problem from the customer side. Regulated buyers wanted AI but couldn't sign off without evidence trails, policy controls, and incident playbooks. Arcturos was the answer.",
  },
  {
    year: "2025",
    title: "First principles architecture",
    body: "We built AI Control Grid from scratch: multi-tenant, cryptographically sealed audit chains, inline policy enforcement, EU AI Act / NIST AI RMF / ISO 42001 compliance at runtime — not bolted on after the fact. Registry, risk, controls, telemetry, incidents, and evidence vault shipped as one platform.",
  },
  {
    year: "2026",
    title: "Arcturos — the operating layer for enterprise AI",
    body: "AI Control Grid is now in production with regulated operators, PE-backed software businesses, and compliance-first enterprise AI programmes. We're two founders, one product, and a very clear conviction about what responsible AI deployment actually requires.",
  },
];

/* ─────────────────────────────────────────────
   Stats
───────────────────────────────────────────── */
const STATS = [
  { value: "3", label: "Frameworks enforced at runtime", suffix: "" },
  { value: "250", label: "ms max policy evaluation latency", suffix: "<" },
  { value: "100%", label: "tenant-isolated data architecture", suffix: "" },
];

/* ─────────────────────────────────────────────
   Page
───────────────────────────────────────────── */
/* ─────────────────────────────────────────────
   PageLoader — full-screen dark curtain (matveyan style)
───────────────────────────────────────────── */
function PageLoader({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<'show' | 'lift' | 'done'>('show');
  useEffect(() => {
    const t1 = setTimeout(() => setPhase('lift'), 900);
    const t2 = setTimeout(() => { setPhase('done'); onDone(); }, 1900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (phase === 'done') return null;
  return (
    <motion.div
      animate={phase === 'lift' ? { y: '-100%' } : { y: 0 }}
      transition={phase === 'lift' ? { duration: 0.95, ease: [0.76, 0, 0.24, 1] } : { duration: 0 }}
      style={{ position: 'fixed', inset: 0, zIndex: 10000, backgroundColor: '#020202', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1.5rem' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{ fontSize: 'clamp(2rem,8vw,4.5rem)', fontWeight: 900, letterSpacing: '-0.03em', color: '#ffffff' }}
      >
        ARCTUROS
      </motion.div>
      <motion.div
        initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
        transition={{ duration: 0.55, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
        style={{ width: '6rem', height: 1, backgroundColor: TEAL, transformOrigin: 'center' }}
      />
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.4 }}
        style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.24em', color: 'rgba(0,255,209,0.6)', textTransform: 'uppercase' }}
      >
        AI CONTROL GRID
      </motion.div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────
   ScrollProgress — thin teal progress line at top
───────────────────────────────────────────── */
function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.001 });
  return (
    <motion.div
      style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 2, backgroundColor: TEAL, transformOrigin: '0%', scaleX, zIndex: 9995 }}
    />
  );
}

/* ─────────────────────────────────────────────
   LiveHUD — cursor X/Y + scroll% + elapsed time
───────────────────────────────────────────── */
function LiveHUD() {
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [scrollPct, setScrollPct] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startTime = useRef(Date.now());
  useEffect(() => {
    const onMove = (e: MouseEvent) => setCursor({ x: e.clientX, y: e.clientY });
    const onScroll = () => {
      const max = document.body.scrollHeight - window.innerHeight;
      setScrollPct(max > 0 ? Math.round((window.scrollY / max) * 100) : 0);
    };
    const ticker = setInterval(() => setElapsed((Date.now() - startTime.current) / 1000), 100);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('scroll', onScroll); clearInterval(ticker); };
  }, []);
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.2, duration: 0.6 }}
      style={{ position: 'fixed', bottom: '1.5rem', left: '1.5rem', zIndex: 9990, pointerEvents: 'none', fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.12em', lineHeight: 1.9, color: 'rgba(0,255,209,0.38)' }}
    >
      <div>X {cursor.x.toString().padStart(4, ' ')} / Y {cursor.y.toString().padStart(4, ' ')}</div>
      <div>SCROLL {scrollPct.toString().padStart(3, ' ')}%</div>
      <div>T {elapsed.toFixed(1)}s</div>
    </motion.div>
  );
}

export default function ArcturosPage() {
  const [_loaderDone, setLoaderDone] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  const heroY = useTransform(scrollYProgress, [0, 0.7], [0, 60]);

  return (
    <div className="min-h-screen bg-[#020202] text-white antialiased">
      <PageLoader onDone={() => setLoaderDone(true)} />
      <ScrollProgress />
      <LiveHUD />

      {/* ── Minimal dark nav ─────────────────── */}
      <header className="fixed left-0 top-0 z-50 w-full border-b border-white/[0.06] bg-[#020202]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#00FFD1]/20 bg-[#00FFD1]/5 text-[#00FFD1]">
              <ArcturosLogo size={22} />
            </span>
            <div className="flex flex-col leading-none">
              <span className="text-sm font-bold tracking-[0.14em] text-white">ARCTUROS</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#00FFD1]/70">
                AI CONTROL GRID
              </span>
            </div>
          </Link>
          <nav className="hidden items-center gap-6 lg:flex">
            {[
              { label: "Product", href: "/welcome" },
              { label: "Trust Center", href: "/trust-center" },
              { label: "Docs", href: "/api-docs" },
            ].map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="text-sm text-white/50 transition-colors hover:text-[#00FFD1]"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/book-demo"
            className="inline-flex items-center gap-2 rounded-full bg-[#00FFD1] px-5 py-2 text-sm font-semibold text-[#020202] transition-opacity hover:opacity-80"
          >
            Book a Demo <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      {/* ── HERO ─────────────────────────────── */}
      <section
        ref={heroRef}
        className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pt-16"
        style={{ background: BG_VOID }}
      >
        {/* 3D canvas */}
        <div className="pointer-events-none absolute inset-0">
          <HeroScene />
        </div>

        {/* Radial glow */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#00FFD1]/5 blur-[120px]" />
        </div>

        <motion.div
          style={{ opacity: heroOpacity, y: heroY }}
          className="relative z-10 flex flex-col items-center text-center"
        >
          {/* Animated logo */}
          <motion.div
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
            className="mb-10"
          >
            <div className="relative inline-block">
              <div className="absolute inset-0 rounded-full bg-[#00FFD1]/8 blur-2xl scale-150" />
              <ArcturosLogo size={100} />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="mb-5 font-mono text-xs uppercase tracking-[0.32em] text-[#00FFD1]">
              The company behind AI CONTROL GRID
            </div>
            <h1 className="text-[clamp(3.5rem,10vw,7rem)] font-black tracking-[-0.02em] text-white leading-none">
              ARCTUROS
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-[clamp(1rem,1.6vw,1.15rem)] leading-8 text-white/50">
              Founded by a Senior Automation Engineer and an Enterprise Sales leader who both
              lived the problem. We build runtime AI governance infrastructure that regulated
              teams can actually deploy, audit, and defend.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.55 }}
            className="mt-10 flex flex-wrap items-center justify-center gap-4"
          >
            <Link
              href="/book-demo"
              className="inline-flex items-center gap-2 rounded-full bg-[#00FFD1] px-7 py-3 text-sm font-bold text-[#020202] transition-opacity hover:opacity-85"
            >
              See the platform <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/welcome"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-7 py-3 text-sm font-medium text-white/70 transition-colors hover:border-[#00FFD1]/40 hover:text-[#00FFD1]"
            >
              Explore the product
            </Link>
          </motion.div>
        </motion.div>

        {/* Scroll hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2"
        >
          <div className="flex flex-col items-center gap-2">
            <div className="h-9 w-[1px] bg-gradient-to-b from-[#00FFD1]/60 to-transparent" />
            <span className="font-mono text-[10px] uppercase tracking-[0.26em] text-white/25">
              scroll
            </span>
          </div>
        </motion.div>
      </section>

      {/* ── CONVICTIONS (why we exist) ────────── */}
      <section className="bg-[#05050a] px-6 py-[clamp(5rem,10vw,8rem)] lg:px-[clamp(2rem,6vw,6rem)]">
        <div className="mx-auto max-w-6xl">
          <SeparatorLine />
          <FadeUp>
            <SectionLabel>Why we exist</SectionLabel>
          </FadeUp>
          <LineReveal className="max-w-2xl text-[clamp(2rem,4vw,2.75rem)] font-extrabold tracking-tight text-white leading-tight">
            Three convictions that drive everything we build.
          </LineReveal>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {CONVICTIONS.map((c, i) => (
              <FadeUp key={c.title} delay={i * 0.12}>
                <div className={`h-full rounded-2xl p-8 ${GLASS}`}>
                  <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-[#00FFD1]/20 bg-[#00FFD1]/5">
                    <c.icon className="h-5 w-5 text-[#00FFD1]" />
                  </div>
                  <h3 className="mb-3 text-base font-bold text-white">{c.title}</h3>
                  <p className="text-sm leading-7 text-white/50">{c.body}</p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOUNDERS ─────────────────────────── */}
      <section className="relative overflow-hidden bg-[#020202] px-6 py-[clamp(5rem,10vw,8rem)] lg:px-[clamp(2rem,6vw,6rem)]">
        {/* Section glow */}
        <div className="pointer-events-none absolute left-1/2 top-0 h-px w-[50rem] -translate-x-1/2 bg-gradient-to-r from-transparent via-[#00FFD1]/30 to-transparent" />

        <div className="mx-auto max-w-6xl">
          <SeparatorLine />
          <FadeUp>
            <SectionLabel>The founders</SectionLabel>
          </FadeUp>
          <LineReveal className="max-w-2xl text-[clamp(2rem,4vw,2.75rem)] font-extrabold tracking-tight text-white">
            One technical. One commercial. Both obsessed with the problem.
          </LineReveal>
          <FadeUp delay={0.15}>
            <p className="mt-4 max-w-xl text-base leading-7 text-white/45">
              Revanth brings 5+ years of enterprise SCADA, PLC, and AI engineering.
              Hitesh brings 25+ years of enterprise sales and GTM leadership across cybersecurity and infrastructure.
              Between them, every angle of the problem is covered.
            </p>
          </FadeUp>

          <div className="mt-14 grid gap-8 lg:grid-cols-2">
            {FOUNDERS.map((founder, i) => (
              <FadeUp key={founder.name} delay={i * 0.15}>
                <div className={`group relative rounded-2xl p-8 transition-all duration-500 hover:border-[#00FFD1]/20 ${GLASS}`}>
                  {/* Corner accent */}
                  <div className="absolute right-6 top-6 h-16 w-16 rounded-full bg-[#00FFD1]/4 blur-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

                  <div className="flex items-start gap-6">
                    <FounderAvatar initials={founder.initials} />
                    <div className="min-w-0">
                      <h3 className="text-xl font-bold text-white">{founder.name}</h3>
                      <p className="mt-0.5 font-mono text-xs uppercase tracking-[0.2em] text-[#00FFD1]">
                        {founder.title}
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-white/30">{founder.location}</p>
                    </div>
                  </div>

                  <p className="mt-6 text-sm leading-7 text-white/50">{founder.bio}</p>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {founder.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-white/10 px-3 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white/35"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className="mt-6 flex flex-wrap items-center gap-5">
                    <a
                      href={founder.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/40 transition-colors hover:text-[#00FFD1]"
                    >
                      LinkedIn <ExternalLink className="h-3 w-3" />
                    </a>
                    {founder.portfolio && (
                      <a
                        href={founder.portfolio}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/40 transition-colors hover:text-[#00FFD1]"
                      >
                        Portfolio <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              </FadeUp>
            ))}
          </div>

          {/* Update note for real photos */}
          <p className="mt-6 text-center font-mono text-[11px] text-white/20">
            Replace initials avatars by passing a <code className="text-white/30">photoSrc</code> prop to <code className="text-white/30">FounderAvatar</code>
          </p>
        </div>
      </section>

      {/* ── PRODUCT STORY (timeline) ─────────── */}
      <section className="bg-[#05050a] px-6 py-[clamp(5rem,10vw,8rem)] lg:px-[clamp(2rem,6vw,6rem)]">
        <div className="mx-auto max-w-4xl">
          <SeparatorLine />
          <FadeUp>
            <SectionLabel>How we got here</SectionLabel>
          </FadeUp>
          <LineReveal className="max-w-2xl text-[clamp(2rem,4vw,2.75rem)] font-extrabold tracking-tight text-white">
            The story behind AI CONTROL GRID.
          </LineReveal>

          <div className="mt-14 relative">
            {/* Vertical timeline line */}
            <div className="absolute left-[5.5rem] top-0 hidden h-full w-px bg-gradient-to-b from-[#00FFD1]/30 via-[#00FFD1]/10 to-transparent md:block" />

            <div className="space-y-10">
              {STORY.map((item, i) => (
                <FadeUp key={item.year} delay={i * 0.1}>
                  <div className="flex gap-8 md:gap-12">
                    {/* Year chip */}
                    <div className="relative shrink-0">
                      <div className="flex h-12 w-20 items-center justify-center rounded-xl border border-[#00FFD1]/25 bg-[#00FFD1]/5">
                        <span className="font-mono text-sm font-bold text-[#00FFD1]">{item.year}</span>
                      </div>
                      {/* Timeline dot */}
                      <div className="absolute -right-[1.6rem] top-1/2 hidden h-2 w-2 -translate-y-1/2 rounded-full bg-[#00FFD1] shadow-[0_0_8px_rgba(0,255,209,0.8)] md:block" />
                    </div>
                    <div className="pt-2">
                      <h3 className="font-bold text-white">{item.title}</h3>
                      <p className="mt-2 text-sm leading-7 text-white/45">{item.body}</p>
                    </div>
                  </div>
                </FadeUp>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS ────────────────────────────── */}
      <section className="bg-[#020202] px-6 py-[clamp(4rem,8vw,6rem)] lg:px-[clamp(2rem,6vw,6rem)]">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-px overflow-hidden rounded-2xl border border-white/[0.07] md:grid-cols-3">
            {STATS.map((stat, i) => (
              <FadeUp key={stat.label} delay={i * 0.1}>
                <div className="flex flex-col items-center gap-2 bg-white/[0.02] px-8 py-10 text-center">
                  <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#00FFD1]/70">
                    {stat.suffix}
                  </span>
                  <span className="text-[clamp(3rem,6vw,4rem)] font-black tracking-tight text-white leading-none">
                    {stat.value}
                  </span>
                  <span className="mt-1 text-sm text-white/35">{stat.label}</span>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────── */}
      <section className="relative overflow-hidden bg-[#05050a] px-6 py-[clamp(5rem,10vw,8rem)] lg:px-[clamp(2rem,6vw,6rem)]">
        {/* Decorative lines */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-12 h-px w-[36rem] -translate-x-[72%] rotate-[16deg] bg-gradient-to-r from-transparent via-[#00FFD1]/50 to-transparent" />
          <div className="absolute left-1/2 top-12 h-px w-[36rem] -translate-x-[28%] -rotate-[16deg] bg-gradient-to-r from-transparent via-[#00FFD1]/50 to-transparent" />
          <div className="absolute left-1/2 top-20 h-32 w-32 -translate-x-1/2 rounded-full bg-[#00FFD1]/8 blur-[80px]" />
        </div>

        <FadeUp className="relative z-10 flex flex-col items-center text-center">
          <div className="mb-6">
            <ArcturosLogo size={56} />
          </div>
          <SectionLabel>Start your programme</SectionLabel>
          <h2 className="max-w-3xl text-[clamp(2.2rem,5vw,3.25rem)] font-extrabold tracking-tight text-white">
            Bring your AI systems onto AI CONTROL GRID.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-base leading-8 text-white/45">
            Arcturos gives regulated teams one institutional-grade operating layer
            for runtime policy, incident response, cryptographic evidence, and
            portfolio oversight.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Link
              href="/book-demo"
              className="inline-flex items-center gap-2 rounded-full bg-[#00FFD1] px-8 py-3.5 text-sm font-bold text-[#020202] transition-opacity hover:opacity-85"
            >
              Book an enterprise demo <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/trust-center"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-8 py-3.5 text-sm font-medium text-white/60 transition-colors hover:border-[#00FFD1]/30 hover:text-[#00FFD1]"
            >
              <Lock className="h-3.5 w-3.5" />
              Review the Trust Center
            </Link>
          </div>
        </FadeUp>
      </section>

      {/* ── FOOTER ───────────────────────────── */}
      <footer className="border-t border-white/[0.06] bg-[#020202] px-6 py-10 lg:px-[clamp(2rem,6vw,6rem)]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 md:flex-row">
          <div className="flex items-center gap-3">
            <ArcturosLogo size={24} />
            <div className="leading-none">
              <span className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-white">
                Arcturos
              </span>
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">
                AI Control Grid
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-[0.18em] text-white/30">
            <Link href="/privacy" className="transition-colors hover:text-[#00FFD1]">Privacy</Link>
            <Link href="/terms" className="transition-colors hover:text-[#00FFD1]">Terms</Link>
            <Link href="/security" className="transition-colors hover:text-[#00FFD1]">Security</Link>
            <Link href="/trust-center" className="transition-colors hover:text-[#00FFD1]">Trust Center</Link>
            <Link href="/api-docs" className="transition-colors hover:text-[#00FFD1]">API Docs</Link>
          </div>
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/20">
            © 2026 Arcturos
          </span>
        </div>
      </footer>

    </div>
  );
}
