import { useLocation, Link } from "wouter";
import {
  LayoutDashboard,
  BarChart3,
  BookOpen,
  Server,
  ShieldCheck,
  ClipboardCheck,
  FileText,
  Activity,
  Settings,
  User,
  Layers,
  UserCircle,
  CalendarDays,
  AlertTriangle,
  Fingerprint,
  Gauge,
  TrendingUp,
  KeyRound,
  Building2,
  SlidersHorizontal,
  Cable,
  Archive,
  CreditCard,
  PlugZap,
  Radio,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { getAppAccess, getDisplayRole } from "@/lib/permissions";
import { useWorkspaceCopy } from "@/lib/workspace-copy";
import { BrandMark } from "@/components/brand-mark";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AccessKey = keyof ReturnType<typeof getAppAccess>;

type NavItem = {
  key: string;
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  accessKey?: AccessKey;
};

const mainNav: NavItem[] = [
  { key: "dashboard", title: "Dashboard", url: "/", icon: LayoutDashboard },
  { key: "analytics", title: "Analytics", url: "/analytics", icon: BarChart3, accessKey: "canAccessAnalytics" },
  { key: "maturity", title: "Maturity", url: "/governance-maturity", icon: TrendingUp, accessKey: "canAccessAnalytics" },
  { key: "knowledge", title: "Knowledge", url: "/knowledge-center", icon: BookOpen },
  { key: "registry", title: "AI Registry", url: "/registry", icon: Server, accessKey: "canAccessRegistry" },
  { key: "risk", title: "Risk", url: "/risk", icon: ShieldCheck, accessKey: "canAccessRisk" },
  { key: "compliance", title: "Compliance", url: "/compliance", icon: ClipboardCheck, accessKey: "canAccessCompliance" },
  { key: "runtime", title: "Runtime", url: "/runtime-monitoring", icon: Radio, accessKey: "canAccessRuntimeMonitoring" },
  { key: "incidents", title: "Incidents", url: "/incidents", icon: AlertTriangle, accessKey: "canAccessIncidents" },
  { key: "approvals", title: "Approvals", url: "/approvals", icon: FileText, accessKey: "canAccessApprovals" },
  { key: "decisionTraces", title: "Decision Traces", url: "/decision-trace", icon: Fingerprint, accessKey: "canAccessDecisionTrace" },
  { key: "auditLog", title: "Audit Log", url: "/audit", icon: Activity, accessKey: "canAccessAuditLog" },
  { key: "myActivity", title: "My Activity", url: "/activity", icon: UserCircle },
  { key: "accountSecurity", title: "Account Security", url: "/account-security", icon: KeyRound },
  { key: "evidence", title: "Evidence", url: "/exit-readiness", icon: Gauge, accessKey: "canAccessExitReadiness" },
  { key: "portfolio", title: "Portfolio", url: "/portfolio-control", icon: Building2, accessKey: "canAccessPortfolioControl" },
  { key: "calendar", title: "Calendar", url: "/calendar", icon: CalendarDays, accessKey: "canAccessCalendar" },
  { key: "bulkControls", title: "Bulk Controls", url: "/bulk-controls", icon: Layers, accessKey: "canAccessBulkControls" },
];

const settingsNav: NavItem[] = [
  { key: "telemetryAdapter", title: "Telemetry Adapter", url: "/telemetry-adapter", icon: Cable, accessKey: "canAccessTelemetryAdapter" },
  { key: "telemetryPolicy", title: "Telemetry Policy", url: "/telemetry-policy", icon: SlidersHorizontal, accessKey: "canAccessTelemetryPolicy" },
  { key: "integrations", title: "Integrations", url: "/integrations", icon: PlugZap, accessKey: "canAccessIntegrations" },
  { key: "settings", title: "Settings", url: "/settings", icon: Settings, accessKey: "canAccessSettings" },
  { key: "retentionControl", title: "Retention Control", url: "/retention-control", icon: Archive, accessKey: "canAccessRetentionControl" },
  { key: "billing", title: "Billing", url: "/billing", icon: CreditCard, accessKey: "canAccessBilling" },
  { key: "apiDocs", title: "API Docs", url: "/api-docs", icon: FileText, accessKey: "canAccessSettings" },
];

function getPathname(location: string): string {
  return location.split(/[?#]/)[0] || "/";
}

function isNavItemActive(location: string, item: NavItem): boolean {
  const pathname = getPathname(location);

  if (item.url === "/") {
    return pathname === "/" || pathname === "/dashboard";
  }

  if (item.url === "/registry") {
    return pathname === "/registry" || pathname === "/registry/connect" || pathname.startsWith("/systems/");
  }

  return pathname === item.url;
}

export function AppSidebar() {
  const [location] = useLocation();
  const { user, isAuthTransitioning, switchOrganization, switchOrganizationMutation } = useAuth();
  const copy = useWorkspaceCopy();
  const access = getAppAccess(user);
  const displayRole = getDisplayRole(user);
  const sortedOrganizations = [...(user?.organizations ?? [])].sort((a, b) => {
    const aIsDemo = a.slug.includes("-demo");
    const bIsDemo = b.slug.includes("-demo");

    if (aIsDemo !== bIsDemo) {
      return aIsDemo ? -1 : 1;
    }

    return a.name.localeCompare(b.name);
  });
  const visibleMainNav = mainNav.filter((item) => !item.accessKey || access[item.accessKey]);
  const visibleSettingsNav = settingsNav.filter((item) => !item.accessKey || access[item.accessKey]);

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/dashboard">
          <div className="flex items-center gap-2 cursor-pointer" data-testid="link-home">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
              <BrandMark className="h-4 w-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold tracking-tight">{copy.appName}</span>
              <span className="text-[10px] text-muted-foreground leading-none">{copy.appTagline}</span>
            </div>
          </div>
        </Link>
        {user && access.canSwitchOrganizations && user.organizations.length > 1 ? (
          <div className="mt-4 space-y-2 rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {copy.labels.activeOrganization}
              </span>
              <Badge variant="outline" className="text-[10px]">
                {user.organizations.find((organization) => organization.id === user.currentOrganizationId)?.role.replace("_", " ") ?? "member"}
              </Badge>
            </div>
            <Select
              value={user.currentOrganizationId ?? ""}
              onValueChange={(value) => {
                void switchOrganization(value);
              }}
              disabled={isAuthTransitioning || switchOrganizationMutation.isPending}
            >
              <SelectTrigger data-testid="select-active-organization">
                <SelectValue placeholder="Select organization" />
              </SelectTrigger>
              <SelectContent>
                {sortedOrganizations.map((organization) => (
                  <SelectItem key={organization.id} value={organization.id}>
                    {organization.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-[11px] text-muted-foreground">
              {copy.labels.crossOrgHint}
            </div>
          </div>
        ) : null}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{copy.sections.platform}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleMainNav.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    asChild
                    data-active={isNavItemActive(location, item)}
                    className="data-[active=true]:bg-sidebar-accent"
                  >
                    <Link href={item.url} data-testid={`link-${item.key}`}>
                      <item.icon className="h-4 w-4" />
                      <span>{copy.nav[item.key as keyof typeof copy.nav] ?? item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {visibleSettingsNav.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>{copy.sections.configuration}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleSettingsNav.map((item) => (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton
                      asChild
                      data-active={isNavItemActive(location, item)}
                      className="data-[active=true]:bg-sidebar-accent"
                    >
                      <Link href={item.url} data-testid={`link-${item.key}`}>
                        <item.icon className="h-4 w-4" />
                        <span>{copy.nav[item.key as keyof typeof copy.nav] ?? item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="p-4">
        {user && (
          <div className="flex items-center gap-2 mb-2" data-testid="sidebar-user-info">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
              <User className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-medium truncate">{user.fullName}</span>
              <span className="text-[10px] text-muted-foreground capitalize">{displayRole?.replace("_", " ") ?? "member"}</span>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]" data-testid="badge-version">v2.0.0</Badge>
          <span className="text-[10px] text-muted-foreground">{copy.labels.aiActReady}</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
