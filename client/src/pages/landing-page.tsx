import { Canvas, useFrame } from "@react-three/fiber";
import {
  Float,
  Html,
  Line,
  PointMaterial,
  Points,
} from "@react-three/drei";
import {
  motion,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
} from "framer-motion";
import {
  ArrowRight,
  Blocks,
  Lock,
  Shield,
  SquareStack,
  TriangleAlert,
  Workflow,
} from "lucide-react";
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  Color,
  Euler,
  MathUtils,
  Vector3,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type MeshPhysicalMaterial,
  type MeshStandardMaterial,
  type SpotLight,
} from "three";
import { BrandMark } from "@/components/brand-mark";
import { usePageCopy, type PageCopyCatalog } from "@/lib/page-copy";

const glassClass =
  "bg-white/[0.03] border border-white/[0.08] backdrop-blur-xl shadow-[0_0_40px_rgba(0,255,209,0.05)]";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const lerp = (start: number, end: number, value: number) =>
  start + (end - start) * value;

const NAV_ITEMS = [
  { label: "Product", href: "#product" },
  { label: "Solutions", href: "#solutions" },
  { label: "Frameworks", href: "#frameworks" },
  { label: "Pricing", href: "#pricing" },
  { label: "Trust Center", href: "/trust-center" },
  { label: "Docs", href: "/api-docs" },
];

const ENGINE_STEPS = [
  {
    label: "Inline preflight",
    title: "Intercept prompts before they reach the model.",
    body:
      "Evaluate prompt intent, tenant context, and restricted patterns at the gateway edge before the provider sees a single token.",
  },
  {
    label: "Tool allowlists",
    title: "Constrain model actions to approved execution lanes.",
    body:
      "Default-deny tool routing, typed argument validation, and tenant-scoped action policy keep runtime behaviour inside governed boundaries.",
  },
  {
    label: "Auto-escalation",
    title: "Turn runtime breaches into immediate operational work.",
    body:
      "Critical detections open incidents, update risk posture, and attach decision evidence without waiting for manual triage.",
  },
];

const BENTO_CARDS = [
  {
    icon: Shield,
    title: "Inline gateway",
    copy:
      "Preflight prompts, postflight outputs, and tool invocations in one enforcement path with tenant-aware policy binding.",
    accent: "#00FFD1",
    outcome: "Ship copilots without a new risk team",
    metric: "<250ms",
  },
  {
    icon: Blocks,
    title: "SDK guard mode",
    copy:
      "Drop runtime governance into first-party apps without requiring a separate telemetry database or proxy rewrite.",
    accent: "#00FA9A",
    outcome: "Deploy in existing app flows with minimal architecture change",
    metric: "4 SDK lanes",
  },
  {
    icon: TriangleAlert,
    title: "Incident automation",
    copy:
      "Threshold breaches become containment work with escalation targets, decision traces, and review-ready evidence.",
    accent: "#FF3366",
    outcome: "Cut containment lag from hours to immediate runtime action",
    metric: "94% auto-open",
  },
  {
    icon: Lock,
    title: "Cryptographic evidence",
    copy:
      "Hash-chained decision records create due-diligence-grade auditability for M&A, LP reviews, and regulatory inspection.",
    accent: "#00FFD1",
    outcome: "Pass technical diligence with tamper-evident receipts",
    metric: "SHA-256",
  },
  {
    icon: Workflow,
    title: "Human override controls",
    copy:
      "Reviewer exceptions stay scoped to the right organization and system instead of weakening policy platform-wide.",
    accent: "#00FA9A",
    outcome: "Allow justified overrides without globally weakening policy",
    metric: "tenant-scoped",
  },
  {
    icon: SquareStack,
    title: "Portfolio roll-up",
    copy:
      "Manage multiple operating companies from one control plane while preserving tenant isolation and local policy nuance.",
    accent: "#00FFD1",
    outcome: "See portfolio-wide AI posture in one pane",
    metric: "50 portcos",
  },
];

const FOOTER_COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Runtime", href: "#solutions" },
      { label: "Incidents", href: "#solutions" },
      { label: "Evidence", href: "#vault" },
      { label: "Portfolio", href: "#frameworks" },
    ],
  },
  {
    title: "Security",
    links: [
      { label: "Inline gateway", href: "#engine" },
      { label: "SDK guard", href: "#engine" },
      { label: "Trust Center", href: "/trust-center" },
      { label: "API Docs", href: "/api-docs" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "EU AI Act", href: "#frameworks" },
      { label: "NIST AI RMF", href: "#frameworks" },
      { label: "ISO 42001", href: "#frameworks" },
      { label: "Due diligence", href: "#vault" },
    ],
  },
  {
    title: "Contact",
    links: [
      { label: "Enterprise demos", href: "/book-demo" },
      { label: "Security reviews", href: "/trust-center" },
      { label: "Private equity", href: "/start-pilot" },
      { label: "Support", href: "/auth/login" },
    ],
  },
];

const HERO_SIGNAL_CARDS = [
  {
    label: "Runtime policy",
    value: "Allow / warn / block",
  },
  {
    label: "Decision sealing",
    value: "SHA-256 linked evidence",
  },
  {
    label: "Operating model",
    value: "Inline gateway + SDK guard",
  },
];

const HERO_OUTCOMES = [
  {
    title: "Block PII leaks from claims adjusters",
    metric: "<250ms median enforcement",
  },
  {
    title: "Prove EU AI Act readiness for underwriting copilots",
    metric: "Tamper-evident decision receipts",
  },
  {
    title: "Roll up 50 portfolio companies into one pane",
    metric: "Tenant-isolated control plane",
  },
];

const PROOF_STRIP = [
  {
    label: "Governed calls / day",
    value: "1.2M+",
    detail: "Runtime requests evaluated and sealed through the governed edge.",
  },
  {
    label: "Median enforcement latency",
    value: "<250ms",
    detail: "Policy runs in-line fast enough for production customer workflows.",
  },
  {
    label: "Critical incidents auto-opened",
    value: "94%",
    detail: "High-risk runtime breaches route straight into containment operations.",
  },
  {
    label: "Due diligence evidence SLA",
    value: "<1 week",
    detail: "Operators can assemble audit-ready evidence without spreadsheet hunts.",
  },
];

type LandingCopy = PageCopyCatalog["landing"];

const OPERATOR_QUOTES = [
  {
    quote:
      "We stopped treating AI governance as quarterly paperwork. The control plane now acts in-line with production traffic.",
    by: "Operating partner, multi-org PE platform",
  },
  {
    quote:
      "Our security team finally has one place to see blocked prompts, escalations, and evidence without chasing teams in Slack.",
    by: "Head of AI assurance, regulated financial services",
  },
];

const FLOW_NODES = [
  {
    id: "user",
    title: "User request",
    detail: "Employee or customer prompt enters a governed workflow.",
    color: "#94A3B8",
  },
  {
    id: "gateway",
    title: "Inline gateway",
    detail: "Preflight policy checks, tenant binding, and tool restrictions execute before model invocation.",
    color: "#00FFD1",
  },
  {
    id: "models",
    title: "Provider mesh",
    detail: "Approved model routes only. Unsafe outputs are intercepted before release.",
    color: "#00FA9A",
  },
  {
    id: "vault",
    title: "Evidence vault",
    detail: "Every decision gets a tamper-evident receipt that auditors and operators can query later.",
    color: "#7dd3fc",
  },
];

const PILLARS = [
  {
    id: "runtime-policy",
    title: "Runtime Policy",
    icon: Shield,
    body:
      "Ship copilots without creating a new risk team. Prompt, output, and tool policy are enforced where traffic actually runs.",
    metric: "Block sensitive prompt patterns before the provider call",
  },
  {
    id: "incident-operations",
    title: "Incident Operations",
    icon: TriangleAlert,
    body:
      "Turn runtime breaches into immediate operational work with owners, containment clocks, and post-incident review already attached.",
    metric: "Critical detections open incidents and escalate automatically",
  },
  {
    id: "cryptographic-evidence",
    title: "Cryptographic Evidence",
    icon: Lock,
    body:
      "Pass technical due diligence faster with receipts that tie prompt, model, reviewer action, and framework context together.",
    metric: "Every decision can be traced back to a sealed evidence chain",
  },
];

const FRAMEWORK_BADGES = ["EU AI Act", "NIST AI RMF", "ISO 42001"];

const TOUR_STEPS = [
  {
    title: "Preflight",
    body: "Claims adjuster attempts to submit a prompt containing sensitive identity data.",
    status: "blocked before model execution",
  },
  {
    title: "Escalation",
    body: "Control Tower opens a runtime incident and routes ownership to compliance and system operations.",
    status: "incident opened automatically",
  },
  {
    title: "Evidence",
    body: "The final decision, reviewer action, and framework linkage are sealed into one receipt.",
    status: "evidence stored for due diligence",
  },
];

const BUILD_VERIFY_CARDS = [
  {
    title: "API Docs",
    body: "Wire your gateway, SDK, and provider routes without reverse engineering the product.",
    href: "/api-docs",
    accent: "#00FFD1",
  },
  {
    title: "Trust Center",
    body: "Security posture, deployment assumptions, and diligence-facing controls in one place.",
    href: "/trust-center",
    accent: "#00FA9A",
  },
];

const ROLE_CTA_CARDS = [
  {
    title: "For CISOs",
    body: "Centralize AI enforcement and incident response without waiting for quarterly control reviews.",
    href: "/book-demo",
  },
  {
    title: "For PE Operating Partners",
    body: "Standardize policy and evidence across portfolio companies while keeping each tenant isolated.",
    href: "/start-pilot",
  },
  {
    title: "For Heads of AI",
    body: "Ship copilots with inline safeguards instead of after-the-fact monitoring alone.",
    href: "/book-demo",
  },
];

const VAULT_RECEIPTS = [
  { hash: "0x3f1a...a91c", time: "14:03:12 UTC", tag: "EU AI Act linked" },
  { hash: "0x77be...21dd", time: "14:03:19 UTC", tag: "Human override logged" },
  { hash: "0xab42...fe90", time: "14:03:28 UTC", tag: "Incident receipt sealed" },
];

const ESCALATION_FLOW = [
  { label: "Detect", detail: "restricted prompt flagged", tone: "#FF3366" },
  { label: "Incident", detail: "runtime record opened", tone: "#00FFD1" },
  { label: "Owner", detail: "compliance + ops assigned", tone: "#00FA9A" },
  { label: "Receipt", detail: "evidence stored", tone: "#7dd3fc" },
];

const PORTFOLIO_COMPANIES = [
  {
    name: "Silverline Insurance",
    detail: "Claims runtime governed",
    className: "left-6 top-28 xl:left-10",
  },
  {
    name: "Northstar Consumer Bank",
    detail: "Voice and service AI in scope",
    className: "right-6 top-28 xl:right-10",
  },
  {
    name: "Policy Servicing Group",
    detail: "Shared control plane attached",
    className: "left-8 bottom-16 xl:left-12",
  },
  {
    name: "Northbridge Health",
    detail: "Clinical copilots governed",
    className: "right-8 bottom-16 xl:right-12",
  },
];

type HeroSceneProps = {
  progress: number;
  velocity: number;
  pointer: { x: number; y: number };
};

type ProblemSceneProps = {
  progress: number;
  velocity: number;
  particleCount: number;
};

type TerminalSceneProps = {
  progress: number;
  velocity: number;
  blockTriggered: boolean;
};

type VaultSceneProps = {
  progress: number;
  velocity: number;
};

type GlobeSceneProps = {
  progress: number;
  velocity: number;
  pointCount: number;
};

type MagneticButtonProps = {
  href: string;
  children: string;
};

type GlareCardProps = {
  title: string;
  copy: string;
  accent: string;
  icon: typeof Shield;
  outcome: string;
  metric: string;
};

type SceneCanvasProps = {
  camera: { position: [number, number, number]; fov: number };
  children: ReactNode;
  label: string;
  isMobile: boolean;
  className?: string;
  rootMargin?: string;
};

function NavLink({ href, children }: { href: string; children: string }) {
  if (href.startsWith("#")) {
    return (
      <motion.a
        href={href}
        className="group relative text-sm font-medium text-slate-300 transition-colors duration-300 hover:text-white"
        whileHover="hover"
      >
        {children}
        <motion.span
          className="absolute -bottom-3 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-[#00FFD1] opacity-0"
          variants={{ hover: { opacity: 1, scale: 1.1 } }}
          transition={{ duration: 0.2 }}
        />
      </motion.a>
    );
  }

  return (
    <motion.div whileHover="hover">
      <SmartLink
        href={href}
        className="group relative text-sm font-medium text-slate-300 transition-colors duration-300 hover:text-white"
      >
        {children}
        <motion.span
          className="absolute -bottom-3 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-[#00FFD1] opacity-0"
          variants={{ hover: { opacity: 1, scale: 1.1 } }}
          transition={{ duration: 0.2 }}
        />
      </SmartLink>
    </motion.div>
  );
}

function Navbar({ copy }: { copy: LandingCopy }) {
  const badges = copy.badges ?? {};
  const navItems = [
    { label: badges.productNav ?? "Product", href: "#product" },
    { label: badges.solutionsNav ?? "Solutions", href: "#solutions" },
    { label: badges.frameworksNav ?? "Frameworks", href: "#frameworks" },
    { label: badges.pricingNav ?? "Pricing", href: "#pricing" },
    { label: badges.trustCenterNav ?? "Trust Center", href: "/trust-center" },
    { label: badges.docsNav ?? "Docs", href: "/api-docs" },
  ];
  return (
    <div className="fixed left-0 top-0 z-50 w-full bg-gradient-to-b from-[#050505] via-[#050505]/85 to-transparent backdrop-blur-md">
      <div className="mx-auto flex h-[clamp(4.25rem,6vw,5rem)] max-w-[1600px] items-center justify-between px-4 sm:px-6 lg:px-10 xl:px-16">
        <a href="#top" className="flex items-center gap-3">
          <span className="flex h-[clamp(2.5rem,4vw,2.75rem)] w-[clamp(2.5rem,4vw,2.75rem)] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-[#00FFD1] shadow-[0_0_28px_rgba(0,255,209,0.18)]">
            <BrandMark className="h-4 w-4 sm:h-5 sm:w-5" />
          </span>
          <div className="flex flex-col">
            <span className="text-[clamp(1rem,1.5vw,1.25rem)] font-bold tracking-[0.18em] text-white sm:tracking-[0.24em]">
              AI CONTROL TOWER
            </span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500 sm:text-[11px] sm:tracking-[0.22em]">
              {badges.runtimeGovernance ?? "Runtime governance"}
            </span>
          </div>
        </a>

        <div className="hidden items-center gap-4 md:flex lg:gap-5 xl:gap-8">
          {navItems.map((item, index) => (
            <div key={item.label} className={index > 3 ? "hidden xl:block" : ""}>
              <NavLink href={item.href}>{item.label}</NavLink>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <SmartLink
              href="/auth/login"
              className="hidden rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-300 transition-all duration-300 hover:border-white/20 hover:text-white sm:inline-flex"
            >
              {badges.signIn ?? "Sign In"}
            </SmartLink>
          </motion.div>
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
            <SmartLink
              href="/book-demo"
              className="rounded-full border border-[#00FFD1] px-4 py-2 text-sm font-semibold text-[#00FFD1] transition-all duration-300 hover:bg-[#00FFD1] hover:text-black sm:px-5 xl:px-6"
            >
              {badges.bookDemo ?? "Book a Demo"}
            </SmartLink>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({
  children,
  tone = "cyan",
}: {
  children: string;
  tone?: "cyan" | "emerald" | "red";
}) {
  const tones = {
    cyan: "text-[#00FFD1]",
    emerald: "text-[#00FA9A]",
    red: "text-[#FF3366]",
  };

  return (
    <div
      className={`mb-5 font-mono text-xs uppercase tracking-[0.3em] ${tones[tone]}`}
    >
      {children}
    </div>
  );
}

function SectionShell({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={`relative overflow-hidden ${className ?? ""}`.trim()}
    >
      {children}
    </section>
  );
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const update = () => {
      setIsMobile(window.innerWidth < 768);
    };

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return isMobile;
}

function SceneFallback({
  label,
  inactive = false,
}: {
  label: string;
  inactive?: boolean;
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,255,209,0.12),transparent_28%)]" />
      <motion.div
        className="absolute h-24 w-24 rounded-[28px] border border-[#00FFD1]/25"
        animate={inactive ? { opacity: 0.18 } : { scale: [0.92, 1.05, 0.92], opacity: [0.28, 0.55, 0.28] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="rounded-full border border-white/10 bg-black/35 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[#00FFD1] backdrop-blur-xl">
        {inactive ? `${label} paused` : `${label} loading`}
      </div>
    </div>
  );
}

function SceneCanvas({
  camera,
  children,
  label,
  isMobile,
  className,
  rootMargin = "-10% 0px -10% 0px",
}: SceneCanvasProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, {
    margin: rootMargin as NonNullable<Parameters<typeof useInView>[1]>["margin"],
    amount: 0.08,
  });

  return (
    <div ref={ref} className={className ?? "absolute inset-0"}>
      {inView ? (
        <Suspense fallback={<SceneFallback label={label} />}>
          <Canvas camera={camera} dpr={isMobile ? [1, 1.1] : [1, 1.5]}>
            {children}
          </Canvas>
        </Suspense>
      ) : (
        <SceneFallback label={label} inactive />
      )}
    </div>
  );
}

function SmartLink({
  href,
  className,
  children,
  onClick,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  if (href.startsWith("#")) {
    return (
      <a href={href} className={className} onClick={onClick}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}

function HeroScene({ progress, velocity, pointer }: HeroSceneProps) {
  const boxRef = useRef<Mesh>(null);
  const shellRef = useRef<Mesh>(null);
  const spotRef = useRef<SpotLight>(null);
  const fragmentsRef = useRef<Mesh[]>([]);
  const panelRefs = useRef<Mesh[]>([]);
  const floorRef = useRef<Group>(null);
  const radarRingsRef = useRef<Mesh[]>([]);

  const fragments = useMemo(() => {
    const items: Array<{
      source: Vector3;
      target: Vector3;
      scale: number;
    }> = [];

    for (let x = -3; x <= 3; x += 1) {
      for (let y = -3; y <= 3; y += 1) {
        const target = new Vector3(x * 0.62, y * 0.62, 0);
        const source = new Vector3(
          x * 0.85 + (Math.random() - 0.5) * 5.5,
          y * 0.75 + (Math.random() - 0.5) * 4.5,
          (Math.random() - 0.5) * 5,
        );

        items.push({
          source,
          target,
          scale: 0.12 + Math.random() * 0.18,
        });
      }
    }

    return items;
  }, []);

  useFrame((state, delta) => {
    const t = MathUtils.smoothstep(progress, 0.06, 0.96);
    const velocityBoost = clamp(velocity, 0, 1.4);

    if (boxRef.current) {
      boxRef.current.rotation.y += delta * (0.22 + velocityBoost * 0.18);
      boxRef.current.rotation.x = MathUtils.lerp(
        boxRef.current.rotation.x,
        pointer.y * 0.22,
        0.06,
      );
      boxRef.current.rotation.z = MathUtils.lerp(
        boxRef.current.rotation.z,
        -pointer.x * 0.16,
        0.06,
      );
      boxRef.current.scale.setScalar(lerp(1, 0.68, t));
      boxRef.current.position.z = lerp(0, -1.4, t);
      const material = boxRef.current.material as MeshStandardMaterial;
      material.opacity = lerp(1, 0.08, t);
    }

    if (shellRef.current) {
      shellRef.current.rotation.copy(boxRef.current?.rotation ?? new Euler());
      shellRef.current.scale.setScalar(lerp(1.03, 0.78, t));
      const material = shellRef.current.material as MeshStandardMaterial;
      material.opacity = lerp(0.24, 0.02, t);
    }

    fragments.forEach((fragment, index) => {
      const mesh = fragmentsRef.current[index];
      if (!mesh) return;

      mesh.position.lerpVectors(fragment.source, fragment.target, t);
      mesh.rotation.x += delta * (0.25 + velocityBoost * 0.4);
      mesh.rotation.y += delta * (0.35 + velocityBoost * 0.45);
      const scale = fragment.scale * lerp(0.3, 1.4 + velocityBoost * 0.2, t);
      mesh.scale.setScalar(scale);
      const material = mesh.material as MeshPhysicalMaterial;
      material.opacity = lerp(0.05, 0.9, t);
      material.emissiveIntensity = lerp(0.2, 1.1 + velocityBoost * 0.4, t);
    });

    panelRefs.current.forEach((mesh, index) => {
      if (!mesh) return;
      mesh.rotation.y += delta * (0.08 + index * 0.015);
      mesh.position.y = Math.sin(state.clock.elapsedTime * 0.9 + index * 0.8) * 0.12 + (index % 2 === 0 ? 1.5 : -1.6);
      const material = mesh.material as MeshPhysicalMaterial;
      material.opacity = lerp(0.22, 0.52, t);
      material.emissiveIntensity = 0.35 + velocityBoost * 0.22;
    });

    if (floorRef.current) {
      floorRef.current.position.y = MathUtils.lerp(floorRef.current.position.y, -2.9, 0.08);
      floorRef.current.rotation.x = MathUtils.lerp(floorRef.current.rotation.x, -1.18, 0.08);
      floorRef.current.position.z = lerp(-3.5, -2.6, t);
    }

    radarRingsRef.current.forEach((ring, index) => {
      if (!ring) return;
      const phase = ((state.clock.elapsedTime * 0.28 + index * 0.22) % 1) + t * 0.18;
      const scale = 1.2 + phase * 3.1;
      ring.scale.set(scale, scale, 1);
      const material = ring.material as MeshBasicMaterial;
      material.opacity = 0.2 - phase * 0.14;
    });

    if (spotRef.current) {
      spotRef.current.position.x = MathUtils.lerp(
        spotRef.current.position.x,
        pointer.x * 5.5,
        0.08,
      );
      spotRef.current.position.y = MathUtils.lerp(
        spotRef.current.position.y,
        2.5 + pointer.y * 3.5,
        0.08,
      );
    }

    state.camera.position.z = MathUtils.lerp(
      state.camera.position.z,
      lerp(9.5, 8.2, t),
      0.06,
    );
  });

  return (
    <>
      <color attach="background" args={["#050505"]} />
      <ambientLight intensity={0.45} color="#7dd3fc" />
      <directionalLight position={[4, 6, 8]} intensity={0.8} color="#ffffff" />
      <spotLight
        ref={spotRef}
        position={[0, 3.4, 5]}
        angle={0.35}
        penumbra={0.8}
        intensity={30}
        color="#00FFD1"
      />

      <mesh ref={boxRef}>
        <boxGeometry args={[3.4, 3.4, 3.4]} />
        <meshStandardMaterial
          color="#040404"
          metalness={0.72}
          roughness={0.24}
          transparent
        />
      </mesh>

      <mesh ref={shellRef}>
        <boxGeometry args={[3.56, 3.56, 3.56]} />
        <meshStandardMaterial
          color="#0d1117"
          emissive="#00FFD1"
          emissiveIntensity={0.12}
          wireframe
          transparent
          opacity={0.24}
        />
      </mesh>

      <group>
        {fragments.map((_, index) => (
          <mesh
            key={`fragment-${index}`}
            ref={(node) => {
              if (node) fragmentsRef.current[index] = node;
            }}
          >
            <boxGeometry args={[0.18, 0.18, 0.18]} />
            <meshPhysicalMaterial
              color="#7fffd4"
              emissive="#00FFD1"
              metalness={0.1}
              roughness={0.08}
              transmission={0.86}
              thickness={0.8}
              transparent
              opacity={0.1}
            />
          </mesh>
        ))}
      </group>

      <group ref={floorRef} position={[0, -2.9, -3.5]} rotation={[-1.18, 0, 0]}>
        <gridHelper args={[18, 18, "#00FFD1", "#0f172a"]} />
      </group>

      <group position={[0, -0.35, -2.8]}>
        {[0, 1, 2].map((index) => (
          <mesh
            key={`radar-ring-${index}`}
            ref={(node) => {
              if (node) radarRingsRef.current[index] = node;
            }}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <ringGeometry args={[0.62, 0.68, 64]} />
            <meshBasicMaterial color="#00FFD1" transparent opacity={0.12} />
          </mesh>
        ))}
        <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.16, 32]} />
          <meshBasicMaterial color="#00FFD1" transparent opacity={0.85} />
        </mesh>
      </group>

      <group>
        {[
          { position: [-3.8, 1.55, -1.4], scale: [1.7, 1.05, 1] as [number, number, number] },
          { position: [3.9, -1.6, -1.2], scale: [1.95, 1.2, 1] as [number, number, number] },
          { position: [4.6, 1.2, -2.2], scale: [1.35, 0.82, 1] as [number, number, number] },
        ].map((panel, index) => (
          <mesh
            key={`panel-${index}`}
            ref={(node) => {
              if (node) panelRefs.current[index] = node;
            }}
            position={panel.position as [number, number, number]}
            scale={panel.scale}
            rotation={[0, index % 2 === 0 ? -0.42 : 0.36, 0]}
          >
            <planeGeometry args={[1, 1]} />
            <meshPhysicalMaterial
              color="#dbeafe"
              emissive={index === 1 ? "#00FA9A" : "#00FFD1"}
              emissiveIntensity={0.28}
              transmission={0.88}
              roughness={0.08}
              thickness={0.9}
              transparent
              opacity={0.24}
            />
          </mesh>
        ))}
      </group>

      <group position={[0, 0, -3.4]}>
        {Array.from({ length: 18 }).map((_, index) => {
          const radius = 4 + (index % 6) * 0.75;
          const angle = (index / 18) * Math.PI * 2;
          return (
            <mesh
              key={`halo-${index}`}
              position={[
                Math.cos(angle) * radius,
                Math.sin(angle) * radius * 0.55,
                0,
              ]}
            >
              <sphereGeometry args={[0.05, 12, 12]} />
              <meshBasicMaterial color="#00FFD1" />
            </mesh>
          );
        })}
      </group>
    </>
  );
}

function ProblemScene({ progress, velocity, particleCount }: ProblemSceneProps) {
  const particleRefs = useRef<Mesh[]>([]);
  const shieldRef = useRef<Mesh>(null);
  const streamRefs = useRef<Mesh[]>([]);

  const particles = useMemo(
    () =>
      Array.from({ length: particleCount }, (_, index) => ({
        angle: (index / particleCount) * Math.PI * 2,
        radius: 0.65 + Math.random() * 1.45,
        height: lerp(-2.9, 2.9, index / Math.max(particleCount - 1, 1)),
        streamX: lerp(-1.9, 1.9, (index % 10) / 9),
        streamZ: lerp(-0.9, 0.9, ((index + 3) % 10) / 9),
        threshold: 0.14 + (index / particleCount) * 0.34,
      })),
    [particleCount],
  );

  const red = useMemo(() => new Color("#FF3366"), []);
  const emerald = useMemo(() => new Color("#00FA9A"), []);
  const darkRed = useMemo(() => new Color("#7f1d1d"), []);
  const darkEmerald = useMemo(() => new Color("#064e3b"), []);

  useFrame((state, delta) => {
    const velocityBoost = clamp(velocity, 0, 1.3);
    const time = state.clock.elapsedTime;

    particles.forEach((particle, index) => {
      const mesh = particleRefs.current[index];
      if (!mesh) return;

      const phase = particle.angle + time * (0.95 + velocityBoost * 0.55);
      const funnelRadius = particle.radius * (1.25 - Math.abs(particle.height) * 0.1);
      const vortexPosition = new Vector3(
        Math.sin(phase) * funnelRadius,
        particle.height + Math.sin(time * 0.9 + index * 0.14) * 0.24,
        Math.cos(phase) * funnelRadius,
      );

      const streamProgress = (time * 0.12 + index / particles.length) % 1;
      const streamPosition = new Vector3(
        particle.streamX,
        lerp(2.8, -2.8, streamProgress),
        particle.streamZ,
      );

      const cleanse = clamp((progress - particle.threshold) * 2.8, 0, 1);
      mesh.position.lerpVectors(vortexPosition, streamPosition, cleanse);
      mesh.scale.setScalar(0.095 + cleanse * 0.04 + velocityBoost * 0.018);

      const material = mesh.material as MeshStandardMaterial;
      material.color.lerpColors(red, emerald, cleanse);
      material.emissive.lerpColors(darkRed, darkEmerald, cleanse);
      material.emissiveIntensity = 0.8 + cleanse * 0.55;
    });

    if (shieldRef.current) {
      shieldRef.current.position.x = lerp(4.5, -0.2, progress);
      shieldRef.current.rotation.y += delta * 0.15;
      const material = shieldRef.current.material as MeshPhysicalMaterial;
      material.opacity = lerp(0.08, 0.42, clamp(progress * 1.4, 0, 1));
      material.emissiveIntensity = 0.65 + clamp(progress, 0, 1) * 0.6;
    }

    streamRefs.current.forEach((mesh, index) => {
      if (!mesh) return;
      const phase = ((time * 0.22 + index * 0.17) % 1) * Math.PI * 2;
      mesh.scale.y = 0.65 + Math.sin(phase) * 0.25 + progress * 0.55;
      const material = mesh.material as MeshBasicMaterial;
      material.opacity = clamp(progress * 1.35 - 0.15, 0, 1) * 0.55;
    });
  });

  return (
    <>
      <color attach="background" args={["#050505"]} />
      <ambientLight intensity={0.55} color="#c4b5fd" />
      <pointLight position={[3, 4, 3]} intensity={24} color="#00FFD1" />
      <pointLight position={[-3, -2, -1]} intensity={14} color="#FF3366" />
      <pointLight position={[0, -2, 4]} intensity={12} color="#00FA9A" />

      <group>
        {particles.map((_, index) => (
          <mesh
            key={`particle-${index}`}
            ref={(node) => {
              if (node) particleRefs.current[index] = node;
            }}
          >
            <sphereGeometry args={[0.11, 18, 18]} />
            <meshStandardMaterial
              color="#FF3366"
              emissive="#7f1d1d"
              emissiveIntensity={1.25}
            />
          </mesh>
        ))}
      </group>

      <mesh ref={shieldRef} position={[4.5, 0, 0]} scale={[0.36, 4.2, 3.1]}>
        <sphereGeometry args={[1.25, 48, 48]} />
        <meshPhysicalMaterial
          color="#00FFD1"
          emissive="#00FFD1"
          emissiveIntensity={1}
          transmission={0.92}
          thickness={0.9}
          roughness={0.08}
          transparent
          opacity={0.18}
        />
      </mesh>

      <group position={[0, 0, -0.6]}>
        {Array.from({ length: 10 }).map((_, index) => (
          <mesh
            key={`stream-${index}`}
            position={[lerp(-1.9, 1.9, index / 9), 0, 0]}
            ref={(node) => {
              if (node) streamRefs.current[index] = node;
            }}
          >
            <cylinderGeometry args={[0.08, 0.08, 6.1, 18]} />
            <meshBasicMaterial color="#00FA9A" transparent opacity={0.12} />
          </mesh>
        ))}
      </group>

      <mesh position={[0, -2.5, -1.8]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7, 7]} />
        <meshBasicMaterial color="#001a18" transparent opacity={0.28} />
      </mesh>
    </>
  );
}

function TerminalScene({ progress, velocity, blockTriggered }: TerminalSceneProps) {
  const ringRef = useRef<Mesh>(null);
  const planeRef = useRef<Mesh>(null);
  const streakRef = useRef<Mesh>(null);

  useFrame((state) => {
    const pulse = blockTriggered
      ? 0.65 + ((state.clock.elapsedTime * 1.35) % 1)
      : 0.25;

    if (ringRef.current) {
      ringRef.current.scale.x = MathUtils.lerp(
        ringRef.current.scale.x,
        pulse * 2.1,
        0.08,
      );
      ringRef.current.scale.y = MathUtils.lerp(
        ringRef.current.scale.y,
        pulse * 2.1,
        0.08,
      );
      const material = ringRef.current.material as MeshBasicMaterial;
      material.opacity = blockTriggered ? 0.35 - (pulse - 0.65) * 0.22 : 0.08;
    }

    if (planeRef.current) {
      planeRef.current.rotation.x = MathUtils.lerp(
        planeRef.current.rotation.x,
        -0.14 + velocity * 0.03,
        0.04,
      );
      planeRef.current.rotation.y = MathUtils.lerp(
        planeRef.current.rotation.y,
        -0.28,
        0.05,
      );
    }

    if (streakRef.current) {
      streakRef.current.position.y = 1.8 - (((state.clock.elapsedTime * 1.6 + progress) % 1) * 3.6);
      const material = streakRef.current.material as MeshBasicMaterial;
      material.opacity = 0.28 + progress * 0.2;
    }
  });

  return (
    <>
      <ambientLight intensity={0.6} color="#dbeafe" />
      <pointLight position={[0, 2, 3]} intensity={18} color="#00FFD1" />
      <pointLight position={[0, -1, 1]} intensity={blockTriggered ? 15 : 4} color="#FF3366" />

      <Float speed={1.1} rotationIntensity={0.25} floatIntensity={0.4}>
        <mesh ref={planeRef}>
          <planeGeometry args={[5.6, 3.5, 1, 1]} />
          <meshPhysicalMaterial
            color="#0b1320"
            transparent
            opacity={0.48}
            transmission={0.72}
            roughness={0.08}
            metalness={0.08}
            thickness={1.1}
          />
        </mesh>
      </Float>

      <mesh ref={ringRef} position={[0, 0, 0.12]} scale={[0.2, 0.2, 1]}>
        <ringGeometry args={[0.35, 0.55, 64]} />
        <meshBasicMaterial color="#FF3366" transparent opacity={0.08} />
      </mesh>

      <mesh ref={streakRef} position={[0, 1.8, 0.18]}>
        <planeGeometry args={[5.2, 0.04]} />
        <meshBasicMaterial color="#00FFD1" transparent opacity={0.16} />
      </mesh>

      <group position={[0, 0, 0.14]}>
        {Array.from({ length: 6 }).map((_, index) => (
          <mesh
            key={`line-${index}`}
            position={[0, lerp(-1.2, 1.2, index / 5), 0]}
          >
            <planeGeometry args={[4.8, 0.01]} />
            <meshBasicMaterial color="#0f766e" transparent opacity={0.16} />
          </mesh>
        ))}
      </group>
    </>
  );
}

function VaultScene({ progress, velocity }: VaultSceneProps) {
  const cubesRef = useRef<Mesh[]>([]);
  const [hovered, setHovered] = useState<number | null>(null);

  const cubes = useMemo(
    () =>
      Array.from({ length: 16 }, (_, index) => ({
        baseX: -12 + index * 1.7,
        label:
          index % 3 === 0
            ? "SHA-256 Verified"
            : index % 3 === 1
              ? "EU AI Act Linked"
              : "Human Override: True",
      })),
    [],
  );

  useFrame((state) => {
    const offset = progress * 10 + state.clock.elapsedTime * (0.35 + velocity * 0.12);

    cubes.forEach((cube, index) => {
      const mesh = cubesRef.current[index];
      if (!mesh) return;

      const wrapped = ((cube.baseX - offset + 16) % 28) - 14;
      mesh.position.x = wrapped;
      mesh.position.y = Math.sin(state.clock.elapsedTime * 0.65 + index * 0.4) * 0.08;
      const isHovered = hovered === index;
      const targetScale = isHovered ? 1.55 : 1;
      mesh.scale.lerp(new Vector3(targetScale, targetScale, targetScale), 0.12);
      mesh.rotation.y = MathUtils.lerp(
        mesh.rotation.y,
        isHovered ? 0 : state.clock.elapsedTime * 0.08,
        0.1,
      );
      const material = mesh.material as MeshPhysicalMaterial;
      material.emissiveIntensity = isHovered ? 0.85 : 0.35;
    });
  });

  return (
    <>
      <color attach="background" args={["#050505"]} />
      <ambientLight intensity={0.5} color="#e0f2fe" />
      <pointLight position={[0, 2, 4]} intensity={16} color="#00FFD1" />

      <Line
        points={[
          [-14, 0, 0],
          [14, 0, 0],
        ]}
        color="#00FFD1"
        lineWidth={2.4}
      />

      <Line
        points={[
          [-14, 0.16, 0],
          [14, 0.16, 0],
        ]}
        color="#7dd3fc"
        lineWidth={0.8}
      />

      <Line
        points={[
          [-14, -1.4, -1.4],
          [14, -1.4, -1.4],
        ]}
        color="#00FA9A"
        lineWidth={1.2}
      />

      <group>
        {cubes.map((cube, index) => (
          <mesh
            key={`vault-cube-${index}`}
            ref={(node) => {
              if (node) cubesRef.current[index] = node;
            }}
            position={[cube.baseX, 0, 0]}
            onPointerOver={() => setHovered(index)}
            onPointerOut={() => setHovered((current) => (current === index ? null : current))}
          >
            <boxGeometry args={[1.22, 1.22, 1.22]} />
            <meshPhysicalMaterial
              color="#d1fae5"
              emissive="#00FFD1"
              emissiveIntensity={0.55}
              transmission={0.84}
              roughness={0.08}
              thickness={1}
              transparent
              opacity={0.82}
            />
            {hovered === index ? (
              <Html center transform distanceFactor={8.5}>
                <div className="rounded-2xl border border-white/10 bg-[#050505]/90 px-4 py-3 text-center font-mono text-[11px] uppercase tracking-[0.24em] text-[#00FFD1] shadow-[0_0_30px_rgba(0,255,209,0.2)]">
                  {cube.label}
                </div>
              </Html>
            ) : null}
          </mesh>
        ))}
      </group>

      <group position={[0, -1.4, -1.4]}>
        {cubes.map((cube, index) => (
          <mesh
            key={`vault-backfill-${index}`}
            position={[cube.baseX * 0.95, 0, 0]}
            scale={[0.78, 0.78, 0.78]}
          >
            <boxGeometry args={[1.22, 1.22, 1.22]} />
            <meshPhysicalMaterial
              color="#93c5fd"
              emissive="#00FA9A"
              emissiveIntensity={0.28}
              transmission={0.74}
              roughness={0.1}
              thickness={0.8}
              transparent
              opacity={0.36}
            />
          </mesh>
        ))}
      </group>
    </>
  );
}

function GlobeScene({ progress, velocity, pointCount }: GlobeSceneProps) {
  const groupRef = useRef<Group>(null);

  const points = useMemo(() => {
    const data: number[] = [];
    for (let i = 0; i < pointCount; i += 1) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = 2.2 + (Math.random() - 0.5) * 0.05;
      data.push(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.sin(phi) * Math.sin(theta),
        radius * Math.cos(phi),
      );
    }
    return new Float32Array(data);
  }, [pointCount]);

  const nodes = useMemo(
    () => [
      new Vector3(1.8, 0.4, 1.1),
      new Vector3(-1.5, 1.2, 0.8),
      new Vector3(1.1, -1.4, 1.2),
      new Vector3(-0.6, -1.8, -1.1),
      new Vector3(0.4, 1.7, -1.3),
      new Vector3(2.05, -0.1, -0.95),
      new Vector3(-1.95, 0.15, -0.7),
    ],
    [],
  );

  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * (0.14 + velocity * 0.08);
      groupRef.current.rotation.x = MathUtils.lerp(
        groupRef.current.rotation.x,
        0.28,
        0.04,
      );
    }

    state.camera.position.z = MathUtils.lerp(
      state.camera.position.z,
      lerp(8.2, 3.2, clamp(progress, 0, 1)),
      0.08,
    );
    state.camera.lookAt(0, 0, 0);
  });

  return (
    <>
      <color attach="background" args={["#050505"]} />
      <ambientLight intensity={0.35} />
      <pointLight position={[0, 3, 6]} intensity={16} color="#00FFD1" />
      <pointLight position={[-3, -2, -4]} intensity={8} color="#00FA9A" />

      <group ref={groupRef}>
        <Points positions={points} stride={3} frustumCulled={false}>
          <PointMaterial
            transparent
            size={0.04}
            sizeAttenuation
            depthWrite={false}
            color="#7dd3fc"
            opacity={0.92}
          />
        </Points>

        <mesh>
          <sphereGeometry args={[0.18, 24, 24]} />
          <meshBasicMaterial color="#00FFD1" />
        </mesh>

        <mesh scale={[1.02, 1.02, 1.02]}>
          <sphereGeometry args={[0.24, 24, 24]} />
          <meshBasicMaterial color="#00FFD1" transparent opacity={0.18} />
        </mesh>

        {nodes.map((node, index) => (
          <group key={`node-${index}`}>
            <Line
              points={[
                [0, 0, 0],
                [node.x, node.y, node.z],
              ]}
              color="#00FFD1"
              lineWidth={1.5}
            />
            <mesh position={node}>
              <sphereGeometry args={[0.1, 18, 18]} />
              <meshBasicMaterial color={index % 2 === 0 ? "#00FFD1" : "#00FA9A"} />
            </mesh>
          </group>
        ))}

        {[
          0,
          0.52,
          1.04,
        ].map((rotation, index) => (
          <mesh
            key={`orbit-ring-${index}`}
            rotation={[Math.PI / 2 + rotation * 0.14, rotation, 0]}
            scale={1 + index * 0.12}
          >
            <torusGeometry args={[2.28 + index * 0.1, 0.007, 12, 160]} />
            <meshBasicMaterial
              color={index === 0 ? "#00FFD1" : "#7dd3fc"}
              transparent
              opacity={index === 0 ? 0.28 : 0.14}
            />
          </mesh>
        ))}

        {nodes.map((node, index) => (
          <mesh key={`pulse-${index}`} position={node} scale={[1.8, 1.8, 1.8]}>
            <sphereGeometry args={[0.05, 12, 12]} />
            <meshBasicMaterial color="#00FFD1" transparent opacity={0.22} />
          </mesh>
        ))}

        <Line
          points={[
            [nodes[0].x, nodes[0].y, nodes[0].z],
            [nodes[2].x, nodes[2].y, nodes[2].z],
            [nodes[4].x, nodes[4].y, nodes[4].z],
            [nodes[6].x, nodes[6].y, nodes[6].z],
          ]}
          color="#00FA9A"
          lineWidth={1}
        />

        <Line
          points={[
            [nodes[1].x, nodes[1].y, nodes[1].z],
            [nodes[3].x, nodes[3].y, nodes[3].z],
            [nodes[5].x, nodes[5].y, nodes[5].z],
          ]}
          color="#7dd3fc"
          lineWidth={1}
        />
      </group>
    </>
  );
}

function MagneticButton({ href, children }: MagneticButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [, navigate] = useLocation();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 220, damping: 18 });
  const springY = useSpring(y, { stiffness: 220, damping: 18 });

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distance = Math.hypot(event.clientX - centerX, event.clientY - centerY);
      const radius = 140;

      if (distance < radius) {
        x.set((event.clientX - centerX) * 0.22);
        y.set((event.clientY - centerY) * 0.22);
      } else {
        x.set(0);
        y.set(0);
      }
    };

    const handleLeave = () => {
      x.set(0);
      y.set(0);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseleave", handleLeave);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseleave", handleLeave);
    };
  }, [x, y]);

  return (
    <div className="relative inline-flex items-center justify-center">
      <div className="absolute inset-0 rounded-full bg-[#00FFD1] opacity-20 blur-[100px]" />
      <motion.button
        ref={buttonRef}
        type="button"
        style={{ x: springX, y: springY }}
        whileTap={{ scale: 0.98 }}
        className="relative inline-flex items-center justify-center rounded-full bg-[#00FFD1] px-12 py-6 text-xl font-bold text-black shadow-[0_0_40px_rgba(0,255,209,0.38)]"
        onClick={() => navigate(href)}
      >
        {children}
      </motion.button>
    </div>
  );
}

function GlareCard({ title, copy, accent, icon: Icon, outcome, metric }: GlareCardProps) {
  const [glare, setGlare] = useState({ x: 50, y: 50 });

  return (
    <motion.div
      className={`group relative min-h-[clamp(16.5rem,24vw,20rem)] overflow-hidden rounded-[28px] p-[clamp(1.1rem,1.6vw,2rem)] ${glassClass}`}
      whileHover={{ scale: 1.02, rotateX: 2, rotateY: 2 }}
      onMouseMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setGlare({
          x: ((event.clientX - rect.left) / rect.width) * 100,
          y: ((event.clientY - rect.top) / rect.height) * 100,
        });
      }}
      style={{ transformStyle: "preserve-3d" }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, ${accent}33 0%, transparent 42%)`,
        }}
      />
      <div className="relative flex h-full flex-col justify-between">
        <div className="space-y-[clamp(0.9rem,1.1vw,1.25rem)]">
          <div className="flex items-start justify-between gap-3">
            <div
              className="inline-flex h-[clamp(2.8rem,3.5vw,3.5rem)] w-[clamp(2.8rem,3.5vw,3.5rem)] items-center justify-center rounded-2xl border border-white/10"
              style={{ backgroundColor: `${accent}14` }}
            >
              <Icon className="h-[clamp(1.15rem,1.5vw,1.5rem)] w-[clamp(1.15rem,1.5vw,1.5rem)]" style={{ color: accent }} />
            </div>
            <div
              className="rounded-full border px-[clamp(0.55rem,0.7vw,0.75rem)] py-[clamp(0.4rem,0.55vw,0.55rem)] font-mono text-[10px] uppercase tracking-[0.16em] sm:text-[11px]"
              style={{
                borderColor: `${accent}55`,
                color: accent,
                backgroundColor: `${accent}14`,
              }}
            >
              {metric}
            </div>
          </div>
          <div>
            <h3 className="text-[clamp(1.55rem,2.2vw,2rem)] font-bold text-white">{title}</h3>
            <p className="mt-3 max-w-[30ch] text-[clamp(0.95rem,1.05vw,1rem)] leading-[1.85] text-slate-400">
              {copy}
            </p>
          </div>
        </div>
        <div className="mt-5 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 sm:text-[11px]">
          {outcome}
        </div>
      </div>
    </motion.div>
  );
}

function ProofArchitectureSection() {
  const [activeNode, setActiveNode] = useState(FLOW_NODES[1].id);
  const [tourStep, setTourStep] = useState(0);

  return (
    <SectionShell id="how-it-works" className="bg-[#050505] px-[clamp(1.25rem,4vw,2rem)] py-[clamp(4rem,8vw,4.75rem)] lg:px-[clamp(2rem,6vw,6rem)]">
      <div className="mx-auto max-w-[1500px] space-y-10">
        <div className="grid gap-10 lg:grid-cols-[0.98fr_1.02fr]">
          <div className="space-y-8">
            <div className="max-w-3xl">
              <SectionLabel tone="cyan">Three operating pillars</SectionLabel>
              <h2 className="text-[clamp(2.25rem,5vw,3rem)] font-bold tracking-tight text-white">
                One control system. Three enterprise outcomes.
              </h2>
              <p className="mt-5 max-w-2xl text-[clamp(1rem,1.6vw,1.125rem)] leading-8 text-slate-400">
                The platform is organized intentionally: runtime policy contains the
                model, incident operations contain the breach, and cryptographic
                evidence contains the audit story.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-3">
              {PILLARS.map((pillar, index) => {
                const Icon = pillar.icon;
                const accent =
                  index === 0 ? "#00FFD1" : index === 1 ? "#f59e0b" : "#a78bfa";
                return (
                  <div
                    key={pillar.id}
                    className={`rounded-[28px] border-l-2 p-6 ${glassClass}`}
                    style={{ borderLeftColor: accent }}
                  >
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-[#00FFD1]">
                      <Icon className="h-5 w-5" style={{ color: accent }} />
                    </div>
                    <h3 className="mt-5 text-2xl font-bold text-white">{pillar.title}</h3>
                    <p className="mt-4 text-sm leading-7 text-slate-400">{pillar.body}</p>
                    <div className="mt-5 font-mono text-[11px] uppercase tracking-[0.22em]" style={{ color: accent }}>
                      {pillar.metric}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-6">
            <div className={`rounded-[32px] p-[clamp(1.5rem,3vw,2rem)] ${glassClass}`}>
              <SectionLabel tone="cyan">2-minute interactive tour</SectionLabel>
              <h3 className="max-w-xl text-[clamp(1.5rem,3vw,2rem)] font-bold leading-tight text-white">
                Feel the product before you talk to sales.
              </h3>
              <p className="mt-4 max-w-xl text-sm leading-7 text-slate-400">
                Click through one concrete workflow and watch the control plane go
                from preflight detection to incident escalation to sealed evidence.
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                {TOUR_STEPS.map((step, index) => (
                  <button
                    key={step.title}
                    type="button"
                    onClick={() => setTourStep(index)}
                    className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition-colors ${
                      tourStep === index
                        ? "bg-[#00FFD1] text-black"
                        : "border border-white/10 bg-white/[0.02] text-slate-300"
                    }`}
                  >
                    {step.title}
                  </button>
                ))}
              </div>

              <div className="mt-6 rounded-[24px] border border-white/[0.08] bg-black/30 p-5">
                <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#00FFD1]">
                  {TOUR_STEPS[tourStep].status}
                </div>
                <p className="mt-4 text-base leading-8 text-slate-300">
                  {TOUR_STEPS[tourStep].body}
                </p>
              </div>
            </div>

            <div className={`max-w-full overflow-hidden rounded-[32px] p-[clamp(1.4rem,2.5vw,1.75rem)] ${glassClass}`}>
              <SectionLabel tone="emerald">Audit-ready by design</SectionLabel>
              <h3 className="max-w-[22rem] text-[clamp(1.45rem,2.8vw,2rem)] font-bold leading-tight text-white">
                Framework linkage should be visible before procurement asks for it.
              </h3>
              <div className="mt-6 flex flex-wrap gap-3">
                {FRAMEWORK_BADGES.map((badge) => (
                  <SmartLink
                    key={badge}
                    href="#frameworks"
                    className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.22em] text-slate-300 transition-colors hover:border-[#00FFD1]/40 hover:text-[#00FFD1]"
                  >
                    {badge}
                  </SmartLink>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className={`rounded-[32px] p-[clamp(1.4rem,2.5vw,1.75rem)] ${glassClass}`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <SectionLabel tone="emerald">Control flow map</SectionLabel>
              <h3 className="text-[clamp(1.45rem,2.8vw,2rem)] font-bold text-white">
                User to evidence vault, left to right.
              </h3>
            </div>
            <SmartLink
              href="#frameworks"
              className="w-fit rounded-full border border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300 transition-colors hover:border-[#00FFD1]/40 hover:text-[#00FFD1]"
            >
              Audit frameworks
            </SmartLink>
          </div>

          <div className="mt-8 grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
            {FLOW_NODES.map((node, index) => (
              <div key={node.id} className="contents">
                <motion.button
                  type="button"
                  onMouseEnter={() => setActiveNode(node.id)}
                  onFocus={() => setActiveNode(node.id)}
                  whileHover={{ y: -4 }}
                  className={`h-full min-h-[168px] rounded-[24px] border px-6 py-6 text-left transition-all ${
                    node.id === "gateway"
                      ? "border-[#00FFD1]/35 bg-[#00FFD1]/[0.04]"
                      : activeNode === node.id
                      ? "border-[#00FFD1]/40 bg-white/[0.05]"
                      : "border-white/[0.08] bg-white/[0.02]"
                  }`}
                >
                  <div
                    className="font-mono text-[11px] uppercase tracking-[0.22em]"
                    style={{ color: node.color }}
                  >
                    {node.title}
                  </div>
                  <p className="mt-3 max-w-[28ch] text-base leading-8 text-slate-400">
                    {node.detail}
                  </p>
                </motion.button>
                {index < FLOW_NODES.length - 1 ? (
                  <div className="hidden items-center justify-center xl:flex">
                    <div className="relative flex items-center justify-center">
                      <div className="h-[2px] w-16 bg-gradient-to-r from-[#00FFD1]/20 via-[#00FFD1]/60 to-[#00FA9A]/60" />
                      <motion.span
                        className="absolute right-0 text-[#00FFD1]"
                        animate={{ x: [-6, 2, -6], opacity: [0.35, 1, 0.35] }}
                        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                      >
                        <ArrowRight className="h-4 w-4" />
                      </motion.span>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </SectionShell>
  );
}

function BuildVerifySection() {
  return (
    <SectionShell className="bg-[#050505] px-[clamp(1.25rem,4vw,2rem)] py-[clamp(4rem,8vw,4.75rem)] lg:px-[clamp(2rem,6vw,6rem)]">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-10 max-w-3xl">
          <SectionLabel tone="cyan">Build and verify</SectionLabel>
          <h2 className="text-[clamp(2.25rem,5vw,3rem)] font-bold tracking-tight text-white">
            Docs, trust posture, and role-specific paths in one ecosystem.
          </h2>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="grid gap-6 md:grid-cols-2">
            {BUILD_VERIFY_CARDS.map((card) => (
              <SmartLink
                key={card.title}
                href={card.href}
                className={`group rounded-[28px] p-7 transition-transform hover:-translate-y-1 ${glassClass}`}
              >
                <div
                  className="font-mono text-[11px] uppercase tracking-[0.22em]"
                  style={{ color: card.accent }}
                >
                  {card.title}
                </div>
                <p className="mt-4 text-sm leading-7 text-slate-400">{card.body}</p>
                <div className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-white">
                  Open
                  <ArrowRight className="h-4 w-4" />
                </div>
              </SmartLink>
            ))}
          </div>

          <div className={`rounded-[32px] p-7 ${glassClass}`}>
            <SectionLabel tone="emerald">Role paths</SectionLabel>
            <div className="grid gap-4 md:grid-cols-3">
              {ROLE_CTA_CARDS.map((card) => (
                <SmartLink
                  key={card.title}
                  href={card.href}
                  className="rounded-[24px] border border-white/[0.08] bg-black/20 p-5 transition-colors hover:border-[#00FFD1]/30"
                >
                  <div className="text-lg font-bold text-white">{card.title}</div>
                  <p className="mt-3 text-sm leading-7 text-slate-400">{card.body}</p>
                </SmartLink>
              ))}
            </div>
          </div>
        </div>
      </div>
    </SectionShell>
  );
}

function HeroSection({ velocity, isMobile, copy }: { velocity: number; isMobile: boolean; copy: LandingCopy }) {
  const badges = copy.badges ?? {};
  const sectionRef = useRef<HTMLElement>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [progress, setProgress] = useState(0);
  const [railMode, setRailMode] = useState<"inline_gateway" | "sdk_guard">(
    "inline_gateway",
  );
  const [railPolicy, setRailPolicy] = useState<
    "claims_prod" | "underwriting_eu" | "portfolio_rollup"
  >("claims_prod");
  const { scrollY } = useScroll();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });

  const headlineY = useTransform(scrollY, [0, 500], [0, -120]);
  const headlineOpacity = useTransform(scrollY, [0, 260, 520], [1, 1, 0]);

  const pseudoLogs = useMemo(() => {
    const policyLabel =
      railPolicy === "claims_prod"
        ? "finance.claims.prod"
        : railPolicy === "underwriting_eu"
          ? "insurance.underwriting.eu"
          : "portfolio.rollup.global";

    if (railPolicy === "claims_prod") {
      return [
        `mode=${railMode}`,
        `policy=${policyLabel}`,
        "prompt classified: contains_sensitive_request",
        "preflight action: block + escalate",
        "receipt: sealed for incident review",
      ];
    }

    if (railPolicy === "underwriting_eu") {
      return [
        `mode=${railMode}`,
        `policy=${policyLabel}`,
        "model route: approved underwriting copilot",
        "framework linkage: eu_ai_act + iso_42001",
        "receipt: archived for audit query",
      ];
    }

    return [
      `mode=${railMode}`,
      `policy=${policyLabel}`,
      "tenant context: 50 portcos normalized",
      "runtime alerts: 3 incidents routed",
      "roll-up: board view refreshed",
    ];
  }, [railMode, railPolicy]);

  useMotionValueEvent(scrollYProgress, "change", setProgress);

  return (
    <SectionShell id="top" className="min-h-screen">
      <section
        ref={sectionRef}
        className="relative overflow-hidden bg-[#050505] px-8 pb-12 pt-24 lg:px-16"
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setPointer({
            x: ((event.clientX - rect.left) / rect.width - 0.5) * 2,
            y: ((event.clientY - rect.top) / rect.height - 0.5) * -2,
          });
        }}
      >
        <SceneCanvas
          label="hero control plane"
          isMobile={isMobile}
          camera={{ position: [0, 0, 9.5], fov: 42 }}
          className="pointer-events-none absolute inset-0"
        >
            <HeroScene progress={progress} velocity={velocity} pointer={pointer} />
        </SceneCanvas>

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,255,209,0.1),transparent_34%),radial-gradient(circle_at_center,rgba(0,255,180,0.04),transparent_24%),radial-gradient(circle_at_80%_20%,rgba(255,51,102,0.06),transparent_22%),linear-gradient(180deg,rgba(5,5,5,0.3),rgba(5,5,5,0.88))]" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.11] [background-image:radial-gradient(rgba(125,211,252,0.9)_0.8px,transparent_0.8px)] [background-size:24px_24px]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-[radial-gradient(circle_at_bottom,rgba(0,255,209,0.18),transparent_45%)]" />
        <div className="pointer-events-none absolute left-1/2 top-[38%] hidden h-[20rem] w-[20rem] -translate-x-1/2 -translate-y-1/2 opacity-70 lg:block">
          <motion.div
            className="absolute inset-0 rounded-full border border-[#00FFD1]/20"
            animate={{ scale: [0.86, 1.04, 0.86], opacity: [0.18, 0.38, 0.18] }}
            transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute inset-[20%] rounded-full border border-[#7dd3fc]/20"
            animate={{ scale: [0.92, 1.1, 0.92], opacity: [0.12, 0.3, 0.12] }}
            transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,255,209,0.16),transparent_28%),radial-gradient(circle_at_center,rgba(125,211,252,0.08),transparent_44%)]" />
          {[
            "left-[15%] top-[42%]",
            "left-[42%] top-[16%]",
            "right-[18%] top-[38%]",
            "left-[36%] bottom-[18%]",
          ].map((pos, index) => (
            <motion.span
              key={`hero-node-${index}`}
              className={`absolute h-2.5 w-2.5 rounded-full bg-[#00FFD1] shadow-[0_0_20px_rgba(0,255,209,0.75)] ${pos}`}
              animate={{ scale: [0.9, 1.4, 0.9], opacity: [0.45, 1, 0.45] }}
              transition={{ duration: 2 + index * 0.45, repeat: Infinity, ease: "easeInOut" }}
            />
          ))}
          <div className="absolute left-[18%] top-[44%] h-px w-[25%] rotate-[-16deg] bg-gradient-to-r from-transparent via-[#00FFD1]/60 to-transparent" />
          <div className="absolute left-[44%] top-[20%] h-px w-[18%] rotate-[36deg] bg-gradient-to-r from-transparent via-[#7dd3fc]/50 to-transparent" />
          <div className="absolute left-[41%] top-[54%] h-px w-[22%] rotate-[14deg] bg-gradient-to-r from-transparent via-[#00FA9A]/45 to-transparent" />
        </div>

        <motion.div
          style={{ y: headlineY, opacity: headlineOpacity }}
          className="relative z-10 mx-auto grid min-h-[calc(100svh-5.5rem)] w-full max-w-[1500px] items-center gap-8 pt-4 md:grid-cols-[minmax(0,1fr)_minmax(260px,340px)] md:gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] lg:gap-10 xl:grid-cols-[minmax(0,1.02fr)_minmax(360px,420px)] xl:gap-14"
        >
          <div className="max-w-3xl pt-4 text-center md:text-left xl:pt-8">
            <div className={`mb-6 inline-flex items-center gap-3 rounded-full px-5 py-2 ${glassClass}`}>
              <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-[#00FFD1]">
                {badges.heroRibbon ?? "Runtime policy • incident operations • cryptographic evidence"}
              </span>
            </div>

            <h1 className="max-w-4xl text-[clamp(3rem,7vw,6.2rem)] font-extrabold leading-[0.92] tracking-tight text-white">
              {copy.title}
            </h1>
            <p className="mt-5 max-w-2xl text-[clamp(1rem,1.8vw,1.125rem)] font-light leading-8 text-slate-400">
              {copy.description}
            </p>
            <p className="mt-4 max-w-2xl text-sm font-medium uppercase tracking-[0.22em] text-slate-500">
              {badges.heroAudience ?? "For PE funds and regulated enterprises that cannot afford AI guesswork."}
            </p>

            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row md:items-start">
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <SmartLink
                  href="/book-demo"
                  className="inline-flex items-center gap-3 rounded-full bg-[#00FFD1] px-8 py-4 text-lg font-semibold text-black shadow-[0_0_30px_rgba(0,255,209,0.4)]"
                >
                  {badges.bookDemo ?? "Book a Demo"}
                  <ArrowRight className="h-5 w-5" />
                </SmartLink>
              </motion.div>
              <motion.a
                href="#engine"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex items-center gap-3 rounded-full border border-white/10 px-8 py-4 text-lg font-semibold text-white"
              >
                {badges.heroSecondaryCta ?? "Inspect the enforcement engine"}
              </motion.a>
            </div>

            <div className="mt-5">
              <SmartLink
                href="#vault"
                className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#00FFD1] transition-colors hover:text-white"
              >
                {badges.heroEvidenceCta ?? "See the evidence chain"}
              </SmartLink>
            </div>
          </div>

          <div className="relative mx-auto grid w-full max-w-[clamp(16rem,30vw,24rem)] gap-4 md:ml-auto md:pt-2 lg:pt-6 xl:max-w-[26rem] xl:pt-10">
            <div className="justify-self-start rounded-[24px] border border-white/[0.08] bg-white/[0.04] p-4 backdrop-blur-xl md:w-[13rem] lg:w-64">
              <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-[#00FA9A]">
                {badges.runtimeSeal ?? "Runtime seal"}
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-400">
                {badges.runtimeSealBody ?? "Prompt, output, decision, and incident linkage sealed before release."}
              </p>
            </div>

            <div className="justify-self-end rounded-[24px] border border-white/[0.08] bg-white/[0.04] p-4 backdrop-blur-xl md:w-full lg:w-[22rem]">
              <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-[#00FFD1]">
                {badges.liveCommandRail ?? "Live command rail"}
              </div>
              <div className="mt-4 grid gap-3">
                <div>
                  <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    Mode
                  </div>
                  <div className="flex gap-2">
                    {(["inline_gateway", "sdk_guard"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setRailMode(mode)}
                        className={`rounded-full px-3 py-2 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors ${
                          railMode === mode
                            ? "bg-[#00FFD1] text-black"
                            : "border border-white/10 bg-black/20 text-slate-300"
                        }`}
                      >
                        {mode.replace("_", " ")}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    Policy
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { id: "claims_prod", label: "claims" },
                      { id: "underwriting_eu", label: "underwriting" },
                      { id: "portfolio_rollup", label: "portfolio" },
                    ] as const).map((policy) => (
                      <button
                        key={policy.id}
                        type="button"
                        onClick={() => setRailPolicy(policy.id)}
                        className={`rounded-full px-3 py-2 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors ${
                          railPolicy === policy.id
                            ? "bg-[#00FA9A] text-black"
                            : "border border-white/10 bg-black/20 text-slate-300"
                        }`}
                      >
                        {policy.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-[20px] border border-white/[0.08] bg-black/25 p-4">
                  <div className="space-y-2 font-mono text-sm text-slate-300">
                    {pseudoLogs.map((line, index) => (
                      <div key={line} className={index === pseudoLogs.length - 2 ? "text-[#FF3366]" : ""}>
                        {line}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="relative z-10 mx-auto w-full max-w-[1500px] space-y-4 pb-14">
          <div className="grid gap-4 md:grid-cols-3">
            {HERO_OUTCOMES.map((item) => (
              <div key={item.title} className={`rounded-[26px] p-5 text-left ${glassClass}`}>
                <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-[#00FFD1]">
                  {item.metric}
                </div>
                <p className="mt-3 text-base leading-7 text-slate-200">{item.title}</p>
              </div>
            ))}
          </div>

          <div className={`rounded-[28px] p-4 ${glassClass}`}>
            <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {PROOF_STRIP.map((item) => (
                  <div key={item.label} className="rounded-[22px] border border-white/[0.08] bg-black/20 px-4 py-4 text-left">
                    <div className="text-4xl font-bold tracking-tight text-white">{item.value}</div>
                    <div className="mt-3 font-mono text-[11px] uppercase tracking-[0.22em] text-[#00FFD1]">
                      {item.label}
                    </div>
                    <div className="mt-3 text-sm leading-6 text-slate-400">{item.detail}</div>
                  </div>
                ))}
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                {OPERATOR_QUOTES.map((quote) => (
                  <div key={quote.by} className="rounded-[22px] border border-white/[0.08] bg-black/20 px-5 py-4 text-left">
                    <p className="max-w-full text-sm leading-7 text-slate-300">“{quote.quote}”</p>
                    <div className="mt-3 font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                      — {quote.by}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={`grid gap-4 rounded-[28px] p-4 ${glassClass} lg:grid-cols-3`}>
            {HERO_SIGNAL_CARDS.map((item) => (
              <div key={item.label} className="rounded-[22px] border border-white/[0.08] bg-black/20 px-5 py-4 text-left">
                <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-[#00FFD1]">
                  {item.label}
                </div>
                <div className="mt-2 text-sm font-medium text-slate-200">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </SectionShell>
  );
}

function ProblemSection({ velocity, isMobile }: { velocity: number; isMobile: boolean }) {
  const sectionRef = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  useMotionValueEvent(scrollYProgress, "change", setProgress);

  return (
    <SectionShell id="product" className="min-h-[92vh] bg-[#050505] px-[clamp(1.25rem,4vw,2rem)] py-[clamp(3.5rem,7vw,4.5rem)] lg:px-[clamp(2rem,6vw,6rem)]">
      <section
        ref={sectionRef}
        className="grid min-h-[100vh] grid-cols-1 items-center gap-[clamp(2rem,4vw,3.5rem)] md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]"
      >
        <motion.div
          style={{ y: lerp(0, -60, clamp(progress, 0, 1)) }}
          className="relative z-10 mx-auto w-full max-w-[42rem] md:mx-0 md:max-w-[34rem] xl:max-w-xl"
        >
          <SectionLabel tone="red">The shadow AI problem</SectionLabel>
          <h2 className="text-[clamp(2.1rem,4.8vw,3rem)] font-bold tracking-tight text-white">
            A claims adjuster asks for an SSN. Legacy controls notice after the fact.
          </h2>
          <p className="mt-6 text-[clamp(1rem,1.6vw,1.125rem)] leading-8 text-slate-400">
            In a real workflow, the risk is not an abstract “silent exposure”.
            It is one employee prompt, one unsafe model route, and one response
            that should never leave production. The difference is whether the
            system blocks it before the model runs or logs it after impact.
          </p>
          <div className="mt-10 grid gap-4">
            <div className={`rounded-[28px] p-6 ${glassClass}`}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex min-h-[clamp(13.5rem,24vw,15rem)] flex-col rounded-[22px] border border-[#FF3366]/20 bg-[#FF3366]/8 p-5">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#FF3366]/20 bg-[#FF3366]/10 text-[#FF3366]">
                      <TriangleAlert className="h-5 w-5" />
                    </span>
                    <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-[#FF3366]">
                      Before: ungoverned
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-slate-300">
                    An adjuster asks the assistant to include policyholder identity
                    data. The provider call goes out and security learns about it later.
                  </p>
                </div>
                <div className="flex min-h-[clamp(13.5rem,24vw,15rem)] flex-col rounded-[22px] border border-[#00FA9A]/20 bg-[#00FA9A]/8 p-5">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#00FA9A]/20 bg-[#00FA9A]/10 text-[#00FA9A]">
                      <Shield className="h-5 w-5" />
                    </span>
                    <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-[#00FA9A]">
                      After: governed
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-slate-300">
                    The inline gateway blocks the prompt in under 250ms, opens an
                    incident, assigns owners, and writes a receipt auditors can query later.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="relative mx-auto h-[clamp(24rem,54vw,38.75rem)] w-full max-w-[56rem] overflow-hidden rounded-[32px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] shadow-[0_0_80px_rgba(0,255,209,0.08)] md:mx-0 md:max-w-none">
          <SceneCanvas
            label="shadow traffic scene"
            isMobile={isMobile}
            camera={{ position: [0, 0, 8.6], fov: 42 }}
          >
            <ProblemScene
              progress={progress}
              velocity={velocity}
              particleCount={isMobile ? 40 : 120}
            />
          </SceneCanvas>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,51,102,0.2),transparent_28%),radial-gradient(circle_at_75%_55%,rgba(0,255,209,0.16),transparent_34%)]" />
          <div className="pointer-events-none absolute left-6 top-6 rounded-full border border-[#FF3366]/30 bg-[#FF3366]/10 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.24em] text-[#FF3366]">
            Shadow traffic ingress
          </div>
          <div className="pointer-events-none absolute bottom-6 right-6 rounded-full border border-[#00FA9A]/30 bg-[#00FA9A]/10 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.24em] text-[#00FA9A]">
            Gateway shield online
          </div>
          <div className="pointer-events-none absolute left-6 bottom-6 hidden w-72 rounded-[24px] border border-white/[0.08] bg-black/30 p-4 backdrop-blur-xl md:block">
            <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-[#FF3366]">
              Prompt stream anomaly
            </div>
            <div className="mt-3 space-y-2 font-mono text-xs text-slate-300">
              <div>vector: exfiltration + shadow route</div>
              <div>source: unmanaged business unit agent</div>
              <div className="text-[#00FA9A]">shield result: cleansed + re-routed</div>
            </div>
          </div>
          <div className="pointer-events-none absolute right-6 top-20 hidden w-60 rounded-[24px] border border-white/[0.08] bg-black/30 p-4 backdrop-blur-xl md:block">
            <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-[#00FFD1]">
              Gateway telemetry
            </div>
            <div className="mt-3 text-sm leading-7 text-slate-400">
              Runtime adapter, gateway label, and policy scope bound before downstream execution.
            </div>
          </div>
        </div>
      </section>
    </SectionShell>
  );
}

function EnforcementSection({ velocity, isMobile }: { velocity: number; isMobile: boolean }) {
  const sectionRef = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  useMotionValueEvent(scrollYProgress, "change", setProgress);

  const activeIndex = progress < 0.34 ? 0 : progress < 0.67 ? 1 : 2;
  const visibleCode = useMemo(() => {
    const full = [
      "const policy = runtime.bind(system, tenant);",
      "if (prompt.contains(PII) || prompt.contains(restrictedIntent)) {",
      "  AI_Control_Tower.block();",
      "  incident.escalate('privacy.security');",
      "} else {",
      "  gateway.forward(providerRoute);",
      "}",
    ].join("\n");
    const length = clamp(Math.floor(full.length * (0.2 + progress * 1.25)), 0, full.length);
    return full.slice(0, length);
  }, [progress]);

  const blockTriggered = visibleCode.includes("block()");
  const runtimeSignals =
    activeIndex === 0
      ? [
          { label: "Phase", value: "Preflight inspection", tone: "#00FFD1" },
          { label: "Policy", value: "Restricted intent scan", tone: "#7dd3fc" },
          { label: "Incident", value: "Standby", tone: "#94A3B8" },
          { label: "Receipt", value: "Pending seal", tone: "#94A3B8" },
        ]
      : activeIndex === 1
      ? [
          { label: "Phase", value: "Tool route control", tone: "#00FFD1" },
          { label: "Policy", value: "Default-deny enforced", tone: "#00FA9A" },
          { label: "Incident", value: "Watch enabled", tone: "#f59e0b" },
          { label: "Receipt", value: "Queued", tone: "#94A3B8" },
        ]
      : [
          { label: "Phase", value: "Escalation commit", tone: "#00FFD1" },
          { label: "Policy", value: "Execution frozen", tone: "#FF3366" },
          { label: "Incident", value: "Opened + assigned", tone: "#00FA9A" },
          { label: "Receipt", value: "Sealed immediately", tone: "#7dd3fc" },
        ];

  return (
    <SectionShell id="engine" className="relative h-[120vh] bg-[#050505] md:h-[126vh] xl:h-[132vh]">
      <section
        ref={sectionRef}
        className="sticky top-[clamp(4.75rem,8vw,5.5rem)] flex h-[calc(100svh-clamp(4.75rem,8vw,5.5rem))] items-start px-[clamp(1.25rem,4vw,2rem)] lg:px-[clamp(2rem,6vw,6rem)] xl:items-center"
      >
        <div className="grid w-full grid-cols-1 items-start gap-[clamp(1rem,2.5vw,3.25rem)] py-[clamp(0.75rem,1.8vw,2rem)] md:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] xl:grid-cols-[0.92fr_1.08fr] xl:items-center xl:py-[clamp(2rem,5vw,3rem)]">
          <div className="relative z-10 mx-auto w-full max-w-[42rem] md:mx-0 md:max-w-[30rem] xl:max-w-xl">
            <SectionLabel tone="emerald">Enforcement engine</SectionLabel>
            <div className="relative space-y-[clamp(0.7rem,1.25vw,1.25rem)]">
              {ENGINE_STEPS.map((step, index) => {
                const distance = Math.abs(index - activeIndex);
                const opacity = distance === 0 ? 1 : distance === 1 ? 0.74 : 0.56;
                const translate = distance === 0 ? 0 : distance === 1 ? 8 : 12;
                const scale = distance === 0 ? 1 : distance === 1 ? 0.985 : 0.97;
                const stageLabel =
                  distance === 0 ? "active lane" : distance === 1 ? "monitoring" : "armed";
                const surfaceClass =
                  distance === 0
                    ? "border border-[#00FFD1]/18 bg-[linear-gradient(180deg,rgba(0,255,209,0.08),rgba(255,255,255,0.03))] shadow-[0_0_44px_rgba(0,255,209,0.06)]"
                    : distance === 1
                    ? "border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.02))]"
                    : "border border-white/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0.012))]";

                return (
                  <div key={step.label} className="relative pl-11 md:pl-12 xl:pl-14">
                    {index < ENGINE_STEPS.length - 1 ? (
                      <div className="pointer-events-none absolute left-[15px] top-8 bottom-[-16px] w-px bg-gradient-to-b from-[#00FFD1]/55 via-white/10 to-transparent md:left-[15px] md:bottom-[-18px] xl:left-[17px] xl:top-9 xl:bottom-[-24px]" />
                    ) : null}
                    <motion.span
                      animate={{ opacity, y: translate, scale }}
                      transition={{ duration: 0.35, ease: "easeOut" }}
                      className={`absolute left-0 top-2.5 flex h-8 w-8 items-center justify-center rounded-full border font-mono text-[10px] uppercase tracking-[0.16em] md:h-8 md:w-8 xl:top-3 xl:h-9 xl:w-9 ${
                        distance === 0
                          ? "border-[#00FFD1]/45 bg-[#00FFD1]/12 text-[#00FFD1] shadow-[0_0_24px_rgba(0,255,209,0.2)]"
                          : "border-white/[0.12] bg-white/[0.03] text-slate-400"
                      }`}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </motion.span>
                    <motion.div
                      animate={{ opacity, y: translate, scale }}
                      transition={{ duration: 0.35, ease: "easeOut" }}
                      className={`relative min-h-[clamp(7.75rem,12.5vw,13.125rem)] overflow-hidden rounded-[26px] px-5 py-4 md:rounded-[28px] md:px-5 md:py-4 xl:rounded-[30px] xl:px-7 xl:py-6 ${surfaceClass}`}
                    >
                      {distance === 0 ? (
                        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#00FFD1]/70 to-transparent" />
                      ) : null}
                      <div className="flex items-start justify-between gap-4">
                        <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-[#00FFD1]">
                          {step.label}
                        </div>
                        <div className={`rounded-full px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] md:px-3 md:text-[10px] md:tracking-[0.18em] ${
                          distance === 0
                            ? "border border-[#00FFD1]/25 bg-[#00FFD1]/10 text-[#00FFD1]"
                            : "border border-white/[0.08] bg-white/[0.03] text-slate-400"
                        }`}>
                          {stageLabel}
                        </div>
                      </div>
                      <h3 className={`mt-3 text-[clamp(1.45rem,2.2vw,2.2rem)] font-bold leading-[0.98] ${
                        distance === 0 ? "text-white" : "text-white/90"
                      }`}>
                        {step.title}
                      </h3>
                      <p className={`mt-2.5 text-[clamp(0.88rem,0.98vw,1rem)] leading-[1.65] md:leading-[1.7] xl:mt-3 xl:leading-8 ${
                        distance === 0 ? "text-slate-300" : "text-slate-400"
                      }`}>
                        {step.body}
                      </p>
                    </motion.div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="relative z-10 mx-auto h-[clamp(26rem,50vw,35rem)] w-full max-w-[56rem] md:mx-0 md:max-w-none">
            <div
              className="absolute inset-0 overflow-hidden rounded-[38px] border border-[#00FFD1]/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.016))] shadow-[0_0_88px_rgba(0,255,209,0.07)] backdrop-blur-xl"
              style={{
                transform: "perspective(1600px) rotateY(-8deg) rotateX(2deg)",
              }}
            >
              <SceneCanvas
                label="policy terminal"
                isMobile={isMobile}
                camera={{ position: [0, 0, 5], fov: 42 }}
                className="absolute inset-0"
                rootMargin="-5% 0px -5% 0px"
              >
                  <TerminalScene
                    progress={progress}
                    velocity={velocity}
                    blockTriggered={blockTriggered}
                  />
              </SceneCanvas>
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(0,255,209,0.1),transparent_18%),radial-gradient(circle_at_82%_24%,rgba(255,51,102,0.07),transparent_20%),linear-gradient(180deg,rgba(255,255,255,0.04),transparent_24%)]" />

              <div className="relative z-10 flex h-full flex-col">
                <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
                  <div className="flex items-center gap-2">
                    {["#FF3366", "#f59e0b", "#00FFD1"].map((color) => (
                      <span
                        key={color}
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-slate-400">
                    policy_as_code.runtime.ts
                  </div>
                </div>
                <div className="flex-1 p-8 font-mono text-sm leading-8 text-slate-300">
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <div className="rounded-full border border-[#00FA9A]/25 bg-[#00FA9A]/10 px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-[#00FA9A]">
                      Inline gateway
                    </div>
                    <div className="rounded-full border border-[#00FFD1]/25 bg-[#00FFD1]/10 px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-[#00FFD1]">
                      SDK guard
                    </div>
                  </div>
                  <div className="mb-5 grid gap-3 md:grid-cols-2">
                    {runtimeSignals.map((signal) => (
                      <div
                        key={signal.label}
                        className="rounded-[16px] border border-white/[0.08] bg-black/25 px-4 py-3"
                      >
                        <div
                          className="font-mono text-[10px] uppercase tracking-[0.2em]"
                          style={{ color: signal.tone }}
                        >
                          {signal.label}
                        </div>
                        <div className="mt-2 text-sm text-slate-200">{signal.value}</div>
                      </div>
                    ))}
                  </div>
                  <pre className="overflow-hidden whitespace-pre-wrap text-[15px] text-slate-200">
                    {visibleCode}
                    <motion.span
                      animate={{ opacity: [0, 1, 0] }}
                      transition={{ duration: 1.1, repeat: Infinity }}
                      className="ml-1 inline-block h-5 w-[2px] bg-[#00FFD1] align-middle"
                    />
                  </pre>
                </div>
                <div className="grid grid-cols-[1fr_auto] border-t border-white/10 px-6 py-5 font-mono text-[11px] uppercase tracking-[0.24em] text-slate-400">
                  <span>Decision latency: &lt;250 ms</span>
                  <span className="justify-self-end pl-4 text-right text-[10px] text-[#FF3366]">
                    {blockTriggered ? "block shockwave emitted" : "preflight armed"}
                  </span>
                </div>
              </div>
            </div>
            <div className="pointer-events-none absolute bottom-5 left-6 w-[18.5rem] rounded-[20px] border border-white/[0.1] bg-black/58 px-4 py-4 shadow-[0_0_28px_rgba(0,0,0,0.3)] backdrop-blur-xl">
              <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-[#00FFD1]">
                Policy outcome
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 font-mono text-xs text-slate-300">
                <div>pii: blocked inline</div>
                <div>tools: deny by default</div>
                <div>critical: incident opened</div>
                <div className="text-[#00FA9A]">receipt: sealed immediately</div>
              </div>
            </div>
            <div className="pointer-events-none absolute right-5 top-5 hidden w-[21rem] rounded-[24px] border border-white/[0.1] bg-black/48 px-5 py-5 shadow-[0_0_36px_rgba(0,0,0,0.35)] backdrop-blur-xl xl:block">
              <div className="flex items-center justify-between gap-4">
                <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-[#00FA9A]">
                  Auto-escalation path
                </div>
                <div className="rounded-full border border-[#FF3366]/30 bg-[#FF3366]/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[#FF3366]">
                  no manual triage gap
                </div>
              </div>
              <div className="relative mt-5 space-y-4">
                {ESCALATION_FLOW.map((step, index) => (
                  <div key={step.label} className="relative pl-9">
                    {index < ESCALATION_FLOW.length - 1 ? (
                      <div className="absolute left-[10px] top-6 h-10 w-px bg-gradient-to-b from-white/0 via-[#00FFD1]/60 to-white/0" />
                    ) : null}
                    <span
                      className="absolute left-0 top-1 h-5 w-5 rounded-full border"
                      style={{
                        borderColor: `${step.tone}66`,
                        backgroundColor: `${step.tone}22`,
                        boxShadow: `0 0 24px ${step.tone}55`,
                      }}
                    />
                    <div className="font-mono text-[11px] uppercase tracking-[0.22em]" style={{ color: step.tone }}>
                      {step.label}
                    </div>
                    <div className="mt-1 text-sm text-slate-300">{step.detail}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </SectionShell>
  );
}

function VaultSection({ velocity, isMobile }: { velocity: number; isMobile: boolean }) {
  const sectionRef = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  useMotionValueEvent(scrollYProgress, "change", setProgress);

  return (
    <SectionShell id="vault" className="bg-[#050505] px-[clamp(1.25rem,4vw,2rem)] py-[clamp(3.75rem,7vw,4.5rem)] lg:px-[clamp(2rem,6vw,6rem)]">
      <section ref={sectionRef} className="mx-auto max-w-[1500px] overflow-hidden">
        <div className="mx-auto max-w-4xl text-center">
          <SectionLabel tone="cyan">Verifiable trust vault</SectionLabel>
          <h2 className="text-[clamp(2.2rem,5vw,3rem)] font-bold tracking-tight text-white">
            Every decision cryptographically sealed.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-[clamp(1rem,1.6vw,1.125rem)] leading-8 text-slate-400">
            Runtime evidence is not a screenshot or spreadsheet artifact. It is
            hash-linked, reviewable, and ready for LP due diligence, security
            review, and regulatory challenge.
          </p>
        </div>

        <div className="relative mt-14 h-[clamp(20rem,36vw,24.5rem)] overflow-hidden rounded-[34px] border border-white/[0.08] bg-white/[0.02] shadow-[0_0_72px_rgba(0,255,209,0.08)]">
          <SceneCanvas
            label="evidence vault"
            isMobile={isMobile}
            camera={{ position: [0, 0, 7], fov: 38 }}
          >
            <VaultScene progress={progress} velocity={velocity} />
          </SceneCanvas>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(0,255,209,0.18),transparent_26%),linear-gradient(180deg,rgba(5,5,5,0.06),rgba(5,5,5,0.55))]" />
          <div className="pointer-events-none absolute left-6 top-6 rounded-full border border-[#00FFD1]/30 bg-[#00FFD1]/10 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.24em] text-[#00FFD1]">
            SHA-256 chain
          </div>
          <div className="pointer-events-none absolute bottom-6 right-6 rounded-full border border-[#00FA9A]/30 bg-[#00FA9A]/10 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.24em] text-[#00FA9A]">
            Diligence ready evidence
          </div>
          <div
            className="pointer-events-none absolute right-4 top-4 hidden w-[18rem] rounded-[22px] border border-white/[0.08] bg-black/30 p-4 backdrop-blur-xl md:block lg:right-6 lg:top-6 lg:w-72"
            style={{ transform: "scale(clamp(0.82, 0.9vw, 1))", transformOrigin: "top right" }}
          >
            <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-[#00FFD1]">
              Evidence payload
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 font-mono text-xs text-slate-300">
              <div>prompt: validated</div>
              <div>output: reviewed</div>
              <div>override: logged</div>
              <div>framework: eu_ai_act</div>
            </div>
          </div>
          <div
            className="pointer-events-none absolute inset-x-3 top-1/2 hidden md:block lg:inset-x-6"
            style={{ transform: "translateY(-50%) scale(clamp(0.72, 0.95vw, 1))", transformOrigin: "center" }}
          >
            <div className="absolute left-[16.5%] right-[16.5%] top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-[#00FFD1]/55 to-transparent" />
            <div className="relative grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 lg:gap-4">
              {VAULT_RECEIPTS.map((receipt) => (
                <div key={receipt.hash} className="contents">
                  <div className="min-w-0 rounded-[22px] border border-white/[0.08] bg-black/35 px-4 py-4 backdrop-blur-xl">
                    <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#00FFD1]">
                      {receipt.hash}
                    </div>
                    <div className="mt-3 text-sm font-medium text-slate-200">{receipt.tag}</div>
                    <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
                      {receipt.time}
                    </div>
                  </div>
                  {receipt.hash !== VAULT_RECEIPTS[VAULT_RECEIPTS.length - 1].hash ? (
                    <div className="flex items-center justify-center">
                      <div className="relative h-px w-12 bg-gradient-to-r from-[#00FFD1]/20 via-[#00FFD1]/70 to-[#00FA9A]/60">
                        <ArrowRight className="absolute -right-1 -top-[7px] h-4 w-4 text-[#00FFD1]" />
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </SectionShell>
  );
}

function BentoSection() {
  return (
    <SectionShell id="solutions" className="bg-[#050505] px-[clamp(1.25rem,4vw,2rem)] py-[clamp(4rem,8vw,4.75rem)] lg:px-[clamp(2rem,6vw,6rem)]">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-14 max-w-3xl">
          <SectionLabel tone="emerald">Runtime enforcement</SectionLabel>
          <h2 className="text-[clamp(2.25rem,5vw,3rem)] font-bold tracking-tight text-white">
            Concrete outcomes, not just feature lists.
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-[clamp(0.9rem,1.5vw,1.5rem)] sm:grid-cols-2 xl:grid-cols-3">
          {BENTO_CARDS.map((card) => (
            <GlareCard key={card.title} {...card} />
          ))}
        </div>
      </div>
    </SectionShell>
  );
}

function PortfolioSection({ velocity, isMobile }: { velocity: number; isMobile: boolean }) {
  const sectionRef = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  useMotionValueEvent(scrollYProgress, "change", setProgress);

  return (
    <SectionShell id="frameworks" className="relative h-[92vh] bg-[#050505]">
      <section ref={sectionRef} className="relative flex h-[92vh] items-center justify-center overflow-hidden px-[clamp(1.25rem,4vw,2rem)] lg:px-[clamp(2rem,6vw,6rem)]">
        <SceneCanvas
          label="portfolio network"
          isMobile={isMobile}
          camera={{ position: [0, 0, 8.2], fov: 42 }}
          className="absolute inset-0"
        >
          <GlobeScene
            progress={progress}
            velocity={velocity}
            pointCount={isMobile ? 400 : 1100}
          />
        </SceneCanvas>

        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,255,209,0.1),transparent_35%),linear-gradient(180deg,rgba(5,5,5,0.3),rgba(5,5,5,0.82))]" />
        <div className="pointer-events-none absolute inset-0 hidden lg:block">
          <div className="absolute left-[22%] top-[32%] h-px w-[28%] rotate-[9deg] bg-gradient-to-r from-transparent via-[#00FFD1]/65 to-transparent" />
          <div className="absolute left-[52%] top-[31%] h-px w-[22%] -rotate-[10deg] bg-gradient-to-r from-transparent via-[#00FFD1]/65 to-transparent" />
          <div className="absolute left-[24%] top-[62%] h-px w-[24%] -rotate-[18deg] bg-gradient-to-r from-transparent via-[#00FA9A]/55 to-transparent" />
          <div className="absolute left-[55%] top-[64%] h-px w-[21%] rotate-[18deg] bg-gradient-to-r from-transparent via-[#7dd3fc]/55 to-transparent" />
        </div>

        <div className="relative z-20 mx-auto w-full max-w-[1500px] px-4">
          <div className="mx-auto max-w-4xl px-[clamp(1.25rem,3vw,2rem)] py-[clamp(1.5rem,3vw,2.5rem)] text-center">
            <SectionLabel tone="cyan">Portfolio-scale roll-up</SectionLabel>
            <h2 className="text-[clamp(2.25rem,5vw,3.75rem)] font-bold tracking-tight text-transparent [text-shadow:0_0_26px_rgba(255,255,255,0.08)] [-webkit-text-stroke:1.5px_rgba(255,255,255,0.94)]">
              Built for multi-org private equity. Manage 50 portfolio companies from one control plane.
            </h2>
            <div className="mt-5 hidden justify-center lg:flex">
              <div className="rounded-[20px] border border-[#00FFD1]/25 bg-black/35 px-5 py-3 text-center backdrop-blur-xl shadow-[0_0_32px_rgba(0,255,209,0.1)]">
                <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-[#00FFD1]">
                  Control plane
                </div>
                <div className="mt-2 text-sm font-medium text-slate-200">
                  policy, incidents, evidence
                </div>
              </div>
            </div>
            <p className="mx-auto mt-6 max-w-3xl text-[clamp(1rem,1.6vw,1.125rem)] leading-8 text-slate-300 [text-shadow:0_0_18px_rgba(0,0,0,0.55)]">
              Standardize runtime governance centrally, preserve tenant isolation
              locally, and inspect the complete AI operating posture across the
              investment perimeter.
            </p>
          </div>
        </div>

        {PORTFOLIO_COMPANIES.map((company) => (
          <div
            key={company.name}
            className={`pointer-events-none absolute z-30 hidden w-64 rounded-[24px] border border-white/[0.08] bg-black/40 p-4 shadow-[0_0_32px_rgba(0,0,0,0.35)] backdrop-blur-xl xl:block ${company.className}`}
          >
            <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-[#00FFD1]">
              Portfolio node
            </div>
            <div className="mt-3 text-sm font-medium text-slate-100">{company.name}</div>
            <div className="mt-2 text-sm leading-7 text-slate-400">{company.detail}</div>
          </div>
        ))}
      </section>
    </SectionShell>
  );
}

function FinalCTASection({ copy }: { copy: LandingCopy }) {
  const badges = copy.badges ?? {};
  return (
    <SectionShell id="cta" className="bg-[#020202] px-[clamp(1.25rem,4vw,2rem)] py-[clamp(4rem,8vw,4.75rem)] lg:px-[clamp(2rem,6vw,6rem)]">
      <div className="relative flex min-h-[56vh] flex-col items-center justify-center overflow-hidden text-center">
        <div className="pointer-events-none absolute inset-0 hidden lg:block">
          <div className="absolute left-1/2 top-12 h-px w-[32rem] -translate-x-[78%] rotate-[18deg] bg-gradient-to-r from-transparent via-[#00FFD1]/70 to-transparent" />
          <div className="absolute left-1/2 top-12 h-px w-[32rem] -translate-x-[22%] -rotate-[18deg] bg-gradient-to-r from-transparent via-[#00FFD1]/70 to-transparent" />
          <div className="absolute left-1/2 top-20 h-px w-[22rem] -translate-x-1/2 bg-gradient-to-r from-transparent via-[#00FA9A]/60 to-transparent" />
          <div className="absolute left-1/2 top-28 h-32 w-32 -translate-x-1/2 rounded-full bg-[#00FFD1]/10 blur-[90px]" />
        </div>
        <SectionLabel tone="emerald">Enterprise activation</SectionLabel>
        <h2 className="max-w-4xl text-[clamp(2.4rem,5.5vw,3rem)] font-extrabold tracking-tight text-white">
          Bring your AI systems into one control tower.
        </h2>
        <p className="mt-6 max-w-2xl text-[clamp(1rem,1.6vw,1.125rem)] leading-8 text-slate-400">
          Bring runtime policy, incident response, cryptographic evidence, and
          portfolio oversight into one institutional-grade operating layer.
        </p>
        <div className="mt-12" id="pricing">
          <MagneticButton href="/book-demo">
            {badges.enterpriseDemoCta ?? "Book an Enterprise Demo"}
          </MagneticButton>
        </div>
      </div>
    </SectionShell>
  );
}

function Footer({ copy }: { copy: LandingCopy }) {
  const badges = copy.badges ?? {};
  const footerColumns = [
    {
      title: badges.footerProduct ?? "Product",
      links: [
        { label: "Runtime", href: "#solutions" },
        { label: "Incidents", href: "#solutions" },
        { label: "Evidence", href: "#vault" },
        { label: "Portfolio", href: "#frameworks" },
      ],
    },
    {
      title: badges.footerSecurity ?? "Security",
      links: [
        { label: "Inline gateway", href: "#engine" },
        { label: "SDK guard", href: "#engine" },
        { label: badges.trustCenterNav ?? "Trust Center", href: "/trust-center" },
        { label: "API Docs", href: "/api-docs" },
      ],
    },
    {
      title: badges.footerLegal ?? "Legal",
      links: [
        { label: "EU AI Act", href: "#frameworks" },
        { label: "NIST AI RMF", href: "#frameworks" },
        { label: "ISO 42001", href: "#frameworks" },
        { label: "Due diligence", href: "#vault" },
      ],
    },
    {
      title: badges.footerContact ?? "Contact",
      links: [
        { label: badges.enterpriseDemos ?? "Enterprise demos", href: "/book-demo" },
        { label: badges.securityReviews ?? "Security reviews", href: "/trust-center" },
        { label: "Private equity", href: "/start-pilot" },
        { label: badges.support ?? "Support", href: "/auth/login" },
      ],
    },
  ];
  return (
    <footer className="border-t border-white/10 bg-[#050505] px-[clamp(1.25rem,4vw,2rem)] pb-8 pt-[clamp(3.5rem,7vw,4rem)] lg:px-[clamp(2rem,6vw,6rem)]" id="footer">
      <div className="mx-auto grid max-w-[1500px] grid-cols-1 gap-10 md:grid-cols-2 xl:grid-cols-5">
        <div className="xl:col-span-1">
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 rounded-full bg-[#00FFD1] shadow-[0_0_24px_rgba(0,255,209,0.9)]" />
            <span className="text-lg font-bold tracking-[0.28em] text-white">
              AI CONTROL TOWER
            </span>
          </div>
          <p className="mt-4 max-w-xs text-sm leading-7 text-slate-500">
            {badges.footerDescription ?? "Institutional-grade AI runtime governance for private equity, regulated operators, and high-consequence enterprise workflows."}
          </p>
        </div>

        {footerColumns.map((column) => (
          <div key={column.title}>
            <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-white">
              {column.title}
            </h3>
            <ul className="mt-4 space-y-3">
              {column.links.map((link) => (
                <li key={link.label}>
                  <SmartLink href={link.href} className="text-sm text-slate-500 transition-colors hover:text-[#00FFD1]">
                    {link.label}
                  </SmartLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mx-auto mt-12 flex max-w-[1500px] flex-col gap-4 border-t border-white/10 pt-6 text-xs uppercase tracking-[0.22em] text-slate-600 md:flex-row md:items-center md:justify-between">
        <span>{badges.footerStrip ?? "Runtime policy • incident operations • cryptographic evidence"}</span>
        <span>© 2026 AI Control Tower</span>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  const pageCopy = usePageCopy();
  const landingCopy = pageCopy.landing;
  const { scrollY } = useScroll();
  const velocity = useVelocity(scrollY);
  const isMobile = useIsMobile();
  const smoothedVelocity = useSpring(velocity, {
    damping: 28,
    stiffness: 180,
    mass: 0.35,
  });
  const [velocityState, setVelocityState] = useState(0);

  useMotionValueEvent(smoothedVelocity, "change", (latest) => {
    setVelocityState(clamp(Math.abs(latest) / 1800, 0, 1.4));
  });

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <Navbar copy={landingCopy} />

      <main className="bg-[#050505]">
        <HeroSection velocity={velocityState} isMobile={isMobile} copy={landingCopy} />
        <ProofArchitectureSection />
        <ProblemSection velocity={velocityState} isMobile={isMobile} />
        <EnforcementSection velocity={velocityState} isMobile={isMobile} />
        <VaultSection velocity={velocityState} isMobile={isMobile} />
        <BentoSection />
        <PortfolioSection velocity={velocityState} isMobile={isMobile} />
        <BuildVerifySection />
        <FinalCTASection copy={landingCopy} />
      </main>

      <Footer copy={landingCopy} />
    </div>
  );
}
