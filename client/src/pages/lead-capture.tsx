import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trackMarketingEvent, readAttribution } from "@/lib/marketing";
import { resolveApiUrl } from "@/lib/api-url";
import { captureCsrfTokenFromResponse } from "@/lib/queryClient";
import { PublicSiteHeader } from "@/components/public-site-header";
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
    <div className="min-h-screen bg-background">
      <PublicSiteHeader />
      <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-2 lg:px-8">
        <div className="space-y-5">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{page.title}</h1>
          <p className="text-sm text-muted-foreground sm:text-base">{page.description}</p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>{badges.bullet1 ?? "Governance workflow walkthrough in 30 minutes"}</li>
            <li>{badges.bullet2 ?? "Use-case mapping for your AI portfolio"}</li>
            <li>{badges.bullet3 ?? "Pilot plan aligned to your risk and compliance needs"}</li>
          </ul>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{badges.ctaLabel ?? page.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSubmit}>
              <Input
                required
                placeholder={badges.fullName ?? "Full name"}
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
              <Input
                required
                type="email"
                placeholder={badges.workEmail ?? "Work email"}
                value={form.workEmail}
                onChange={(e) => setForm((prev) => ({ ...prev, workEmail: e.target.value }))}
              />
              <Input
                required
                placeholder={badges.company ?? "Company"}
                value={form.company}
                onChange={(e) => setForm((prev) => ({ ...prev, company: e.target.value }))}
              />
              <Input
                required
                placeholder={badges.role ?? "Role"}
                value={form.role}
                onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
              />
              <Input
                required
                placeholder={badges.teamSize ?? "Team size"}
                value={form.teamSize}
                onChange={(e) => setForm((prev) => ({ ...prev, teamSize: e.target.value }))}
              />
              <textarea
                required
                rows={4}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder={badges.primaryChallenge ?? "Primary governance challenge"}
                value={form.primaryChallenge}
                onChange={(e) => setForm((prev) => ({ ...prev, primaryChallenge: e.target.value }))}
              />

              {error ? <p className="text-sm text-destructive">{error}</p> : null}

              <Button className="w-full" type="submit" disabled={submitting}>
                {submitting ? badges.submitting ?? "Submitting..." : badges.ctaLabel ?? page.title}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
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
