import { useLocation, Link } from "wouter";
import {
  LayoutDashboard,
  Server,
  ShieldCheck,
  ClipboardCheck,
  FileText,
  Activity,
  Settings,
  Shield,
  User,
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

const mainNav = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "AI Registry", url: "/registry", icon: Server },
  { title: "Risk Assessment", url: "/risk", icon: ShieldCheck },
  { title: "Compliance", url: "/compliance", icon: ClipboardCheck },
  { title: "Approvals", url: "/approvals", icon: FileText },
  { title: "Audit Log", url: "/audit", icon: Activity },
];

const settingsNav = [
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user } = useAuth();

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/">
          <div className="flex items-center gap-2 cursor-pointer" data-testid="link-home">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
              <Shield className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold tracking-tight">AI Control Tower</span>
              <span className="text-[10px] text-muted-foreground leading-none">Enterprise Governance</span>
            </div>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
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
      </SidebarFooter>
    </Sidebar>
  );
}
