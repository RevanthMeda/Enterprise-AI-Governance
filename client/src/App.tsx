import { Suspense, lazy, useEffect } from "react";
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
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Registry = lazy(() => import("@/pages/registry"));
const RiskAssessment = lazy(() => import("@/pages/risk-assessment"));
const Compliance = lazy(() => import("@/pages/compliance"));
const Approvals = lazy(() => import("@/pages/approvals"));
const AuditLogPage = lazy(() => import("@/pages/audit-log"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const SystemDetail = lazy(() => import("@/pages/system-detail"));
const BulkControls = lazy(() => import("@/pages/bulk-controls"));
const MyActivity = lazy(() => import("@/pages/my-activity"));
const ComplianceCalendar = lazy(() => import("@/pages/compliance-calendar"));
const AuthPage = lazy(() => import("@/pages/auth-page"));
const InviteAcceptPage = lazy(() => import("@/pages/invite-accept-page"));
const LandingPage = lazy(() => import("@/pages/landing-page"));
const BookDemoPage = lazy(() => import("@/pages/lead-capture"));
const StartPilotPage = lazy(() => import("@/pages/lead-capture").then((module) => ({ default: module.StartPilotPage })));
const ThankYouPage = lazy(() => import("@/pages/thank-you"));
const PrivacyPage = lazy(() => import("@/pages/privacy"));
const TermsPage = lazy(() => import("@/pages/terms"));
const SecurityPage = lazy(() => import("@/pages/security-page"));
const ApiDocsPage = lazy(() => import("@/pages/api-docs"));

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
  "/book-demo/thank-you",
  "/start-pilot/thank-you",
  "/privacy",
  "/terms",
  "/security",
  "/api-docs",
]);

function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.has(path);
}

function RouteLoadingFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="text-center space-y-3">
        <Skeleton className="mx-auto h-8 w-8 rounded-full" />
        <Skeleton className="h-4 w-40" />
      </div>
    </div>
  );
}

function AuthenticatedRouter({ isAdmin }: { isAdmin: boolean }) {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
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
        <Route path="/thank-you" component={ThankYouPage} />
        <Route path="/book-demo/thank-you" component={ThankYouPage} />
        <Route path="/start-pilot/thank-you" component={ThankYouPage} />
        <Route path="/auth" component={Dashboard} />
        <Route path="/auth/login" component={Dashboard} />
        <Route path="/login" component={Dashboard} />
        <Route path="/auth/invite" component={Dashboard} />
        <Route path="/invite/accept" component={Dashboard} />
        <Route path="/api-docs" component={ApiDocsPage} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
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

function ThankYouAliasRedirect() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const queryString = typeof window === "undefined" ? "" : window.location.search;
    setLocation(`/thank-you${queryString}`);
  }, [setLocation]);

  return null;
}

function PublicRouter() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
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
        <Route path="/book-demo/thank-you" component={ThankYouPage} />
        <Route path="/start-pilot/thank-you" component={ThankYouPage} />
        <Route path="/privacy" component={PrivacyPage} />
        <Route path="/terms" component={TermsPage} />
        <Route path="/security" component={SecurityPage} />
        <Route path="/api-docs" component={ApiDocsPage} />
        <Route component={PublicFallback} />
      </Switch>
    </Suspense>
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
