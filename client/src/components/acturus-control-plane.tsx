import { motion } from "framer-motion";
import { Check, Fingerprint, X } from "lucide-react";
import {
  ActurusMark,
  usePublicReducedMotion,
} from "@/components/acturus-public-shell";

const CONTROL_STAGES = [
  { number: "01", label: "Register" },
  { number: "02", label: "Assess" },
  { number: "03", label: "Enforce" },
  { number: "04", label: "Respond" },
  { number: "05", label: "Prove" },
] as const;

type ActurusControlPlaneProps = {
  className?: string;
};

/**
 * Product-derived hero visual for the ACTURUS public site.
 *
 * The plane intentionally uses static, rectilinear geometry. Its only motion is
 * a one-time compositor-friendly entrance transform, disabled when reduced
 * motion is requested.
 */
export function ActurusControlPlane({ className = "" }: ActurusControlPlaneProps) {
  const reduceMotion = usePublicReducedMotion();

  return (
    <motion.div
      className={`relative mx-auto aspect-[4/5] w-full max-w-[640px] sm:aspect-[5/4] ${className}`}
      initial={reduceMotion ? false : { y: 18, scale: 0.985 }}
      whileInView={reduceMotion ? undefined : { y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.35 }}
      transition={{ duration: 0.62, ease: [0.22, 0.61, 0.36, 1] }}
      role="img"
      aria-label="AI CONTROL GRID operating plane showing Register, Assess, Enforce, Respond, and Prove connected to an allow-or-block decision gate and evidence seal."
    >
      <div
        className="relative flex h-full flex-col overflow-hidden border border-black/[0.35] bg-[#101010] p-4 text-white shadow-[0_28px_80px_rgba(0,0,0,0.26)] sm:p-6"
        style={{
          clipPath:
            "polygon(0 0, calc(100% - 32px) 0, 100% 32px, 100% 100%, 32px 100%, 0 calc(100% - 32px))",
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(255,255,255,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.16)_1px,transparent_1px)] [background-size:28px_28px]"
          aria-hidden="true"
        />
        <div className="pointer-events-none absolute left-0 top-0 h-px w-24 bg-[#F58227]" aria-hidden="true" />
        <div className="pointer-events-none absolute right-0 top-8 h-px w-8 bg-[#F58227]" aria-hidden="true" />
        <div className="pointer-events-none absolute bottom-0 left-8 h-px w-24 bg-[#F58227]" aria-hidden="true" />

        <div className="relative flex items-start justify-between gap-4 border-b border-white/[0.15] pb-3">
          <div>
            <div className="font-acturus-display text-[10px] tracking-[0.14em] text-[#F6F3EE] sm:text-xs">
              ACTURUS / CONTROL PLANE
            </div>
            <div className="mt-1 text-[7px] uppercase tracking-[0.2em] text-white/[0.45] sm:text-[8px]">
              Runtime governance architecture
            </div>
          </div>
          <div className="border-l border-[#F58227]/60 pl-3 text-right font-mono text-[7px] uppercase tracking-[0.16em] text-white/[0.45] sm:text-[8px]">
            <span className="block text-[#F8A45E]">Live control</span>
            <span className="mt-1 block">ACG / 005</span>
          </div>
        </div>

        <div className="relative mt-4 sm:mt-5">
          <div className="pointer-events-none absolute left-[9%] right-[9%] top-[7px] h-px bg-white/25" aria-hidden="true" />
          <div className="relative grid grid-cols-5">
            {CONTROL_STAGES.map((stage, index) => {
              const isGate = index === 2;
              return (
                <div key={stage.number} className="min-w-0 px-0.5 text-center sm:px-1">
                  <span
                    className={`mx-auto block h-[15px] w-[15px] border ${
                      isGate
                        ? "border-[#F58227] bg-[#F58227] shadow-[inset_0_0_0_3px_#101010]"
                        : "border-white/[0.45] bg-[#101010]"
                    }`}
                    aria-hidden="true"
                  />
                  <span className={`mt-2 block truncate text-[7px] font-semibold uppercase tracking-[0.08em] sm:text-[9px] sm:tracking-[0.12em] ${isGate ? "text-[#F8A45E]" : "text-white/[0.65]"}`}>
                    {stage.label}
                  </span>
                  <span className="mt-1 block font-mono text-[6px] text-white/30 sm:text-[7px]">{stage.number}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="relative mt-4 grid min-h-0 flex-1 grid-cols-[1.08fr_0.92fr] gap-3 sm:mt-5 sm:gap-4">
          <div className="relative flex min-h-0 flex-col border border-white/[0.15] bg-black/20 p-3 sm:p-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-2 font-mono text-[7px] uppercase tracking-[0.15em] text-white/40 sm:text-[8px]">
              <span>Policy core</span>
              <span className="text-[#F8A45E]">03 / Enforce</span>
            </div>

            <div className="relative flex flex-1 items-center justify-center py-2">
              <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-white/10" aria-hidden="true" />
              <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-white/10" aria-hidden="true" />
              <div className="relative flex h-16 w-16 rotate-45 items-center justify-center border border-[#F58227]/70 bg-[#F58227]/10 sm:h-20 sm:w-20">
                <div className="-rotate-45 text-[#F8A45E]">
                  <ActurusMark className="h-9 w-9 sm:h-11 sm:w-11" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 border-t border-white/10 pt-2 text-center font-mono text-[6px] uppercase tracking-[0.12em] text-white/[0.35] sm:text-[7px]">
              <span>Policy</span>
              <span className="border-x border-white/10">Owner</span>
              <span>Context</span>
            </div>
          </div>

          <div className="relative flex min-h-0 flex-col border border-white/[0.15] bg-[#141414] p-3 sm:p-4">
            <div className="pointer-events-none absolute -left-4 top-1/2 h-px w-4 bg-[#F58227]/70" aria-hidden="true" />
            <div className="flex items-center justify-between border-b border-white/10 pb-2 font-mono text-[7px] uppercase tracking-[0.15em] text-white/40 sm:text-[8px]">
              <span>Decision gate</span>
              <span>02 paths</span>
            </div>

            <div className="mt-3 grid flex-1 grid-rows-2 gap-2 sm:mt-4 sm:gap-3">
              <div className="flex items-center justify-between border border-[#F58227]/60 bg-[#F58227]/10 px-3">
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#F8A45E] sm:text-[10px]">Allow</div>
                  <div className="mt-1 font-mono text-[6px] uppercase tracking-[0.12em] text-white/[0.35] sm:text-[7px]">Release work</div>
                </div>
                <span className="flex h-7 w-7 items-center justify-center border border-[#F58227]/70 text-[#F8A45E] sm:h-8 sm:w-8">
                  <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
                </span>
              </div>

              <div className="flex items-center justify-between border border-white/20 bg-white/[0.025] px-3">
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#F6F3EE] sm:text-[10px]">Block</div>
                  <div className="mt-1 font-mono text-[6px] uppercase tracking-[0.12em] text-white/[0.35] sm:text-[7px]">Open response</div>
                </div>
                <span className="flex h-7 w-7 items-center justify-center border border-white/25 text-white/70 sm:h-8 sm:w-8">
                  <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="relative mt-3 grid grid-cols-[auto_1fr_auto] items-center gap-3 border border-white/[0.15] bg-white/[0.025] p-2.5 sm:mt-4 sm:p-3">
          <span className="flex h-8 w-8 items-center justify-center border border-[#F58227]/60 text-[#F8A45E] sm:h-10 sm:w-10">
            <Fingerprint className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="text-[8px] font-semibold uppercase tracking-[0.16em] text-white/75 sm:text-[9px]">Evidence seal</div>
            <div className="mt-1 truncate font-mono text-[6px] uppercase tracking-[0.1em] text-white/30 sm:text-[7px]">
              Decision · policy · owner · time
            </div>
          </div>
          <div className="border-l border-white/[0.15] pl-3 text-right font-mono text-[6px] uppercase tracking-[0.12em] text-white/[0.35] sm:text-[7px]">
            <span className="block text-[#F8A45E]">Sealed</span>
            <span className="mt-1 block">05 / Prove</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
