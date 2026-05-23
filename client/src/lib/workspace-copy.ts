import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { DEFAULT_WORKSPACE_LOCALE, type WorkspaceLocale } from "@shared/operator-preferences";
import { resolveRuntimeWorkspaceLocale } from "@/lib/workspace-locale";

type WorkspaceNavKey =
  | "dashboard"
  | "analytics"
  | "maturity"
  | "knowledge"
  | "registry"
  | "risk"
  | "compliance"
  | "runtime"
  | "incidents"
  | "approvals"
  | "decisionTraces"
  | "auditLog"
  | "myActivity"
  | "accountSecurity"
  | "evidence"
  | "portfolio"
  | "calendar"
  | "bulkControls"
  | "telemetryAdapter"
  | "telemetryPolicy"
  | "integrations"
  | "settings"
  | "retentionControl"
  | "billing"
  | "apiDocs";

export type WorkspaceCopy = {
  appName: string;
  appTagline: string;
  sections: {
    platform: string;
    configuration: string;
  };
  labels: {
    activeOrganization: string;
    crossOrgHint: string;
    version: string;
    aiActReady: string;
    open: string;
    enablement: string;
  };
  nav: Record<WorkspaceNavKey, string>;
  knowledge: {
    title: string;
    intro: string;
    searchPlaceholder: string;
    docsTitle: string;
    trainingTitle: string;
    howToUseTitle: string;
  };
  dashboard: {
    suggestedPath: string;
    workspaceLayout: string;
    savedViews: string;
    savedViewsHint: string;
    visibleWidgets: string;
    visibleWidgetsHint: string;
  };
};

const ENGLISH_BASE: WorkspaceCopy = {
  appName: "AI CONTROL GRID",
  appTagline: "by Arcturos",
  sections: {
    platform: "Platform",
    configuration: "Configuration",
  },
  labels: {
    activeOrganization: "Active organization",
    crossOrgHint: "Cross-organization switching is limited to organization owners and admins.",
    version: "Version",
    aiActReady: "EU AI Act Ready",
    open: "Open",
    enablement: "Enablement",
  },
  nav: {
    dashboard: "Dashboard",
    analytics: "Analytics",
    maturity: "Maturity",
    knowledge: "Knowledge",
    registry: "AI Registry",
    risk: "Risk",
    compliance: "Compliance",
    runtime: "Runtime",
    incidents: "Incidents",
    approvals: "Approvals",
    decisionTraces: "Decision Traces",
    auditLog: "Audit Log",
    myActivity: "My Activity",
    accountSecurity: "Account Security",
    evidence: "Evidence",
    portfolio: "Portfolio",
    calendar: "Calendar",
    bulkControls: "Bulk Controls",
    telemetryAdapter: "Telemetry Adapter",
    telemetryPolicy: "Telemetry Policy",
    integrations: "Integrations",
    settings: "Settings",
    retentionControl: "Retention Control",
    billing: "Billing",
    apiDocs: "API Docs",
  },
  knowledge: {
    title: "Knowledge Center",
    intro: "Centralized product documentation, role-based learning paths, and certification-style readiness guidance for Control Grid teams.",
    searchPlaceholder: "Search docs, tracks, or certification guidance",
    docsTitle: "Documentation paths",
    trainingTitle: "Role-based training",
    howToUseTitle: "How to use this center",
  },
  dashboard: {
    suggestedPath: "Suggested navigation path",
    workspaceLayout: "Workspace Layout",
    savedViews: "Saved views",
    savedViewsHint: "Switch between operator, reviewer, and executive layouts.",
    visibleWidgets: "Visible widgets",
    visibleWidgetsHint: "Hide sections that do not help your current role or review workflow.",
  },
};

const COPY_BY_LOCALE: Record<WorkspaceLocale, WorkspaceCopy> = {
  "en-GB": ENGLISH_BASE,
  "en-US": {
    ...ENGLISH_BASE,
    labels: {
      ...ENGLISH_BASE.labels,
      activeOrganization: "Active organization",
    },
  },
  "fr-FR": {
    appName: "AI CONTROL GRID",
    appTagline: "by Arcturos",
    sections: {
      platform: "Plateforme",
      configuration: "Configuration",
    },
    labels: {
      activeOrganization: "Organisation active",
      crossOrgHint: "Le changement d'organisation est limité aux propriétaires et administrateurs.",
      version: "Version",
      aiActReady: "Prêt pour l'AI Act de l'UE",
      open: "Ouvrir",
      enablement: "Adoption",
    },
    nav: {
      dashboard: "Tableau de bord",
      analytics: "Analytique",
      maturity: "Maturité",
      knowledge: "Connaissances",
      registry: "Registre IA",
      risk: "Risque",
      compliance: "Conformité",
      runtime: "Exécution",
      incidents: "Incidents",
      approvals: "Approbations",
      decisionTraces: "Traces de décision",
      auditLog: "Journal d'audit",
      myActivity: "Mon activité",
      accountSecurity: "Sécurité du compte",
      evidence: "Preuves",
      portfolio: "Portefeuille",
      calendar: "Calendrier",
      bulkControls: "Contrôles groupés",
      telemetryAdapter: "Adaptateur de télémétrie",
      telemetryPolicy: "Politique de télémétrie",
      integrations: "Intégrations",
      settings: "Paramètres",
      retentionControl: "Rétention",
      billing: "Facturation",
      apiDocs: "Docs API",
    },
    knowledge: {
      title: "Centre de connaissances",
      intro: "Documentation produit centralisée, parcours de formation par rôle et repères de préparation pour les équipes Control Grid.",
      searchPlaceholder: "Rechercher documentation, parcours ou guides",
      docsTitle: "Parcours documentaires",
      trainingTitle: "Formation par rôle",
      howToUseTitle: "Comment utiliser ce centre",
    },
    dashboard: {
      suggestedPath: "Parcours recommandé",
      workspaceLayout: "Disposition de l'espace",
      savedViews: "Vues enregistrées",
      savedViewsHint: "Passez entre les vues opérateur, réviseur et direction.",
      visibleWidgets: "Widgets visibles",
      visibleWidgetsHint: "Masquez les sections inutiles pour votre rôle ou votre flux de revue.",
    },
  },
  "de-DE": {
    appName: "AI CONTROL GRID",
    appTagline: "by Arcturos",
    sections: {
      platform: "Plattform",
      configuration: "Konfiguration",
    },
    labels: {
      activeOrganization: "Aktive Organisation",
      crossOrgHint: "Der organisationsübergreifende Wechsel ist auf Eigentümer und Administratoren beschränkt.",
      version: "Version",
      aiActReady: "EU-AI-Act bereit",
      open: "Öffnen",
      enablement: "Enablement",
    },
    nav: {
      dashboard: "Dashboard",
      analytics: "Analysen",
      maturity: "Reifegrad",
      knowledge: "Wissenscenter",
      registry: "KI-Register",
      risk: "Risiko",
      compliance: "Compliance",
      runtime: "Laufzeit",
      incidents: "Vorfälle",
      approvals: "Freigaben",
      decisionTraces: "Entscheidungsspuren",
      auditLog: "Audit-Protokoll",
      myActivity: "Meine Aktivität",
      accountSecurity: "Kontosicherheit",
      evidence: "Nachweise",
      portfolio: "Portfolio",
      calendar: "Kalender",
      bulkControls: "Massenkontrollen",
      telemetryAdapter: "Telemetry-Adapter",
      telemetryPolicy: "Telemetry-Richtlinie",
      integrations: "Integrationen",
      settings: "Einstellungen",
      retentionControl: "Aufbewahrung",
      billing: "Abrechnung",
      apiDocs: "API-Doku",
    },
    knowledge: {
      title: "Wissenscenter",
      intro: "Zentrale Produktdokumentation, rollenspezifische Lernpfade und Reifehinweise für Control Grid-Teams.",
      searchPlaceholder: "Dokumente, Lernpfade oder Leitfäden durchsuchen",
      docsTitle: "Dokumentationspfade",
      trainingTitle: "Rollenspezifisches Training",
      howToUseTitle: "So nutzen Sie dieses Center",
    },
    dashboard: {
      suggestedPath: "Empfohlener Navigationspfad",
      workspaceLayout: "Arbeitsbereichslayout",
      savedViews: "Gespeicherte Ansichten",
      savedViewsHint: "Zwischen Operator-, Reviewer- und Executive-Layouts wechseln.",
      visibleWidgets: "Sichtbare Widgets",
      visibleWidgetsHint: "Blenden Sie Bereiche aus, die für Ihre Rolle oder Prüfung nicht hilfreich sind.",
    },
  },
  "es-ES": {
    appName: "AI CONTROL GRID",
    appTagline: "by Arcturos",
    sections: {
      platform: "Plataforma",
      configuration: "Configuración",
    },
    labels: {
      activeOrganization: "Organización activa",
      crossOrgHint: "El cambio entre organizaciones está limitado a propietarios y administradores.",
      version: "Versión",
      aiActReady: "Preparado para la Ley de IA de la UE",
      open: "Abrir",
      enablement: "Habilitación",
    },
    nav: {
      dashboard: "Panel",
      analytics: "Analítica",
      maturity: "Madurez",
      knowledge: "Conocimiento",
      registry: "Registro IA",
      risk: "Riesgo",
      compliance: "Cumplimiento",
      runtime: "Tiempo real",
      incidents: "Incidentes",
      approvals: "Aprobaciones",
      decisionTraces: "Trazas de decisión",
      auditLog: "Registro de auditoría",
      myActivity: "Mi actividad",
      accountSecurity: "Seguridad de la cuenta",
      evidence: "Evidencia",
      portfolio: "Portafolio",
      calendar: "Calendario",
      bulkControls: "Controles masivos",
      telemetryAdapter: "Adaptador de telemetría",
      telemetryPolicy: "Política de telemetría",
      integrations: "Integraciones",
      settings: "Configuración",
      retentionControl: "Retención",
      billing: "Facturación",
      apiDocs: "Docs API",
    },
    knowledge: {
      title: "Centro de conocimiento",
      intro: "Documentación centralizada, rutas de aprendizaje por rol y guías de preparación para equipos de Control Grid.",
      searchPlaceholder: "Buscar documentación, rutas o guías",
      docsTitle: "Rutas de documentación",
      trainingTitle: "Formación por rol",
      howToUseTitle: "Cómo usar este centro",
    },
    dashboard: {
      suggestedPath: "Ruta de navegación sugerida",
      workspaceLayout: "Diseño del espacio de trabajo",
      savedViews: "Vistas guardadas",
      savedViewsHint: "Cambia entre diseños de operador, revisor y ejecutivo.",
      visibleWidgets: "Widgets visibles",
      visibleWidgetsHint: "Oculta secciones que no ayuden a tu rol o flujo de revisión.",
    },
  },
};

export function resolveWorkspaceCopy(locale?: WorkspaceLocale | null): WorkspaceCopy {
  const resolvedLocale = resolveRuntimeWorkspaceLocale(locale);
  return COPY_BY_LOCALE[resolvedLocale] ?? COPY_BY_LOCALE[DEFAULT_WORKSPACE_LOCALE];
}

export function useWorkspaceCopy() {
  const { user } = useAuth();
  const locale = resolveRuntimeWorkspaceLocale(user?.currentOrganizationOnboarding?.workspaceLocale);
  return useMemo(() => resolveWorkspaceCopy(locale), [locale]);
}
