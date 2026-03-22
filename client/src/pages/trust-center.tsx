import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldCheck, DatabaseZap, Fingerprint, Building2, LifeBuoy, Lock } from "lucide-react";
import { Link } from "wouter";
import { PublicSiteHeader } from "@/components/public-site-header";
import { usePageCopy } from "@/lib/page-copy";

const pillars = [
  {
    title: "Tenant-safe by design",
    body: "Organization-aware auth, scoped storage, domain claims, JIT provisioning, and route-level protections keep portfolio companies isolated.",
    icon: Building2,
  },
  {
    title: "Immutable governance evidence",
    body: "Audit records now carry SHA-256 hash chaining so buyers can verify tamper-evident operational history.",
    icon: Fingerprint,
  },
  {
    title: "Decision traceability",
    body: "Context, AI output, human override, rationale, and 30/60/90-day outcome evidence can be recorded per decision.",
    icon: DatabaseZap,
  },
  {
    title: "Operational readiness",
    body: "Readiness probes, smoke checks, structured logging, queued delivery, and monitoring reduce operational blind spots.",
    icon: ShieldCheck,
  },
];

const controls = [
  "SAML and OIDC federation with org-scoped admin controls",
  "DNS-verified domain allowlisting and JIT provisioning",
  "Background jobs with retry/backoff for invite and monitoring delivery",
  "Incident playbooks for bias, privacy, security, reliability, and safety failures",
  "Public API documentation and admin audit exports",
  "Seat limits, subscription tiers, and live usage telemetry for pilot-to-paid conversion",
];

export default function TrustCenterPage() {
  const pageCopy = usePageCopy();
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#f3f7ff_0%,#ffffff_52%,#eef4f8_100%)] text-slate-950">
      <PublicSiteHeader />
      <div className="mx-auto max-w-6xl px-6 py-16 sm:px-8 lg:px-10">
        <div className="max-w-3xl space-y-4">
          <Badge variant="outline" className="rounded-full px-3 py-1 text-xs uppercase tracking-[0.2em]">{pageCopy.trustCenter.badges?.trustCenter}</Badge>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{pageCopy.trustCenter.title}</h1>
          <p className="text-base leading-7 text-slate-600">
            {pageCopy.trustCenter.description}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/security"><Button>Review security practices</Button></Link>
            <Link href="/api-docs"><Button variant="outline">Review the API</Button></Link>
          </div>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {pillars.map((pillar) => (
            <Card key={pillar.title} className="border-slate-200/80 bg-white/80 backdrop-blur">
              <CardHeader>
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white">
                  <pillar.icon className="h-4 w-4" />
                </div>
                <CardTitle className="text-base">{pillar.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-600">{pillar.body}</CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-slate-200/80 bg-white/85 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><Lock className="h-5 w-5" /> Control highlights</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-3 text-sm text-slate-700">
                {controls.map((item) => (
                  <li key={item} className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">{item}</li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 bg-slate-950 text-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><LifeBuoy className="h-5 w-5" /> Due diligence checklist</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-200">
              <p>For buyer and vendor-risk reviews, you can walk through:</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Tenant isolation model and org-scoped controls</li>
                <li>Identity federation, domain verification, and invite management</li>
                <li>Decision traceability and immutable audit chain verification</li>
                <li>Incident response handling and operational monitoring posture</li>
                <li>Subscription, deployment, and pilot-to-production controls</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
