import { useMemo, useState } from "react";
import { BookOpen, GraduationCap, ShieldCheck, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useWorkspaceCopy } from "@/lib/workspace-copy";

type ResourceCard = {
  title: string;
  description: string;
  href: string;
  badge: string;
};

const documentationResources: ResourceCard[] = [
  {
    title: "Product overview",
    description: "What the platform is, what it solves, and how the major capability groups fit together.",
    href: "/welcome",
    badge: "Orientation",
  },
  {
    title: "Route-by-route user guide",
    description: "Walkthrough of the authenticated product surface and how operators move through it.",
    href: "/dashboard",
    badge: "Workflow",
  },
  {
    title: "Admin operations path",
    description: "Identity, domains, invites, telemetry, retention, and integration operating routines.",
    href: "/settings?tab=identity",
    badge: "Admin",
  },
  {
    title: "Runtime governance walkthrough",
    description: "See how telemetry, incidents, critic evidence, and policy enforcement work together.",
    href: "/runtime-monitoring",
    badge: "Runtime",
  },
];

const trainingTracks = [
  {
    role: "Control Grid Administrator",
    modules: [
      { label: "Identity and tenant setup", href: "/settings?tab=identity" },
      { label: "Telemetry policy and adapter", href: "/telemetry-policy" },
      { label: "Integrations and automation", href: "/integrations" },
    ],
  },
  {
    role: "Incident Reviewer",
    modules: [
      { label: "Incident queue and assignment", href: "/incidents" },
      { label: "Runtime monitoring and critic evidence", href: "/runtime-monitoring" },
      { label: "Decision traces and audit follow-through", href: "/decision-trace" },
    ],
  },
  {
    role: "Compliance Lead",
    modules: [
      { label: "Registry and risk posture", href: "/registry" },
      { label: "Compliance management", href: "/compliance" },
      { label: "Governance maturity review", href: "/governance-maturity" },
    ],
  },
];

const certifications = [
  {
    title: "Administrator path",
    detail: "Prove tenant setup, identity configuration, telemetry policy ownership, and automation governance.",
  },
  {
    title: "Reviewer path",
    detail: "Prove incident triage, containment notes, escalation judgment, and audit-ready resolution discipline.",
  },
  {
    title: "Compliance path",
    detail: "Prove control coverage management, evidence interpretation, readiness reporting, and maturity analysis.",
  },
];

export default function KnowledgeCenterPage() {
  const copy = useWorkspaceCopy();
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();

  const filteredDocs = useMemo(
    () =>
      documentationResources.filter((resource) =>
        normalizedQuery.length === 0
          ? true
          : `${resource.title} ${resource.description} ${resource.badge}`.toLowerCase().includes(normalizedQuery),
      ),
    [normalizedQuery],
  );

  const filteredTracks = useMemo(
    () =>
      trainingTracks.filter((track) =>
        normalizedQuery.length === 0
          ? true
          : `${track.role} ${track.modules.map((module) => module.label).join(" ")}`.toLowerCase().includes(normalizedQuery),
      ),
    [normalizedQuery],
  );

  return (
    <div className="page-shell" data-testid="page-knowledge-center">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{copy.knowledge.title}</h1>
            <Badge variant="outline">{copy.labels.enablement}</Badge>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            {copy.knowledge.intro}
          </p>
        </div>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={copy.knowledge.searchPlaceholder}
          className="max-w-md"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              {copy.knowledge.docsTitle}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {filteredDocs.map((resource) => (
              <div key={resource.title} className="rounded-xl border p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold">{resource.title}</div>
                  <Badge variant="secondary">{resource.badge}</Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{resource.description}</p>
                <Button asChild size="sm" variant="outline" className="mt-3">
                  <a href={resource.href}>{copy.labels.open}</a>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <GraduationCap className="h-4 w-4 text-muted-foreground" />
              {copy.knowledge.trainingTitle}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {filteredTracks.map((track) => (
              <div key={track.role} className="rounded-xl border p-4">
                <div className="text-sm font-semibold">{track.role}</div>
                <div className="mt-3 grid gap-2">
                  {track.modules.map((module) => (
                    <a
                      key={module.label}
                      href={module.href}
                      className="rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/40"
                    >
                      {module.label}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {certifications.map((item) => (
          <Card key={item.title}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                {item.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{item.detail}</CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            {copy.knowledge.howToUseTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
            Start new admins here before asking them to configure identity or telemetry policies.
          </div>
          <div className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
            Use the role-based tracks during demos to show that the product supports operational enablement, not only controls.
          </div>
          <div className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
            Pair the certification cards with Governance Maturity when customers ask what “good” looks like in production.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
