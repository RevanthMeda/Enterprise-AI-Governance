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
  Building2,
  SlidersHorizontal,
  Cable,
  Archive,
  CreditCard,
  PlugZap,
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
import { BrandMark } from "@/components/brand-mark";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const mainNav = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "My Activity", url: "/activity", icon: UserCircle },
  { title: "AI Registry", url: "/registry", icon: Server },
  { title: "Risk Assessment", url: "/risk", icon: ShieldCheck },
  { title: "Compliance", url: "/compliance", icon: ClipboardCheck },
  { title: "Calendar", url: "/calendar", icon: CalendarDays },
  { title: "Approvals", url: "/approvals", icon: FileText },
  { title: "Decision Trace", url: "/decision-trace", icon: Fingerprint },
  { title: "Exit Readiness", url: "/exit-readiness", icon: Gauge },
  { title: "Portfolio Control", url: "/portfolio-control", icon: Building2 },
  { title: "Incidents", url: "/incidents", icon: AlertTriangle },
  { title: "Bulk Controls", url: "/bulk-controls", icon: Layers },
  { title: "Audit Log", url: "/audit", icon: Activity },
];

const settingsNav = [
  { title: "Settings", url: "/settings", icon: Settings },
  { title: "Integrations", url: "/integrations", icon: PlugZap },
  { title: "Telemetry Policy", url: "/telemetry-policy", icon: SlidersHorizontal },
  { title: "Telemetry Adapter", url: "/telemetry-adapter", icon: Cable },
  { title: "Retention Control", url: "/retention-control", icon: Archive },
  { title: "Billing", url: "/billing", icon: CreditCard },
  { title: "Docs", url: "/api-docs", icon: FileText },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, switchOrganization, switchOrganizationMutation } = useAuth();
  const isAdmin = user?.role === "admin";
  const sortedOrganizations = [...(user?.organizations ?? [])].sort((a, b) => {
    const aIsDemo = a.slug.includes("-demo");
    const bIsDemo = b.slug.includes("-demo");

    if (aIsDemo !== bIsDemo) {
      return aIsDemo ? -1 : 1;
    }

    return a.name.localeCompare(b.name);
  });

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
        {user && user.organizations.length > 1 ? (
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
              Portfolio views aggregate across companies. All other pages use the active organization shown here.
            </div>
          </div>
        ) : null}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav
                .filter(
                  (item) =>
                    !["/exit-readiness", "/portfolio-control"].includes(item.url) || isAdmin,
                )
                .map((item) => (
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
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Configuration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {settingsNav.map((item) => (
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
              <span className="text-[10px] text-muted-foreground capitalize">{user.role.replace("_", " ")}</span>
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
