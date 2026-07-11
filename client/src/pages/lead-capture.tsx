import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trackMarketingEvent, readAttribution } from "@/lib/marketing";
import { resolveApiUrl } from "@/lib/api-url";
import { captureCsrfTokenFromResponse } from "@/lib/queryClient";
import { PublicSiteHeader } from "@/components/public-site-header";
import { SectionKicker } from "@/components/acturus-public-shell";
import { usePageCopy } from "@/lib/page-copy";

type LeadFormData = {
  name: string;
  workEmail: string;
  company: string;
  role: string;
  teamSize: string;
  primaryChallenge: string;
};

type LeadCapturePageProps = {
  formType: "book_demo" | "start_pilot";
  copyKey: "bookDemo" | "startPilot";
};

const defaultFormData: LeadFormData = {
  name: "",
  workEmail: "",
  company: "",
  role: "",
  teamSize: "",
  primaryChallenge: "",
};

function LeadCapturePage({ formType, copyKey }: LeadCapturePageProps) {
  const [, navigate] = useLocation();
  const pageCopy = usePageCopy();
  const page = pageCopy[copyKey];
  const badges = page.badges ?? {};
  const [form, setForm] = useState<LeadFormData>(defaultFormData);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const attribution = useMemo(() => {
    const current = readAttribution(window.location.search);
    return {
      source: current.source,
      campaign: current.campaign,
      ctaSource: current.cta ?? `${formType}_page`,
    };
  }, [formType]);

  useEffect(() => {
    void trackMarketingEvent("page_view", {
      section: "lead_capture",
      cta: formType,
      source: attribution.source,
      campaign: attribution.campaign,
    });
  }, [attribution.campaign, attribution.source, formType]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    void trackMarketingEvent("form_submit", {
      section: "lead_capture",
      cta: formType,
      source: attribution.source,
      campaign: attribution.campaign,
    });

    try {
      const res = await fetch(resolveApiUrl("/api/leads"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...form,
          formType,
          source: attribution.source,
          campaign: attribution.campaign,
          ctaSource: attribution.ctaSource,
        }),
      });
      captureCsrfTokenFromResponse(res);

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.message || badges.submitFailed || "Failed to submit form");
      }

      void trackMarketingEvent("form_success", {
        section: "lead_capture",
        cta: formType,
        source: attribution.source,
        campaign: attribution.campaign,
      });

      const query = new URLSearchParams({
        flow: formType,
        source: attribution.source,
      });
      if (attribution.campaign) {
        query.set("campaign", attribution.campaign);
      }
      navigate(`/thank-you?${query.toString()}`);
    } catch (submitErr: any) {
      setError(submitErr.message || badges.submitFailed || "Submission failed");
      void trackMarketingEvent("form_error", {
        section: "lead_capture",
        cta: formType,
        source: attribution.source,
        campaign: attribution.campaign,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#edf4ff] text-[#07101f]" data-public-theme="grid">
      <PublicSiteHeader renderSkipTarget={false} />
      <main
        id="public-main-content"
        tabIndex={-1}
        className="mx-auto grid w-full max-w-[1200px] gap-12 px-5 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20 lg:py-24"
      >
        <div>
          <SectionKicker dark theme="grid">ACTURUS · Private walkthrough</SectionKicker>
          <h1 className="font-acturus-display mt-8 text-4xl leading-[1.15] tracking-[-0.025em] sm:text-5xl">{page.title}</h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-[#42516a]">{page.description}</p>
          <ul className="mt-10 border-t border-[#8da5ca]/30 text-sm text-[#42516a]">
            {[
              badges.bullet1 ?? "Governance workflow walkthrough in 30 minutes",
              badges.bullet2 ?? "Use-case mapping for your AI portfolio",
              badges.bullet3 ?? "Pilot plan aligned to your risk and compliance needs",
            ].map((item, index) => (
              <li key={item} className="grid grid-cols-[36px_1fr] gap-3 border-b border-[#8da5ca]/30 py-4">
                <span className="font-mono text-[10px] text-[#356cff]">0{index + 1}</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <Card className="rounded-2xl border-[#8da5ca]/30 bg-white/80 shadow-[0_24px_70px_rgba(44,74,119,0.1)] backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="font-acturus-display text-xl tracking-[-0.01em] text-[#07101f]">{badges.ctaLabel ?? page.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={onSubmit} aria-label={badges.ctaLabel ?? page.title}>
              {[
                { id: "lead-name", label: badges.fullName ?? "Full name", type: "text", value: form.name, key: "name" as const },
                { id: "lead-email", label: badges.workEmail ?? "Work email", type: "email", value: form.workEmail, key: "workEmail" as const },
                { id: "lead-company", label: badges.company ?? "Company", type: "text", value: form.company, key: "company" as const },
                { id: "lead-role", label: badges.role ?? "Role", type: "text", value: form.role, key: "role" as const },
                { id: "lead-team-size", label: badges.teamSize ?? "Team size", type: "text", value: form.teamSize, key: "teamSize" as const },
              ].map((field) => (
                <div key={field.id}>
                  <label htmlFor={field.id} className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[#315abf]">{field.label}</label>
                  <Input
                    id={field.id}
                    required
                    type={field.type}
                    autoComplete={field.key === "name" ? "name" : field.key === "workEmail" ? "email" : field.key === "company" ? "organization" : field.key === "role" ? "organization-title" : undefined}
                    className="h-12 rounded-xl border-[#8da5ca]/40 bg-white text-[#07101f] focus-visible:ring-[#356cff]"
                    value={field.value}
                    onChange={(event) => setForm((prev) => ({ ...prev, [field.key]: event.target.value }))}
                  />
                </div>
              ))}
              <div>
                <label htmlFor="lead-challenge" className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[#315abf]">{badges.primaryChallenge ?? "Primary governance challenge"}</label>
                <textarea
                  id="lead-challenge"
                  required
                  rows={4}
                  className="w-full rounded-xl border border-[#8da5ca]/40 bg-white px-3 py-3 text-sm text-[#07101f] outline-none transition-shadow focus:ring-2 focus:ring-[#356cff]"
                  value={form.primaryChallenge}
                  onChange={(e) => setForm((prev) => ({ ...prev, primaryChallenge: e.target.value }))}
                />
              </div>

              {error ? <p className="text-sm text-destructive" role="alert" aria-live="polite">{error}</p> : null}

              <button className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[linear-gradient(135deg,#75efff,#4aaeff_58%,#8f82ff)] px-6 text-xs font-semibold uppercase tracking-[0.14em] text-[#06101e] shadow-[0_14px_34px_rgba(53,108,255,0.2)] transition duration-300 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={submitting}>
                {submitting ? badges.submitting ?? "Submitting..." : badges.ctaLabel ?? page.title}
              </button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default function BookDemoPage() {
  return (
    <LeadCapturePage
      formType="book_demo"
      copyKey="bookDemo"
    />
  );
}

export function StartPilotPage() {
  return (
    <LeadCapturePage
      formType="start_pilot"
      copyKey="startPilot"
    />
  );
}
