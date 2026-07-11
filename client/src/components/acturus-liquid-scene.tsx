import { useId } from "react";
import { motion } from "framer-motion";
import { ActurusMark, usePublicReducedMotion } from "@/components/acturus-public-shell";

const RIBBON_A = "M -120 238 C 188 45 502 488 818 190 S 1328 390 1720 116";
const RIBBON_A_MORPH = "M -120 264 C 222 91 486 430 850 224 S 1360 340 1720 154";
const RIBBON_B = "M -150 726 C 210 462 518 858 884 596 S 1350 718 1740 474";
const RIBBON_B_MORPH = "M -150 684 C 242 520 532 804 858 550 S 1376 770 1740 506";

type LiquidBackdropProps = {
  className?: string;
  soft?: boolean;
};

export function ActurusLiquidBackdrop({ className = "", soft = false }: LiquidBackdropProps) {
  const reduceMotion = usePublicReducedMotion();
  const rawId = useId().replace(/:/g, "");
  const copper = `${rawId}-copper`;
  const lilac = `${rawId}-lilac`;
  const glow = `${rawId}-glow`;

  const ribbonMotion = reduceMotion
    ? undefined
    : {
        d: [RIBBON_A, RIBBON_A_MORPH, RIBBON_A],
      };
  const lowerRibbonMotion = reduceMotion
    ? undefined
    : {
        d: [RIBBON_B, RIBBON_B_MORPH, RIBBON_B],
      };

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      <svg
        className={`absolute inset-0 h-full w-full ${soft ? "opacity-[0.55]" : "opacity-90"}`}
        viewBox="0 0 1600 900"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <defs>
          <linearGradient id={copper} x1="-120" y1="180" x2="1690" y2="430" gradientUnits="userSpaceOnUse">
            <stop stopColor="#8A3F64" />
            <stop offset="0.29" stopColor="#F0A56F" />
            <stop offset="0.58" stopColor="#FFD8A8" />
            <stop offset="0.8" stopColor="#FF7D78" />
            <stop offset="1" stopColor="#A982D9" />
          </linearGradient>
          <linearGradient id={lilac} x1="-80" y1="640" x2="1690" y2="590" gradientUnits="userSpaceOnUse">
            <stop stopColor="#C9AAFF" />
            <stop offset="0.32" stopColor="#7C4D8D" />
            <stop offset="0.67" stopColor="#F5B781" />
            <stop offset="1" stopColor="#FF8B7E" />
          </linearGradient>
          <filter id={glow} x="-40%" y="-80%" width="180%" height="260%" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation="34" />
          </filter>
        </defs>

        <path
          className="hidden sm:block"
          d={RIBBON_A}
          stroke={`url(#${copper})`}
          strokeWidth="176"
          strokeLinecap="round"
          opacity="0.2"
          filter={`url(#${glow})`}
        />
        <motion.path
          d={RIBBON_A}
          animate={ribbonMotion}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          stroke={`url(#${copper})`}
          strokeWidth="82"
          strokeLinecap="round"
          opacity="0.82"
        />
        <motion.path
          d={RIBBON_A}
          animate={ribbonMotion}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          stroke="rgba(255,244,223,0.72)"
          strokeWidth="4"
          strokeLinecap="round"
          opacity="0.65"
        />

        <path
          className="hidden sm:block"
          d={RIBBON_B}
          stroke={`url(#${lilac})`}
          strokeWidth="148"
          strokeLinecap="round"
          opacity="0.13"
          filter={`url(#${glow})`}
        />
        <motion.path
          d={RIBBON_B}
          animate={lowerRibbonMotion}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
          stroke={`url(#${lilac})`}
          strokeWidth="54"
          strokeLinecap="round"
          opacity="0.52"
        />
      </svg>

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_52%_42%,transparent_0%,rgba(12,7,16,0.08)_38%,rgba(12,7,16,0.88)_88%)]" />
      <div className="absolute inset-0 opacity-[0.12] [background-image:radial-gradient(rgba(255,235,212,0.6)_0.7px,transparent_0.7px)] [background-size:18px_18px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
    </div>
  );
}

export function ActurusLiquidCore() {
  const reduceMotion = usePublicReducedMotion();

  return (
    <div className="relative mx-auto aspect-[0.92] w-full max-w-[510px] [perspective:1200px]" aria-hidden="true">
      <motion.div
        className="absolute inset-[8%] [transform-style:preserve-3d]"
        animate={reduceMotion ? undefined : { y: [0, -10, 0], rotateZ: [-1.5, 1.5, -1.5] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="absolute inset-0 rotate-[-12deg] rounded-[42%_58%_52%_48%/62%_42%_58%_38%] bg-[linear-gradient(145deg,rgba(255,218,176,0.94),rgba(230,126,105,0.76)_38%,rgba(137,78,156,0.75)_72%,rgba(43,25,57,0.36))] shadow-[0_38px_110px_rgba(231,123,94,0.28)]" />
        <div className="absolute inset-[8%] rotate-[8deg] rounded-[55%_45%_37%_63%/42%_54%_46%_58%] border border-white/[0.35] bg-[radial-gradient(circle_at_28%_22%,rgba(255,255,255,0.65),transparent_24%),linear-gradient(155deg,rgba(255,255,255,0.22),rgba(255,255,255,0.04)_52%,rgba(45,18,53,0.2))] shadow-[inset_-18px_-24px_50px_rgba(74,30,65,0.28),inset_16px_18px_38px_rgba(255,244,223,0.2)] backdrop-blur-xl" />
        <div className="absolute inset-[20%] flex rotate-[-3deg] items-center justify-center rounded-[44%_56%_58%_42%/60%_38%_62%_40%] border border-white/25 bg-[#160d1d]/75 text-[#FFD7AA] shadow-[0_28px_65px_rgba(28,8,29,0.46)] backdrop-blur-2xl">
          <ActurusMark className="h-[34%] w-[34%]" />
        </div>
        <div className="absolute left-[11%] top-[18%] h-[17%] w-[27%] rotate-[-22deg] rounded-[100%] bg-white/[0.45] blur-[2px]" />
      </motion.div>

      <motion.div
        className="absolute right-[1%] top-[7%] rounded-full border border-white/20 bg-white/[0.09] px-4 py-2 text-[9px] uppercase tracking-[0.2em] text-[#FFE1BD] shadow-[0_18px_50px_rgba(8,3,12,0.35)] backdrop-blur-xl"
        animate={reduceMotion ? undefined : { y: [0, 8, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      >
        Human judgement
      </motion.div>
      <motion.div
        className="absolute bottom-[11%] left-[-1%] rounded-full border border-white/20 bg-[#25152d]/[0.65] px-4 py-2 text-[9px] uppercase tracking-[0.2em] text-[#D7B8FF] shadow-[0_18px_50px_rgba(8,3,12,0.35)] backdrop-blur-xl"
        animate={reduceMotion ? undefined : { y: [0, -9, 0] }}
        transition={{ duration: 7.5, repeat: Infinity, ease: "easeInOut" }}
      >
        Accountable systems
      </motion.div>
    </div>
  );
}
