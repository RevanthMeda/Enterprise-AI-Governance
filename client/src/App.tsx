import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { NotificationBell } from "@/components/notification-bell";
import { Skeleton } from "@/components/ui/skeleton";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Registry from "@/pages/registry";
import RiskAssessment from "@/pages/risk-assessment";
import Compliance from "@/pages/compliance";
import Approvals from "@/pages/approvals";
import AuditLogPage from "@/pages/audit-log";
import SettingsPage from "@/pages/settings";
import SystemDetail from "@/pages/system-detail";
import BulkControls from "@/pages/bulk-controls";
import MyActivity from "@/pages/my-activity";
import ComplianceCalendar from "@/pages/compliance-calendar";
import AuthPage from "@/pages/auth-page";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/activity" component={MyActivity} />
      <Route path="/registry" component={Registry} />
      <Route path="/systems/:id" component={SystemDetail} />
      <Route path="/risk" component={RiskAssessment} />
      <Route path="/compliance" component={Compliance} />
      <Route path="/calendar" component={ComplianceCalendar} />
      <Route path="/approvals" component={Approvals} />
      <Route path="/audit" component={AuditLogPage} />
      <Route path="/bulk-controls" component={BulkControls} />
      <Route path="/settings" component={SettingsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApp() {
  const { user, isLoading, logout } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center space-y-3">
          <Skeleton className="h-8 w-8 rounded-full mx-auto" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-1 p-2 border-b shrink-0">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex items-center gap-2">
              <NotificationBell />
              <div className="text-right hidden sm:block">
                <p className="text-xs font-medium" data-testid="text-user-name">{user.fullName}</p>
                <p className="text-[10px] text-muted-foreground capitalize" data-testid="text-user-role">{user.role.replace("_", " ")}</p>
              </div>
              <button
                onClick={() => logout()}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded"
                data-testid="button-logout"
              >
                Logout
              </button>
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            <Router />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <AuthenticatedApp />
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
