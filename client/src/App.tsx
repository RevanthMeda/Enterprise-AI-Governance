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
import { getAppAccess, getDisplayRole } from "@/lib/permissions";
import NotFound from "@/pages/not-found";
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Registry = lazy(() => import("@/pages/registry"));
const ConnectAiApplicationPage = lazy(() => import("@/pages/connect-ai-application"));
const RiskAssessment = lazy(() => import("@/pages/risk-assessment"));
const Compliance = lazy(() => import("@/pages/compliance"));
const Approvals = lazy(() => import("@/pages/approvals"));
const AuditLogPage = lazy(() => import("@/pages/audit-log"));
const DecisionTracePage = lazy(() => import("@/pages/decision-trace"));
const RuntimeMonitoringPage = lazy(() => import("@/pages/runtime-monitoring"));
const ExitReadinessPage = lazy(() => import("@/pages/exit-readiness"));
const PortfolioControlPage = lazy(() => import("@/pages/portfolio-control"));
const TelemetryPolicyPage = lazy(() => import("@/pages/telemetry-policy"));
const TelemetryAdapterPage = lazy(() => import("@/pages/telemetry-adapter"));
const RetentionControlPage = lazy(() => import("@/pages/retention-control"));
const IncidentsPage = lazy(() => import("@/pages/incidents"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const IntegrationsPage = lazy(() => import("@/pages/integrations"));
const BillingPage = lazy(() => import("@/pages/billing"));
const SystemDetail = lazy(() => import("@/pages/system-detail"));
const BulkControls = lazy(() => import("@/pages/bulk-controls"));
const MyActivity = lazy(() => import("@/pages/my-activity"));
const AccountSecurityPage = lazy(() => import("@/pages/account-security"));
const ComplianceCalendar = lazy(() => import("@/pages/compliance-calendar"));
const AuthPage = lazy(() => import("@/pages/auth-page"));
const ResetPasswordPage = lazy(() => import("@/pages/reset-password"));
const InviteAcceptPage = lazy(() => import("@/pages/invite-accept-page"));
const LandingPage = lazy(() => import("@/pages/landing-page"));
const BookDemoPage = lazy(() => import("@/pages/lead-capture"));
const StartPilotPage = lazy(() => import("@/pages/lead-capture").then((module) => ({ default: module.StartPilotPage })));
const ThankYouPage = lazy(() => import("@/pages/thank-you"));
const PrivacyPage = lazy(() => import("@/pages/privacy"));
const TermsPage = lazy(() => import("@/pages/terms"));
const SecurityPage = lazy(() => import("@/pages/security-page"));
const TrustCenterPage = lazy(() => import("@/pages/trust-center"));
const ApiDocsPage = lazy(() => import("@/pages/api-docs"));

const PUBLIC_PATHS = new Set([
  "/",
  "/welcome",
  "/auth",
  "/auth/login",
  "/auth/reset-password",
  "/login",
  "/reset-password",
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
  "/trust-center",
  "/api-docs",
]);

function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.has(path);
}

const STANDALONE_PUBLIC_PATHS = new Set([
  "/welcome",
  "/auth",
  "/auth/login",
  "/auth/reset-password",
  "/login",
  "/reset-password",
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
  "/trust-center",
  "/api-docs",
]);

function RouteLoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
        <Skeleton className="mx-auto h-10 w-10 rounded-2xl" />
        <div className="space-y-2">
          <Skeleton className="mx-auto h-5 w-40" />
          <Skeleton className="mx-auto h-4 w-64" />
        </div>
        <div className="space-y-3 pt-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </div>
  );
}

function AuthenticatedRouter({
  access,
}: {
  access: ReturnType<typeof getAppAccess>;
}) {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/welcome" component={LandingPage} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/activity" component={MyActivity} />
        <Route path="/account-security" component={AccountSecurityPage} />
        <Route path="/my-activity" component={ActivityAliasRedirect} />
        <Route path="/registry" component={access.canAccessRegistry ? Registry : Dashboard} />
        <Route path="/registry/connect" component={access.canAccessRegistry ? ConnectAiApplicationPage : Dashboard} />
        <Route path="/systems/:id" component={access.canAccessRegistry ? SystemDetail : Dashboard} />
        <Route path="/risk" component={access.canAccessRisk ? RiskAssessment : Dashboard} />
        <Route path="/risk-assessment" component={RiskAliasRedirect} />
        <Route path="/compliance" component={access.canAccessCompliance ? Compliance : Dashboard} />
        <Route path="/calendar" component={access.canAccessCalendar ? ComplianceCalendar : Dashboard} />
        <Route path="/approvals" component={access.canAccessApprovals ? Approvals : Dashboard} />
        <Route path="/audit" component={access.canAccessAuditLog ? AuditLogPage : Dashboard} />
        <Route path="/decision-trace" component={access.canAccessDecisionTrace ? DecisionTracePage : Dashboard} />
        <Route path="/runtime-monitoring" component={access.canAccessRuntimeMonitoring ? RuntimeMonitoringPage : Dashboard} />
        <Route path="/exit-readiness" component={access.canAccessExitReadiness ? ExitReadinessPage : Dashboard} />
        <Route path="/portfolio-control" component={access.canAccessPortfolioControl ? PortfolioControlPage : Dashboard} />
        <Route path="/telemetry-policy" component={access.canAccessTelemetryPolicy ? TelemetryPolicyPage : Dashboard} />
        <Route path="/telemetry-adapter" component={access.canAccessTelemetryAdapter ? TelemetryAdapterPage : Dashboard} />
        <Route path="/retention-control" component={access.canAccessRetentionControl ? RetentionControlPage : Dashboard} />
        <Route path="/incidents" component={access.canAccessIncidents ? IncidentsPage : Dashboard} />
        <Route path="/bulk-controls" component={access.canAccessBulkControls ? BulkControls : Dashboard} />
        <Route path="/settings" component={access.canAccessSettings ? SettingsPage : Dashboard} />
        <Route path="/integrations" component={access.canAccessIntegrations ? IntegrationsPage : Dashboard} />
        <Route path="/billing" component={access.canAccessBilling ? BillingPage : Dashboard} />
        <Route path="/thank-you" component={ThankYouPage} />
        <Route path="/book-demo/thank-you" component={ThankYouPage} />
        <Route path="/start-pilot/thank-you" component={ThankYouPage} />
        <Route path="/trust-center" component={TrustCenterPage} />
        <Route path="/auth" component={Dashboard} />
        <Route path="/auth/login" component={Dashboard} />
        <Route path="/auth/reset-password" component={ResetPasswordPage} />
        <Route path="/login" component={Dashboard} />
        <Route path="/reset-password" component={ResetPasswordPage} />
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
        <Route path="/welcome" component={LandingPage} />
        <Route path="/auth" component={AuthPage} />
        <Route path="/auth/login" component={AuthPage} />
        <Route path="/auth/reset-password" component={ResetPasswordPage} />
        <Route path="/login" component={LoginAliasRedirect} />
        <Route path="/reset-password" component={ResetPasswordPage} />
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
        <Route path="/trust-center" component={TrustCenterPage} />
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
  const access = getAppAccess(user);
  const displayRole = getDisplayRole(user);

  useEffect(() => {
    const routeTitles: Array<[string, string]> = [
      ["/", user ? "Dashboard" : "Home"],
      ["/welcome", "Welcome"],
      ["/dashboard", "Dashboard"],
      ["/activity", "My Activity"],
      ["/account-security", "Account Security"],
      ["/registry", "AI Registry"],
      ["/registry/connect", "Connect AI Application"],
      ["/risk", "Risk"],
      ["/compliance", "Compliance"],
      ["/calendar", "Compliance Calendar"],
      ["/approvals", "Approval Workflows"],
      ["/audit", "Audit Log"],
      ["/decision-trace", "Decision Traces"],
      ["/runtime-monitoring", "Runtime"],
      ["/exit-readiness", "Evidence"],
      ["/portfolio-control", "Portfolio"],
      ["/telemetry-policy", "Telemetry Policy"],
      ["/telemetry-adapter", "Telemetry Adapter"],
      ["/retention-control", "Retention Control"],
      ["/incidents", "Incident Response"],
      ["/settings", "Settings"],
      ["/integrations", "Integrations"],
      ["/billing", "Billing"],
      ["/auth", "Sign In"],
      ["/auth/login", "Sign In"],
      ["/auth/reset-password", "Reset Password"],
      ["/reset-password", "Reset Password"],
      ["/invite/accept", "Accept Invite"],
      ["/book-demo", "Book Demo"],
      ["/start-pilot", "Start Pilot"],
      ["/thank-you", "Thank You"],
      ["/privacy", "Privacy"],
      ["/terms", "Terms"],
      ["/security", "Security"],
      ["/trust-center", "Trust Center"],
      ["/api-docs", "API Docs"],
    ];

    const match = routeTitles.find(([path]) => location === path || location.startsWith(`${path}/`));
    document.title = `${match?.[1] ?? "AI Control Tower"} - AI Control Tower`;
  }, [location, user]);

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

  if (STANDALONE_PUBLIC_PATHS.has(location)) {
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
              <a
                href="/welcome"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded"
                data-testid="link-header-public-site"
              >
                Public site
              </a>
              <NotificationBell />
              <div className="text-right hidden sm:block">
                <p className="text-xs font-medium" data-testid="text-user-name">{user.fullName}</p>
                <p className="text-[10px] text-muted-foreground capitalize" data-testid="text-user-role">{displayRole?.replace("_", " ") ?? "member"}</p>
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
            <AuthenticatedRouter access={access} />
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
