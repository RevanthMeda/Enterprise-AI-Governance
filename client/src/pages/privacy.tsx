import { useEffect } from "react";
import { trackMarketingEvent } from "@/lib/marketing";
import { PublicSiteHeader } from "@/components/public-site-header";
import { usePageCopy } from "@/lib/page-copy";

export default function PrivacyPage() {
  const pageCopy = usePageCopy();
  useEffect(() => {
    void trackMarketingEvent("page_view", { section: "privacy" });
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <PublicSiteHeader />
      <div className="mx-auto max-w-4xl space-y-5 px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold tracking-tight">{pageCopy.privacy.title}</h1>
        <p className="text-sm text-muted-foreground">
          {pageCopy.privacy.description}
        </p>
        <p className="text-sm text-muted-foreground">
          Lead data is used for sales qualification, pilot onboarding, and support communications. We do not sell this data.
        </p>
        <p className="text-sm text-muted-foreground">
          Requests regarding access, correction, and deletion can be sent via the contact channel on this site.
        </p>
      </div>
    </div>
  );
}
