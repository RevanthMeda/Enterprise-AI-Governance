import { useEffect, useMemo } from "react";
import { trackMarketingEvent } from "@/lib/marketing";
import { Button } from "@/components/ui/button";
import { PublicSiteHeader } from "@/components/public-site-header";

export default function ThankYouPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const flow = params.get("flow");
  const source = params.get("source") ?? "direct";
  const campaign = params.get("campaign");
  const calendarUrl = import.meta.env.VITE_CALENDAR_URL as string | undefined;

  useEffect(() => {
    void trackMarketingEvent("page_view", {
      section: "thank_you",
      cta: flow,
      source,
      campaign,
    });
  }, [campaign, flow, source]);

  return (
    <div className="min-h-screen bg-background">
      <PublicSiteHeader />
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-lg border bg-card p-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Thanks, your request was received.</h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          Our team will follow up shortly to schedule next steps for your {flow === "start_pilot" ? "pilot" : "demo"}.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {calendarUrl ? (
            <Button asChild>
              <a href={calendarUrl} target="_blank" rel="noreferrer">Book time now</a>
            </Button>
          ) : null}
        </div>
        </div>
      </div>
    </div>
  );
}
