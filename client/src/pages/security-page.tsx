import { useEffect } from "react";
import { trackMarketingEvent } from "@/lib/marketing";
import { PublicSiteHeader } from "@/components/public-site-header";

export default function SecurityPage() {
  useEffect(() => {
    void trackMarketingEvent("page_view", { section: "security_page" });
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <PublicSiteHeader />
      <div className="mx-auto max-w-4xl space-y-5 px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold tracking-tight">Security Practices</h1>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>Role-based access control with deny-by-default authorization.</li>
          <li>Session hardening with secure cookies, idle timeout, and rotation.</li>
          <li>MFA support with TOTP and recovery code workflows.</li>
          <li>CSRF enforcement, security headers, and API audit logging.</li>
          <li>Dependency audit, secret scanning, and SBOM generation in CI.</li>
        </ul>
      </div>
    </div>
  );
}
