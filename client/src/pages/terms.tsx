import { useEffect } from "react";
import { trackMarketingEvent } from "@/lib/marketing";
import { PublicSiteHeader } from "@/components/public-site-header";
import { usePageCopy } from "@/lib/page-copy";

export default function TermsPage() {
  const pageCopy = usePageCopy();
  useEffect(() => {
    void trackMarketingEvent("page_view", { section: "terms" });
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <PublicSiteHeader />
      <div className="mx-auto max-w-4xl space-y-5 px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold tracking-tight">{pageCopy.terms.title}</h1>
        <p className="text-sm text-muted-foreground">
          {pageCopy.terms.description}
        </p>
        <p className="text-sm text-muted-foreground">
          Product availability, pricing, and feature commitments are subject to signed commercial agreements.
        </p>
        <p className="text-sm text-muted-foreground">
          Unauthorized access attempts, abuse, and misuse of the service are prohibited.
        </p>
      </div>
    </div>
  );
}
