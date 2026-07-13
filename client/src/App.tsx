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
import { GlobalCommandCenter } from "@/components/global-command-center";
import { RouteHelpPanel } from "@/components/route-help-panel";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBoundary } from "@/components/error-boundary";
import { ActurusMark } from "@/components/acturus-public-shell";
import { getAppAccess, getDisplayRole } from "@/lib/permissions";
import { resolvePageCopy } from "@/lib/page-copy";
import { resolveWorkspaceCopy } from "@/lib/workspace-copy";
import NotFound from "@/pages/not-found";
const Dashboard = lazy(() => import("@/pages/dashboard"));
const AnalyticsCenterPage = lazy(() => import("@/pages/analytics-center"));
const GovernanceMaturityPage = lazy(() => import("@/pages/governance-maturity"));
const KnowledgeCenterPage = lazy(() => import("@/pages/knowledge-center"));
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
const SsoCompletePage = lazy(() => import("@/pages/sso-complete"));
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
const UnauthorizedPage = lazy(() => import("@/pages/unauthorized"));
const ActurusPage = lazy(() => import("@/pages/acturus"));

const PUBLIC_PATHS = new Set([
  "/",
  "/welcome",
  "/auth",
  "/auth/login",
  "/auth/reset-password",
  "/auth/sso/complete",
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
  "/acturus",
  "/arcturos",
]);

function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.has(path);
}

// Rendered without the app shell even for authenticated users (auth flows, marketing, legal).
// Derived from PUBLIC_PATHS — "/" is excluded because authenticated users see Dashboard there.
const STANDALONE_PUBLIC_PATHS = new Set([...PUBLIC_PATHS].filter((p) => p !== "/"));

function RouteLoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6" role="status" aria-live="polite" aria-busy="true">
      <div className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
        <span className="sr-only">Loading application</span>
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
    <ErrorBoundary>
      <Suspense fallback={<RouteLoadingFallback />}>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/welcome" component={LandingPage} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/analytics" component={access.canAccessAnalytics ? AnalyticsCenterPage : UnauthorizedPage} />
          <Route path="/governance-maturity" component={access.canAccessAnalytics ? GovernanceMaturityPage : UnauthorizedPage} />
          <Route path="/knowledge-center" component={KnowledgeCenterPage} />
          <Route path="/activity" component={MyActivity} />
          <Route path="/account-security" component={AccountSecurityPage} />
          <Route path="/my-activity" component={ActivityAliasRedirect} />
          <Route path="/registry" component={access.canAccessRegistry ? Registry : UnauthorizedPage} />
          <Route path="/registry/connect" component={access.canAccessRegistry ? ConnectAiApplicationPage : UnauthorizedPage} />
          <Route path="/systems/:id" component={access.canAccessRegistry ? SystemDetail : UnauthorizedPage} />
          <Route path="/risk" component={access.canAccessRisk ? RiskAssessment : UnauthorizedPage} />
          <Route path="/risk-assessment" component={RiskAliasRedirect} />
          <Route path="/compliance" component={access.canAccessCompliance ? Compliance : UnauthorizedPage} />
          <Route path="/calendar" component={access.canAccessCalendar ? ComplianceCalendar : UnauthorizedPage} />
          <Route path="/approvals" component={access.canAccessApprovals ? Approvals : UnauthorizedPage} />
          <Route path="/audit" component={access.canAccessAuditLog ? AuditLogPage : UnauthorizedPage} />
          <Route path="/decision-trace" component={access.canAccessDecisionTrace ? DecisionTracePage : UnauthorizedPage} />
          <Route path="/runtime-monitoring" component={access.canAccessRuntimeMonitoring ? RuntimeMonitoringPage : UnauthorizedPage} />
          <Route path="/exit-readiness" component={access.canAccessExitReadiness ? ExitReadinessPage : UnauthorizedPage} />
          <Route path="/portfolio-control" component={access.canAccessPortfolioControl ? PortfolioControlPage : UnauthorizedPage} />
          <Route path="/telemetry-policy" component={access.canAccessTelemetryPolicy ? TelemetryPolicyPage : UnauthorizedPage} />
          <Route path="/telemetry-adapter" component={access.canAccessTelemetryAdapter ? TelemetryAdapterPage : UnauthorizedPage} />
          <Route path="/retention-control" component={access.canAccessRetentionControl ? RetentionControlPage : UnauthorizedPage} />
          <Route path="/incidents" component={access.canAccessIncidents ? IncidentsPage : UnauthorizedPage} />
          <Route path="/bulk-controls" component={access.canAccessBulkControls ? BulkControls : UnauthorizedPage} />
          <Route path="/settings" component={access.canAccessSettings ? SettingsPage : UnauthorizedPage} />
          <Route path="/integrations" component={access.canAccessIntegrations ? IntegrationsPage : UnauthorizedPage} />
          <Route path="/billing" component={access.canAccessBilling ? BillingPage : UnauthorizedPage} />
          <Route path="/thank-you" component={ThankYouPage} />
          <Route path="/book-demo/thank-you" component={ThankYouPage} />
          <Route path="/start-pilot/thank-you" component={ThankYouPage} />
          <Route path="/trust-center" component={TrustCenterPage} />
          {/* Auth alias routes: redirect authenticated users to dashboard */}
          <Route path="/auth" component={Dashboard} />
          <Route path="/auth/login" component={Dashboard} />
          <Route path="/auth/reset-password" component={ResetPasswordPage} />
          <Route path="/auth/sso/complete" component={SsoCompletePage} />
          <Route path="/login" component={Dashboard} />
          <Route path="/reset-password" component={ResetPasswordPage} />
          {/* Invite routes: render accept page so authenticated users can join a new org */}
          <Route path="/auth/invite" component={InviteAcceptPage} />
          <Route path="/invite/accept" component={InviteAcceptPage} />
          <Route path="/api-docs" component={ApiDocsPage} />
          <Route path="/acturus" component={ActurusPage} />
          <Route path="/arcturos" component={ActurusLegacyRedirect} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </ErrorBoundary>
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

function PublicRouteLoadingFallback() {
  const [location] = useLocation();
  const companyTheme = location === "/acturus" || location === "/arcturos";

  return (
    <div
      className={`flex min-h-screen items-center justify-center px-6 text-white ${companyTheme ? "bg-[#090909]" : "bg-[#050914]"}`}
      data-public-theme={companyTheme ? "acturus" : "grid"}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center text-center">
        <span className={`flex h-14 w-14 items-center justify-center rounded-2xl border ${companyTheme ? "border-[#f58227]/40 bg-[#f58227]/10 text-[#f8a45e]" : "border-[#5eebff]/30 bg-[#3aa7ff]/10 text-[#8dddff]"}`}>
          <ActurusMark className="h-8 w-8" />
        </span>
        <span className="font-acturus-display mt-5 text-sm tracking-[0.12em]">ACTURUS</span>
        <span className="mt-2 text-[9px] uppercase tracking-[0.2em] text-white/60">{companyTheme ? "Loading the company story" : "Loading AI CONTROL GRID"}</span>
      </div>
    </div>
  );
}

function ActurusLegacyRedirect() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const queryString = typeof window === "undefined" ? "" : window.location.search;
    setLocation(`/acturus${queryString}`);
  }, [setLocation]);

  return null;
}

function PublicRouter() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PublicRouteLoadingFallback />}>
        <Switch>
          <Route path="/" component={LandingPage} />
          <Route path="/welcome" component={LandingPage} />
          <Route path="/auth" component={AuthPage} />
          <Route path="/auth/login" component={AuthPage} />
          <Route path="/auth/reset-password" component={ResetPasswordPage} />
          <Route path="/auth/sso/complete" component={SsoCompletePage} />
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
          <Route path="/acturus" component={ActurusPage} />
          <Route path="/arcturos" component={ActurusLegacyRedirect} />
          <Route component={PublicFallback} />
        </Switch>
      </Suspense>
    </ErrorBoundary>
  );
}

function AuthenticatedApp() {
  const { user, isLoading, isAuthTransitioning, logout } = useAuth();
  const [location] = useLocation();
  const isPublic = isPublicPath(location);
  const access = getAppAccess(user);
  const displayRole = getDisplayRole(user);

  useEffect(() => {
    if (!isPublic || typeof window === "undefined") return;
    if (window.location.hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [isPublic, location]);

  useEffect(() => {
    const copy = resolveWorkspaceCopy(user?.currentOrganizationOnboarding?.workspaceLocale);
    const pageCopy = resolvePageCopy(user?.currentOrganizationOnboarding?.workspaceLocale);
    const routeTitles: Array<[string, string]> = [
      ["/", user ? copy.nav.dashboard : pageCopy.landing.title],
      ["/welcome", pageCopy.landing.title],
      ["/dashboard", copy.nav.dashboard],
      ["/analytics", copy.nav.analytics],
      ["/governance-maturity", copy.nav.maturity],
      ["/knowledge-center", copy.knowledge.title],
      ["/activity", copy.nav.myActivity],
      ["/account-security", pageCopy.accountSecurity.title],
      ["/registry", copy.nav.registry],
      ["/systems", pageCopy.systemDetail.title],
      ["/registry/connect", pageCopy.connectAiApplication.title],
      ["/risk", copy.nav.risk],
      ["/compliance", copy.nav.compliance],
      ["/calendar", pageCopy.complianceCalendar.title],
      ["/approvals", copy.nav.approvals],
      ["/audit", copy.nav.auditLog],
      ["/decision-trace", pageCopy.decisionTrace.title],
      ["/runtime-monitoring", pageCopy.runtimeMonitoring.title],
      ["/exit-readiness", pageCopy.exitReadiness.title],
      ["/portfolio-control", pageCopy.portfolioControl.title],
      ["/telemetry-policy", pageCopy.telemetryPolicy.title],
      ["/telemetry-adapter", pageCopy.telemetryAdapter.title],
      ["/retention-control", pageCopy.retentionControl.title],
      ["/incidents", copy.nav.incidents],
      ["/settings", copy.nav.settings],
      ["/integrations", copy.nav.integrations],
      ["/billing", copy.nav.billing],
      ["/auth", pageCopy.auth.title],
      ["/auth/login", pageCopy.auth.title],
      ["/auth/reset-password", pageCopy.resetPassword.title],
      ["/reset-password", pageCopy.resetPassword.title],
      ["/invite/accept", pageCopy.inviteAccept.title],
      ["/book-demo", pageCopy.bookDemo.title],
      ["/start-pilot", pageCopy.startPilot.title],
      ["/thank-you", pageCopy.thankYou.title],
      ["/privacy", pageCopy.privacy.title],
      ["/terms", pageCopy.terms.title],
      ["/security", pageCopy.security.title],
      ["/trust-center", pageCopy.trustCenter.badges?.trustCenter ?? pageCopy.trustCenter.title],
      ["/api-docs", pageCopy.apiDocs.title],
      ["/acturus", "ACTURUS"],
    ];

    const match = routeTitles.find(([path]) => location === path || location.startsWith(`${path}/`));
    document.title = `${match?.[1] ?? copy.appName} - ${copy.appName}`;

    const homeMetadata = {
      title: "AI CONTROL GRID — Developed by ACTURUS | Enterprise Runtime Governance",
      description: "AI CONTROL GRID, developed by ACTURUS, brings enterprise AI inventory, policy enforcement, incident operations, and connected evidence into one operating layer.",
      url: "https://aicontrolgrid.com/",
    };
    const companyMetadata = {
      title: "ACTURUS — The company behind AI CONTROL GRID",
      description: "Meet ACTURUS co-founders Revanth Meda and Hitesh Thakkarr and learn why they are building AI CONTROL GRID for accountable enterprise AI operations.",
      url: "https://aicontrolgrid.com/acturus",
    };
    const publicMetadata: Record<string, { title: string; description: string; url: string }> = {
      "/": homeMetadata,
      "/welcome": homeMetadata,
      "/acturus": companyMetadata,
      "/arcturos": companyMetadata,
      "/book-demo": {
        title: "Book an AI CONTROL GRID Demo | ACTURUS",
        description: "Book a private walkthrough of AI CONTROL GRID and map runtime governance, evidence, and incident operations to your AI portfolio.",
        url: "https://aicontrolgrid.com/book-demo",
      },
      "/start-pilot": {
        title: "Start an AI Governance Pilot | ACTURUS",
        description: "Plan a focused AI CONTROL GRID pilot around your systems, governance priorities, and evidence requirements.",
        url: "https://aicontrolgrid.com/start-pilot",
      },
      "/trust-center": {
        title: "AI CONTROL GRID Trust Center | ACTURUS",
        description: "Review the security, tenant isolation, operational readiness, and tamper-evident audit posture behind AI CONTROL GRID.",
        url: "https://aicontrolgrid.com/trust-center",
      },
      "/security": {
        title: "Security | AI CONTROL GRID",
        description: "Review the security practices supporting AI CONTROL GRID and accountable enterprise AI operations.",
        url: "https://aicontrolgrid.com/security",
      },
      "/privacy": {
        title: "Privacy | ACTURUS",
        description: "Read the privacy information for ACTURUS and AI CONTROL GRID.",
        url: "https://aicontrolgrid.com/privacy",
      },
      "/terms": {
        title: "Terms | ACTURUS",
        description: "Read the terms governing use of ACTURUS and AI CONTROL GRID services.",
        url: "https://aicontrolgrid.com/terms",
      },
      "/api-docs": {
        title: "AI CONTROL GRID API Documentation",
        description: "Explore the public API documentation for AI CONTROL GRID platform and enterprise identity integrations.",
        url: "https://aicontrolgrid.com/api-docs",
      },
      "/auth": { title: "Sign in | AI CONTROL GRID", description: "Sign in to your AI CONTROL GRID workspace.", url: "https://aicontrolgrid.com/auth" },
      "/auth/login": { title: "Sign in | AI CONTROL GRID", description: "Sign in to your AI CONTROL GRID workspace.", url: "https://aicontrolgrid.com/auth/login" },
      "/login": { title: "Sign in | AI CONTROL GRID", description: "Sign in to your AI CONTROL GRID workspace.", url: "https://aicontrolgrid.com/auth/login" },
      "/auth/reset-password": { title: "Reset password | AI CONTROL GRID", description: "Reset access to your AI CONTROL GRID workspace.", url: "https://aicontrolgrid.com/auth/reset-password" },
      "/reset-password": { title: "Reset password | AI CONTROL GRID", description: "Reset access to your AI CONTROL GRID workspace.", url: "https://aicontrolgrid.com/reset-password" },
      "/auth/invite": { title: "Accept invitation | AI CONTROL GRID", description: "Accept an invitation to an AI CONTROL GRID workspace.", url: "https://aicontrolgrid.com/auth/invite" },
      "/invite/accept": { title: "Accept invitation | AI CONTROL GRID", description: "Accept an invitation to an AI CONTROL GRID workspace.", url: "https://aicontrolgrid.com/invite/accept" },
      "/thank-you": { title: "Thank you | ACTURUS", description: "Your request has been received by ACTURUS.", url: "https://aicontrolgrid.com/thank-you" },
      "/book-demo/thank-you": { title: "Thank you | ACTURUS", description: "Your AI CONTROL GRID demo request has been received.", url: "https://aicontrolgrid.com/book-demo/thank-you" },
      "/start-pilot/thank-you": { title: "Thank you | ACTURUS", description: "Your AI CONTROL GRID pilot request has been received.", url: "https://aicontrolgrid.com/start-pilot/thank-you" },
    };

    const isPublicDocument = !user ? isPublic : STANDALONE_PUBLIC_PATHS.has(location);
    const isCompanyPage = location === "/acturus" || location === "/arcturos";
    const lightPublicPage = ["/book-demo", "/start-pilot", "/thank-you", "/book-demo/thank-you", "/start-pilot/thank-you", "/trust-center", "/security", "/privacy", "/terms", "/api-docs", "/auth", "/auth/login", "/login", "/auth/reset-password", "/auth/sso/complete", "/reset-password", "/auth/invite", "/invite/accept"].includes(location);
    const metadata = publicMetadata[location];

    if (isPublicDocument && metadata) {
      document.title = metadata.title;
      document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.setAttribute("href", metadata.url);
      document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute("content", metadata.description);
      document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.setAttribute("content", metadata.title);
      document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.setAttribute("content", metadata.description);
      document.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.setAttribute("content", metadata.url);
      document.querySelector<HTMLMetaElement>('meta[name="twitter:title"]')?.setAttribute("content", metadata.title);
      document.querySelector<HTMLMetaElement>('meta[name="twitter:description"]')?.setAttribute("content", metadata.description);
    }

    document.body.style.background = isPublicDocument ? (isCompanyPage ? "#100916" : lightPublicPage ? "#edf4ff" : "#050914") : "";
    document.body.style.color = isPublicDocument ? (lightPublicPage ? "#07101f" : "#f4f8ff") : "";
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", isCompanyPage ? "#090909" : "#050914");
    document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"]').forEach((icon) => {
      icon.setAttribute("href", isCompanyPage ? "/favicon-acturus.svg?v=2" : "/favicon.svg?v=5");
    });
  }, [location, user]);

  useEffect(() => {
    const root = document.documentElement;
    const onboarding = user?.currentOrganizationOnboarding;
    const prefs = onboarding?.accessibilityPreferences;
    root.dataset.contrastMode = prefs?.highContrast ? "high" : "default";
    root.dataset.motionMode = prefs?.reducedMotion ? "reduced" : "default";
    root.dataset.fontScale = prefs?.fontScale ?? "default";
    root.lang = onboarding?.workspaceLocale ?? "en-GB";

    return () => {
      delete root.dataset.contrastMode;
      delete root.dataset.motionMode;
      delete root.dataset.fontScale;
      root.lang = "en-GB";
    };
  }, [user?.currentOrganizationOnboarding]);

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
    <SidebarProvider key={user.currentOrganizationId ?? "no-organization"} style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <a
          href="#app-main-content"
          className="absolute left-3 top-3 z-50 -translate-y-16 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-transform focus:translate-y-0"
        >
          Skip to main content
        </a>
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-1 p-2 border-b shrink-0">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex items-center gap-2">
              <GlobalCommandCenter />
              <a
                href="/welcome"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded"
                data-testid="link-header-public-site"
              >
                Public site
              </a>
              <RouteHelpPanel />
              <NotificationBell />
              <PwaInstallPrompt />
              <div className="text-right hidden sm:block">
                <p className="text-xs font-medium" data-testid="text-user-name">{user.fullName}</p>
                <p className="text-[10px] text-muted-foreground capitalize" data-testid="text-user-role">{displayRole?.replace("_", " ") ?? "member"}</p>
              </div>
              <button
                onClick={() => logout()}
                disabled={isAuthTransitioning}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded"
                data-testid="button-logout"
              >
                {isAuthTransitioning ? "Please wait..." : "Logout"}
              </button>
              <ThemeToggle />
            </div>
          </header>
          <main id="app-main-content" className="flex-1 overflow-auto" tabIndex={-1}>
            <AuthenticatedRouter access={access} />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function App() {
  return (
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
}

export default App;
