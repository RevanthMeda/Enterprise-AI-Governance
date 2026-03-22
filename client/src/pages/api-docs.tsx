import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileCode2, Shield, Layers3 } from "lucide-react";
import { PublicSiteHeader } from "@/components/public-site-header";
import { usePageCopy } from "@/lib/page-copy";

export default function ApiDocsPage() {
  const pageCopy = usePageCopy();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicSiteHeader />
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/80">Developer reference</p>
          <h1 className="text-3xl font-bold tracking-tight">{pageCopy.apiDocs.title}</h1>
          <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
            {pageCopy.apiDocs.description}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="h-4 w-4 text-primary" />
                Enterprise identity API
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p>
                SAML, OIDC, domain management, invites, org auth settings, and tenant-aware identity flows.
              </p>
              <div className="flex gap-2">
                <Button asChild size="sm">
                  <a href="/api-docs/identity.html" target="_blank" rel="noreferrer">Open Redoc</a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href="/openapi.enterprise-identity.yaml" target="_blank" rel="noreferrer">View YAML</a>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers3 className="h-4 w-4 text-primary" />
                Platform API
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p>
                Health, auth, admin, registry, controls, workflows, audit, notifications, evidence, exports, risk,
                dashboard, and marketing capture routes.
              </p>
              <div className="flex gap-2">
                <Button asChild size="sm">
                  <a href="/api-docs/platform.html" target="_blank" rel="noreferrer">Open Redoc</a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href="/openapi.platform.yaml" target="_blank" rel="noreferrer">View YAML</a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileCode2 className="h-4 w-4 text-primary" />
              Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>The identity spec is narrower and safer for external sharing.</p>
            <p>The platform spec is broader and intended for internal engineering and integration planning.</p>
            <p>Both specs are copied into the frontend build during `npm run build`.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
