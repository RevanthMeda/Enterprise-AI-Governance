import { useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
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
import InviteAcceptPage from "@/pages/invite-accept-page";
import LandingPage from "@/pages/landing-page";
import BookDemoPage, { StartPilotPage } from "@/pages/lead-capture";
import ThankYouPage from "@/pages/thank-you";
import PrivacyPage from "@/pages/privacy";
import TermsPage from "@/pages/terms";
import SecurityPage from "@/pages/security-page";

const PUBLIC_PATHS = new Set([
  "/",
  "/auth",
  "/auth/login",
  "/login",
  "/auth/invite",
  "/invite/accept",
  "/book-demo",
  "/start-pilot",
  "/thank-you",
  "/privacy",
  "/terms",
  "/security",
]);

function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.has(path);
}

function AuthenticatedRouter({ isAdmin }: { isAdmin: boolean }) {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/activity" component={MyActivity} />
      <Route path="/my-activity" component={ActivityAliasRedirect} />
      <Route path="/registry" component={Registry} />
      <Route path="/systems/:id" component={SystemDetail} />
      <Route path="/risk" component={RiskAssessment} />
      <Route path="/risk-assessment" component={RiskAliasRedirect} />
      <Route path="/compliance" component={Compliance} />
      <Route path="/calendar" component={ComplianceCalendar} />
      <Route path="/approvals" component={Approvals} />
      <Route path="/audit" component={AuditLogPage} />
      <Route path="/bulk-controls" component={BulkControls} />
      <Route path="/settings" component={isAdmin ? SettingsPage : Dashboard} />
      <Route path="/auth" component={Dashboard} />
      <Route path="/auth/login" component={Dashboard} />
      <Route path="/login" component={Dashboard} />
      <Route path="/auth/invite" component={Dashboard} />
      <Route path="/invite/accept" component={Dashboard} />
      <Route component={NotFound} />
    </Switch>
  );
}

function PublicFallback() {
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!isPublicPath(location)) {
      setLocation(`/auth/login?next=${encodeURIComponent(location)}`);
    }
  }, [location, setLocation]);

  if (!isPublicPath(location)) {
    return null;
  }

  return <LandingPage />;
}

function LoginAliasRedirect() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const queryString = typeof window === "undefined" ? "" : window.location.search;
    setLocation(`/auth/login${queryString}`);
  }, [setLocation]);

  return null;
}

function RiskAliasRedirect() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const queryString = typeof window === "undefined" ? "" : window.location.search;
    setLocation(`/risk${queryString}`);
  }, [setLocation]);

  return null;
}

function ActivityAliasRedirect() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const queryString = typeof window === "undefined" ? "" : window.location.search;
    setLocation(`/activity${queryString}`);
  }, [setLocation]);

  return null;
}

function PublicRouter() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/auth/login" component={AuthPage} />
      <Route path="/login" component={LoginAliasRedirect} />
      <Route path="/risk-assessment" component={RiskAliasRedirect} />
      <Route path="/my-activity" component={ActivityAliasRedirect} />
      <Route path="/auth/invite" component={InviteAcceptPage} />
      <Route path="/invite/accept" component={InviteAcceptPage} />
      <Route path="/book-demo" component={BookDemoPage} />
      <Route path="/start-pilot" component={StartPilotPage} />
      <Route path="/thank-you" component={ThankYouPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/security" component={SecurityPage} />
      <Route component={PublicFallback} />
    </Switch>
  );
}

function AuthenticatedApp() {
  const { user, isLoading, logout } = useAuth();
  const [location] = useLocation();
  const isPublic = isPublicPath(location);
  const isAdmin = user?.role === "admin";

  if (isLoading && !isPublic) {
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
    return <PublicRouter />;
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
            <AuthenticatedRouter isAdmin={isAdmin} />
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
