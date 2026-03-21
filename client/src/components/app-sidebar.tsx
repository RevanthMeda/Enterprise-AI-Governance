import { useLocation, Link } from "wouter";
import {
  LayoutDashboard,
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
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  accessKey?: AccessKey;
};

const mainNav: NavItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "AI Registry", url: "/registry", icon: Server, accessKey: "canAccessRegistry" },
  { title: "Risk", url: "/risk", icon: ShieldCheck, accessKey: "canAccessRisk" },
  { title: "Compliance", url: "/compliance", icon: ClipboardCheck, accessKey: "canAccessCompliance" },
  { title: "Runtime", url: "/runtime-monitoring", icon: Radio, accessKey: "canAccessRuntimeMonitoring" },
  { title: "Incidents", url: "/incidents", icon: AlertTriangle, accessKey: "canAccessIncidents" },
  { title: "Approvals", url: "/approvals", icon: FileText, accessKey: "canAccessApprovals" },
  { title: "Decision Traces", url: "/decision-trace", icon: Fingerprint, accessKey: "canAccessDecisionTrace" },
  { title: "Audit Log", url: "/audit", icon: Activity, accessKey: "canAccessAuditLog" },
  { title: "My Activity", url: "/activity", icon: UserCircle },
  { title: "Account Security", url: "/account-security", icon: KeyRound },
  { title: "Evidence", url: "/exit-readiness", icon: Gauge, accessKey: "canAccessExitReadiness" },
  { title: "Portfolio", url: "/portfolio-control", icon: Building2, accessKey: "canAccessPortfolioControl" },
  { title: "Calendar", url: "/calendar", icon: CalendarDays, accessKey: "canAccessCalendar" },
  { title: "Bulk Controls", url: "/bulk-controls", icon: Layers, accessKey: "canAccessBulkControls" },
];

const settingsNav: NavItem[] = [
  { title: "Telemetry Adapter", url: "/telemetry-adapter", icon: Cable, accessKey: "canAccessTelemetryAdapter" },
  { title: "Telemetry Policy", url: "/telemetry-policy", icon: SlidersHorizontal, accessKey: "canAccessTelemetryPolicy" },
  { title: "Integrations", url: "/integrations", icon: PlugZap, accessKey: "canAccessIntegrations" },
  { title: "Settings", url: "/settings", icon: Settings, accessKey: "canAccessSettings" },
  { title: "Retention Control", url: "/retention-control", icon: Archive, accessKey: "canAccessRetentionControl" },
  { title: "Billing", url: "/billing", icon: CreditCard, accessKey: "canAccessBilling" },
  { title: "API Docs", url: "/api-docs", icon: FileText, accessKey: "canAccessSettings" },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, switchOrganization, switchOrganizationMutation } = useAuth();
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
              <span className="text-sm font-semibold tracking-tight">AI Control Tower</span>
              <span className="text-[10px] text-muted-foreground leading-none">Enterprise Governance</span>
            </div>
          </div>
        </Link>
        {user && access.canSwitchOrganizations && user.organizations.length > 1 ? (
          <div className="mt-4 space-y-2 rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Active organization
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
              disabled={switchOrganizationMutation.isPending}
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
              Cross-organization switching is limited to organization owners and admins.
            </div>
          </div>
        ) : null}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleMainNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    data-active={location === item.url}
                    className="data-[active=true]:bg-sidebar-accent"
                  >
                    <Link href={item.url} data-testid={`link-${item.title.toLowerCase().replace(/\s/g, "-")}`}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {visibleSettingsNav.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Configuration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleSettingsNav.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      data-active={location === item.url}
                      className="data-[active=true]:bg-sidebar-accent"
                    >
                      <Link href={item.url} data-testid={`link-${item.title.toLowerCase()}`}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
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
          <span className="text-[10px] text-muted-foreground">EU AI Act Ready</span>
        </div>
        <a
          href="/welcome"
          className="mt-2 inline-flex text-[11px] text-muted-foreground transition-colors hover:text-foreground hover:underline"
          data-testid="link-public-site"
        >
          View public site
        </a>
      </SidebarFooter>
    </Sidebar>
  );
}
