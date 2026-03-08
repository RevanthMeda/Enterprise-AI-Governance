import { useEffect } from "react";
import { trackMarketingEvent } from "@/lib/marketing";

export default function PrivacyPage() {
  useEffect(() => {
    void trackMarketingEvent("page_view", { section: "privacy" });
  }, []);

  return (
    <div className="min-h-screen bg-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">
          We collect business contact information submitted through forms to respond to demo and pilot requests.
        </p>
        <p className="text-sm text-muted-foreground">
          Lead data is used for sales qualification, pilot onboarding, and support communications. We do not sell this data.
        </p>
        <p className="text-sm text-muted-foreground">
          Requests regarding access, correction, and deletion can be sent via the contact channel on this site.
        </p>
        <a href="/" className="text-sm text-primary hover:underline">Back to homepage</a>
      </div>
    </div>
  );
}
