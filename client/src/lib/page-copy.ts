import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { DEFAULT_WORKSPACE_LOCALE, type WorkspaceLocale } from "@shared/operator-preferences";
import { resolveRuntimeWorkspaceLocale } from "@/lib/workspace-locale";

type PageSectionCopy = {
  title: string;
  description?: string;
  badges?: Record<string, string>;
};

export type PageCopyCatalog = {
  landing: PageSectionCopy;
  bookDemo: PageSectionCopy;
  startPilot: PageSectionCopy;
  notFound: PageSectionCopy;
  dashboard: PageSectionCopy;
  registry: PageSectionCopy;
  compliance: PageSectionCopy;
  approvals: PageSectionCopy;
  incidents: PageSectionCopy;
  telemetryPolicy: PageSectionCopy;
  runtimeMonitoring: PageSectionCopy;
  analytics: PageSectionCopy;
  billing: PageSectionCopy;
  complianceCalendar: PageSectionCopy;
  decisionTrace: PageSectionCopy;
  exitReadiness: PageSectionCopy;
  myActivity: PageSectionCopy;
  bulkControls: PageSectionCopy;
  telemetryAdapter: PageSectionCopy;
  retentionControl: PageSectionCopy;
  portfolioControl: PageSectionCopy;
  settings: PageSectionCopy;
  auditLog: PageSectionCopy;
  connectAiApplication: PageSectionCopy;
  riskAssessment: PageSectionCopy;
  riskWizard: PageSectionCopy;
  riskResult: PageSectionCopy;
  accountSecurity: PageSectionCopy;
  systemDetail: PageSectionCopy;
  governanceMaturity: PageSectionCopy;
  knowledgeCenter: PageSectionCopy;
  integrations: PageSectionCopy;
  apiDocs: PageSectionCopy;
  trustCenter: PageSectionCopy;
  security: PageSectionCopy;
  privacy: PageSectionCopy;
  terms: PageSectionCopy;
  resetPassword: PageSectionCopy;
  inviteAccept: PageSectionCopy;
  thankYou: PageSectionCopy;
  auth: PageSectionCopy;
};

const ENGLISH_PAGES: PageCopyCatalog = {
  landing: {
    title: "AI CONTROL GRID",
    description: "Runtime AI governance by Acturus: intercept prompts, enforce policy, and cryptographically seal every AI decision before production.",
    badges: {
      productNav: "Product",
      solutionsNav: "Solutions",
      frameworksNav: "Frameworks",
      pricingNav: "Pricing",
      trustCenterNav: "Trust Center",
      docsNav: "Docs",
      signIn: "Sign In",
      bookDemo: "Book a Demo",
      runtimeGovernance: "Developed by ACTURUS",
      heroRibbon: "ACTURUS runtime grid • policy • incidents • evidence",
      heroHeadline: "AI CONTROL GRID",
      heroBody: "Runtime AI governance by Acturus: intercept prompts, enforce policy, and cryptographically seal every AI decision before production.",
      heroAudience: "Founder-built by Revanth Meda for PE funds and regulated enterprises that cannot afford AI guesswork.",
      heroSecondaryCta: "Inspect the enforcement engine",
      heroEvidenceCta: "See the evidence chain",
      runtimeSeal: "Runtime seal",
      runtimeSealBody: "Prompt, output, decision, and incident linkage sealed before release.",
      liveCommandRail: "Live command rail",
      footerDescription:
        "AI CONTROL GRID by ACTURUS brings institutional-grade runtime governance to private equity, regulated operators, and high-consequence enterprise workflows.",
      footerProduct: "Product",
      footerSecurity: "Security",
      footerLegal: "Legal",
      footerContact: "Contact",
      enterpriseDemos: "Enterprise demos",
      securityReviews: "Security reviews",
      support: "Support",
      footerStrip: "AI CONTROL GRID — Developed by ACTURUS • runtime policy • incident operations • cryptographic evidence",
      enterpriseDemoCta: "Book an ACTURUS Demo",
    },
  },
  bookDemo: {
    title: "Book a demo of AI CONTROL GRID by ACTURUS",
    description:
      "See how serious teams run AI governance with workflow, evidence, and audit-ready visibility.",
    badges: {
      ctaLabel: "Book Demo",
      bullet1: "Governance workflow walkthrough in 30 minutes",
      bullet2: "Use-case mapping for your AI portfolio",
      bullet3: "Pilot plan aligned to your risk and compliance needs",
      fullName: "Full name",
      workEmail: "Work email",
      company: "Company",
      role: "Role",
      teamSize: "Team size",
      primaryChallenge: "Primary governance challenge",
      submitting: "Submitting...",
      submitFailed: "Submission failed",
    },
  },
  startPilot: {
    title: "Start an AI CONTROL GRID pilot",
    description:
      "Launch a practical pilot with scoped rollout, clear ownership, and measurable governance outcomes.",
    badges: {
      ctaLabel: "Start Pilot",
      bullet1: "Governance workflow walkthrough in 30 minutes",
      bullet2: "Use-case mapping for your AI portfolio",
      bullet3: "Pilot plan aligned to your risk and compliance needs",
      fullName: "Full name",
      workEmail: "Work email",
      company: "Company",
      role: "Role",
      teamSize: "Team size",
      primaryChallenge: "Primary governance challenge",
      submitting: "Submitting...",
      submitFailed: "Submission failed",
    },
  },
  notFound: {
    title: "Page not found",
    description: "The page you requested does not exist or is no longer available.",
    badges: {
      dashboard: "Go to dashboard",
      home: "Back to home",
    },
  },
  dashboard: {
    title: "Governance operations at a glance",
    description: "Monitor readiness, queue pressure, risk posture, and action paths from one operator surface.",
    badges: { product: "AI CONTROL GRID", queuePending: "Queue pending" },
  },
  registry: {
    title: "AI System Registry",
    description: "Record the systems in scope, who owns them, what they do, and how they are governed.",
  },
  compliance: {
    title: "Compliance Management",
    description: "Evidence-first control tracking across EU AI Act, NIST AI RMF, and ISO/IEC 42001.",
  },
  approvals: {
    title: "Approval Workflows",
    description: "Route AI decisions through reviewer-owned workflows based on financial, privacy, safety, and strategic impact.",
  },
  incidents: {
    title: "AI Incident Response",
    description: "Triage privacy, security, safety, bias, and reliability events with clear containment targets and ownership.",
    badges: {
      open: "Open",
      urgent: "Urgent",
      highSeverity: "High severity",
      slaBreached: "SLA breached",
    },
  },
  telemetryPolicy: {
    title: "Telemetry Policy",
    description: "Configure runtime thresholds, blocking rules, escalation behavior, and tenant-scoped exceptions.",
    badges: {
      scope: "Scope",
      source: "Source",
      inheritedFrom: "Inherited from",
    },
  },
  runtimeMonitoring: {
    title: "Runtime Monitoring",
    description: "Review live runtime decisions and validate what the platform will allow, warn, escalate, or block before traffic reaches users.",
    badges: {
      hero: "Runtime control surface",
      adapterEnabled: "Adapter enabled",
      adapterDisabled: "Adapter disabled",
      blockedEvents: "Blocked events",
      noSystemOverride: "No system override",
      system: "System",
    },
  },
  analytics: {
    title: "Analytics Center",
    description: "Track governance activity, incident pressure, workflow movement, and reporting posture from one analytics surface.",
    badges: { generatedLive: "Generated live" },
  },
  billing: {
    title: "Billing and Subscription",
    description: "Track subscription posture, usage movement, and commercial readiness for governed AI programs.",
    badges: { readiness: "Commercial readiness" },
  },
  complianceCalendar: {
    title: "Compliance Calendar",
    description: "Track deadlines, evidence reminders, and governance milestones across the operating program.",
  },
  decisionTrace: {
    title: "Decision Trace",
    description: "Capture model context, rationale, overrides, and sealed audit records for review-ready AI decisions.",
    badges: { traces: "Traces" },
  },
  exitReadiness: {
    title: "Governance Evidence",
    description: "Review evidence coverage, diligence posture, and documentation completeness across systems and workflows.",
    badges: { diligenceMode: "PilotWave diligence mode" },
  },
  myActivity: {
    title: "My Activity",
    description: "See your assignments, reviews, follow-ups, and current governance workload in one place.",
  },
  bulkControls: {
    title: "Bulk Control Assignment",
    description: "Apply controls across multiple systems faster while keeping control rollout auditable and consistent.",
  },
  telemetryAdapter: {
    title: "Telemetry Adapter",
    description: "Configure ingest posture, key state, examples, and live adapter behavior for governed runtime signals.",
    badges: { profile: "Profile", keyActive: "Key active", noActiveKey: "No active key" },
  },
  retentionControl: {
    title: "Retention Control",
    description: "Inspect retention deadlines, archive state, and legal hold posture for decision records.",
    badges: { workerEnabled: "Retention worker enabled", workerDisabled: "Retention worker disabled" },
  },
  portfolioControl: {
    title: "Portfolio Control",
    description: "Review multi-organization posture, telemetry defaults, and operating company readiness from the portfolio layer.",
    badges: { governance: "Portfolio governance", organizations: "Organizations" },
  },
  settings: {
    title: "Settings",
    description: "Manage identity, domains, invites, activity, operations, and governance workspace preferences.",
  },
  auditLog: {
    title: "Audit Log",
    description: "Review admin, policy, workflow, runtime, and evidence events with traceable timestamps and actors.",
  },
  connectAiApplication: {
    title: "Connect AI Application",
    description: "Guide new systems into the registry with onboarding structure, risk previews, and preserved assessment history.",
    badges: {
      discoveryFirst: "Discovery-first wizard",
      draftCreation: "Draft system creation",
      assessmentHistory: "Assessment history preserved",
    },
  },
  riskAssessment: {
    title: "Risk Assessment",
    description: "Review posture, scoring history, and framework readiness for registered AI systems.",
    badges: {
      trackedFrameworks: "Frameworks tracked",
      operationalSignals: "Operational signals monitored",
    },
  },
  riskWizard: {
    title: "Risk Assessment Wizard",
    description: "Step through guided questions to produce a structured AI risk classification.",
  },
  riskResult: {
    title: "Risk classification result",
    description: "Review the generated classification, rationale, and next governance actions before applying it.",
  },
  accountSecurity: {
    title: "Account Security",
    description: "Manage password, MFA, recovery posture, and account-level security settings.",
  },
  systemDetail: {
    title: "AI System Detail",
    description: "Review ownership, controls, workflows, evidence, and runtime governance configuration for a registered system.",
    badges: {
      owner: "Owner",
      exportEvidence: "Export Evidence",
      overview: "Overview",
      controls: "Controls",
      workflows: "Workflows",
      evidence: "Evidence",
      audit: "Audit",
      notFound: "System not found",
      evidenceFiles: "System Evidence Files",
    },
  },
  governanceMaturity: {
    title: "Governance Maturity",
    description: "Review maturity score, strengths, gaps, and roadmap guidance across the governance program.",
  },
  knowledgeCenter: {
    title: "Knowledge Center",
    description: "Centralized documentation, training tracks, and readiness guidance for Control Grid operators.",
  },
  integrations: {
    title: "Integrations",
    description: "Manage connectors, event routing, threat intelligence, and automation hooks for external governance workflows.",
    badges: {
      connectorExpansion: "Connector expansion enabled",
      disabled: "Disabled",
      configurationIncomplete: "Configuration incomplete",
      jiraReady: "High-risk approvals will open Jira tickets",
      connectors: "Connectors",
      automationRule: "Automation rule",
      highRiskWorkflow: "High priority or high-risk workflow",
      currentState: "Current state",
      connectorCatalog: "Connector catalog",
      threatIntel: "Threat intelligence",
      jiraConnection: "Jira connection",
      eventStream: "Governance event stream",
      remediationHooks: "Automated remediation hooks",
      automationBuilder: "Automation builder",
    },
  },
  apiDocs: {
    title: "API documentation",
    description: "Use the API reference, authentication notes, and integration examples to connect governed systems.",
  },
  trustCenter: {
    title: "Security, governance, and buyer diligence posture",
    description: "Review the product trust posture, control highlights, and due-diligence support materials.",
    badges: { trustCenter: "Trust Center" },
  },
  security: {
    title: "Security Practices",
    description: "Review platform security controls, hardening posture, and operational safeguards.",
  },
  privacy: {
    title: "Privacy Policy",
    description: "Understand how the platform handles data, retention, and privacy obligations.",
  },
  terms: {
    title: "Terms of Service",
    description: "Review the legal terms governing use of the platform and related services.",
  },
  resetPassword: {
    title: "Reset Password",
    description: "Set a new password and recover account access securely.",
  },
  inviteAccept: {
    title: "Accept Invite",
    description: "Join the organization workspace and finish access setup.",
  },
  thankYou: {
    title: "Thanks, your request was received.",
    description: "The team has your request and will follow up using the details provided.",
  },
  auth: {
    title: "Governed AI operations without blind spots",
    description: "Sign in or create an account to manage registry, risk, approvals, runtime controls, and audit evidence.",
  },
};

const FR_PAGES: PageCopyCatalog = {
  ...ENGLISH_PAGES,
  dashboard: { ...ENGLISH_PAGES.dashboard, title: "Opérations de gouvernance en un coup d'œil", description: "Surveillez la préparation, la pression sur la file, la posture de risque et les chemins d'action depuis une seule surface opérateur.", badges: { product: "AI CONTROL GRID", queuePending: "File en attente" } },
  registry: { title: "Registre des systèmes IA", description: "Consignez les systèmes concernés, leurs responsables, leur finalité et leur mode de gouvernance." },
  compliance: { title: "Gestion de la conformité", description: "Suivi des contrôles fondé sur les preuves à travers l'AI Act de l'UE, le NIST AI RMF et l'ISO/IEC 42001." },
  approvals: { title: "Flux d'approbation", description: "Acheminez les décisions IA via des workflows détenus par les réviseurs selon l'impact financier, vie privée, sécurité et stratégie." },
  incidents: { ...ENGLISH_PAGES.incidents, title: "Réponse aux incidents IA", description: "Traitez les événements de confidentialité, sécurité, sûreté, biais et fiabilité avec des objectifs de confinement clairs et une responsabilité explicite.", badges: { open: "Ouverts", urgent: "Urgent", highSeverity: "Sévérité élevée", slaBreached: "SLA dépassé" } },
  telemetryPolicy: { ...ENGLISH_PAGES.telemetryPolicy, title: "Politique de télémétrie", description: "Configurez les seuils runtime, les règles de blocage, l'escalade et les exceptions propres au tenant.", badges: { scope: "Portée", source: "Source", inheritedFrom: "Hérité de" } },
  runtimeMonitoring: { ...ENGLISH_PAGES.runtimeMonitoring, title: "Surveillance runtime", description: "Examinez les décisions runtime en direct et vérifiez ce que la plateforme autorise, avertit, escalade ou bloque avant l'utilisateur final.", badges: { hero: "Surface de contrôle runtime", adapterEnabled: "Adaptateur activé", adapterDisabled: "Adaptateur désactivé", blockedEvents: "Événements bloqués", noSystemOverride: "Aucun remplacement système", system: "Système" } },
  analytics: { ...ENGLISH_PAGES.analytics, title: "Centre analytique", description: "Suivez l'activité de gouvernance, la pression incident, le mouvement des workflows et la posture de reporting.", badges: { generatedLive: "Généré en direct" } },
  settings: { title: "Paramètres", description: "Gérez l'identité, les domaines, les invitations, l'activité, les opérations et les préférences d'espace de gouvernance." },
  landing: { ...ENGLISH_PAGES.landing, title: "AI CONTROL GRID", description: "La gouvernance IA runtime d'Acturus intercepte les prompts, applique les politiques et scelle chaque décision avant la production.", badges: { ...ENGLISH_PAGES.landing.badges, productNav: "Produit", solutionsNav: "Solutions", frameworksNav: "Référentiels", pricingNav: "Tarifs", docsNav: "Docs", signIn: "Se connecter", bookDemo: "Réserver une démo", runtimeGovernance: "Developed by ACTURUS", heroRibbon: "Grid runtime ACTURUS • politiques • incidents • preuves", heroHeadline: "AI CONTROL GRID", heroBody: "La gouvernance IA runtime d'Acturus intercepte les prompts, applique les politiques et scelle chaque décision avant la production.", heroAudience: "Conçu par Revanth Meda pour les fonds PE et les entreprises régulées qui ne peuvent pas se permettre l'approximation IA.", heroSecondaryCta: "Inspecter le moteur d'application", heroEvidenceCta: "Voir la chaîne de preuve", runtimeSeal: "Scellé runtime", liveCommandRail: "Rail de commande en direct", footerProduct: "Produit", footerSecurity: "Sécurité", footerLegal: "Juridique", footerContact: "Contact", enterpriseDemos: "Démos entreprise", securityReviews: "Revues sécurité", support: "Support", footerStrip: "AI CONTROL GRID — Developed by ACTURUS • politiques runtime • opérations incidents • preuves cryptographiques", enterpriseDemoCta: "Réserver une démo ACTURUS" } },
  bookDemo: { ...ENGLISH_PAGES.bookDemo, title: "Réserver une démo d'AI CONTROL GRID", description: "Découvrez comment les équipes exigeantes pilotent la gouvernance IA avec workflow, preuves et visibilité prête pour l'audit.", badges: { ...ENGLISH_PAGES.bookDemo.badges, ctaLabel: "Réserver une démo", fullName: "Nom complet", workEmail: "E-mail professionnel", company: "Entreprise", role: "Rôle", teamSize: "Taille de l'équipe", primaryChallenge: "Défi principal de gouvernance", submitting: "Envoi..." } },
  startPilot: { ...ENGLISH_PAGES.startPilot, title: "Lancer un pilote de gouvernance IA", description: "Lancez un pilote pratique avec périmètre clair, responsabilité définie et résultats mesurables.", badges: { ...ENGLISH_PAGES.startPilot.badges, ctaLabel: "Lancer le pilote", fullName: "Nom complet", workEmail: "E-mail professionnel", company: "Entreprise", role: "Rôle", teamSize: "Taille de l'équipe", primaryChallenge: "Défi principal de gouvernance", submitting: "Envoi..." } },
  notFound: { ...ENGLISH_PAGES.notFound, title: "Page introuvable", description: "La page demandée n'existe pas ou n'est plus disponible.", badges: { dashboard: "Aller au tableau de bord", home: "Retour à l'accueil" } },
  systemDetail: { ...ENGLISH_PAGES.systemDetail, title: "Détail du système IA", description: "Examinez la propriété, les contrôles, les workflows, les preuves et la configuration runtime du système.", badges: { ...ENGLISH_PAGES.systemDetail.badges, owner: "Responsable", exportEvidence: "Exporter les preuves", overview: "Vue d'ensemble", controls: "Contrôles", workflows: "Workflows", evidence: "Preuves", audit: "Audit", notFound: "Système introuvable", evidenceFiles: "Fichiers de preuve du système" } },
  integrations: { ...ENGLISH_PAGES.integrations, title: "Intégrations", description: "Gérez les connecteurs, le routage d'événements, la threat intelligence et les automatisations externes.", badges: { ...ENGLISH_PAGES.integrations.badges, connectorExpansion: "Extension des connecteurs activée", disabled: "Désactivé", configurationIncomplete: "Configuration incomplète", jiraReady: "Les approbations à haut risque ouvriront des tickets Jira", connectors: "Connecteurs", automationRule: "Règle d'automatisation", highRiskWorkflow: "Workflow haute priorité ou à haut risque", currentState: "État actuel", connectorCatalog: "Catalogue des connecteurs", threatIntel: "Threat intelligence", jiraConnection: "Connexion Jira", eventStream: "Flux d'événements de gouvernance", remediationHooks: "Hooks de remédiation automatisée", automationBuilder: "Constructeur d'automatisation" } },
  knowledgeCenter: { title: "Centre de connaissances", description: "Documentation centralisée, parcours de formation et repères de préparation pour les opérateurs Control Grid." },
  governanceMaturity: { title: "Maturité de gouvernance", description: "Examinez le score de maturité, les forces, les lacunes et la feuille de route du programme." },
  trustCenter: { ...ENGLISH_PAGES.trustCenter, title: "Posture sécurité, gouvernance et diligence acheteur", description: "Consultez la posture de confiance produit, les contrôles clés et les supports de diligence.", badges: { trustCenter: "Trust Center" } },
  security: { title: "Pratiques de sécurité", description: "Consultez les contrôles de sécurité, le durcissement et les garde-fous opérationnels." },
  privacy: { title: "Politique de confidentialité", description: "Comprenez comment la plateforme gère les données, la rétention et les obligations de confidentialité." },
  terms: { title: "Conditions d'utilisation", description: "Consultez les conditions juridiques d'utilisation de la plateforme et des services associés." },
  resetPassword: { title: "Réinitialiser le mot de passe", description: "Définissez un nouveau mot de passe et récupérez l'accès au compte en toute sécurité." },
  inviteAccept: { title: "Accepter l'invitation", description: "Rejoignez l'espace de travail de l'organisation et terminez la configuration d'accès." },
  thankYou: { title: "Merci, votre demande a été reçue.", description: "L'équipe a bien reçu votre demande et reviendra vers vous avec les informations fournies." },
  auth: { title: "Des opérations IA gouvernées sans angle mort", description: "Connectez-vous ou créez un compte pour gérer registre, risque, approbations, contrôles runtime et preuves d'audit." },
};

const DE_PAGES: PageCopyCatalog = {
  ...ENGLISH_PAGES,
  dashboard: { ...ENGLISH_PAGES.dashboard, title: "Governance-Betrieb auf einen Blick", description: "Überwachen Sie Reifegrad, Warteschlangendruck, Risikoposition und Aktionspfade in einer Operator-Oberfläche.", badges: { product: "AI CONTROL GRID", queuePending: "Warteschlange offen" } },
  registry: { title: "KI-Systemregister", description: "Erfassen Sie betroffene Systeme, Verantwortliche, Zweck und Governance-Status." },
  compliance: { title: "Compliance-Management", description: "Nachweisbasierte Kontrollverfolgung über EU AI Act, NIST AI RMF und ISO/IEC 42001." },
  approvals: { title: "Freigabe-Workflows", description: "Leiten Sie KI-Entscheidungen je nach Finanz-, Datenschutz-, Sicherheits- und Strategieauswirkung durch Reviewer-Workflows." },
  incidents: { ...ENGLISH_PAGES.incidents, title: "KI-Vorfallmanagement", description: "Bearbeiten Sie Datenschutz-, Sicherheits-, Bias- und Zuverlässigkeitsereignisse mit klaren Eindämmungszielen und Zuständigkeiten.", badges: { open: "Offen", urgent: "Dringend", highSeverity: "Hohe Schwere", slaBreached: "SLA verletzt" } },
  telemetryPolicy: { ...ENGLISH_PAGES.telemetryPolicy, title: "Telemetry-Richtlinie", description: "Konfigurieren Sie Runtime-Schwellen, Blockierungsregeln, Eskalationen und tenant-spezifische Ausnahmen.", badges: { scope: "Geltungsbereich", source: "Quelle", inheritedFrom: "Geerbt von" } },
  runtimeMonitoring: { ...ENGLISH_PAGES.runtimeMonitoring, title: "Runtime-Überwachung", description: "Prüfen Sie Live-Entscheidungen und validieren Sie, was die Plattform zulässt, warnt, eskaliert oder blockiert, bevor Nutzerverkehr ankommt.", badges: { hero: "Runtime-Kontrollfläche", adapterEnabled: "Adapter aktiv", adapterDisabled: "Adapter inaktiv", blockedEvents: "Blockierte Ereignisse", noSystemOverride: "Kein System-Override", system: "System" } },
  analytics: { ...ENGLISH_PAGES.analytics, title: "Analysezentrum", description: "Verfolgen Sie Governance-Aktivität, Vorfalldruck, Workflow-Bewegung und Reporting-Status.", badges: { generatedLive: "Live erzeugt" } },
  settings: { title: "Einstellungen", description: "Verwalten Sie Identität, Domains, Einladungen, Aktivität, Betrieb und Governance-Arbeitsbereichspräferenzen." },
  landing: { ...ENGLISH_PAGES.landing, title: "AI CONTROL GRID", description: "Runtime-Governance für KI von Acturus: Prompts abfangen, Richtlinien durchsetzen und Entscheidungen vor Produktion kryptographisch versiegeln.", badges: { ...ENGLISH_PAGES.landing.badges, productNav: "Produkt", solutionsNav: "Lösungen", frameworksNav: "Rahmenwerke", pricingNav: "Preise", docsNav: "Doku", signIn: "Anmelden", bookDemo: "Demo buchen", runtimeGovernance: "Developed by ACTURUS", heroRibbon: "ACTURUS Runtime Grid • Richtlinien • Incidents • Nachweise", heroHeadline: "AI CONTROL GRID", heroBody: "Runtime-Governance für KI von Acturus: Prompts abfangen, Richtlinien durchsetzen und Entscheidungen vor Produktion kryptographisch versiegeln.", heroAudience: "Von Revanth Meda für PE-Fonds und regulierte Unternehmen entwickelt, die sich KI-Raten nicht leisten können.", heroSecondaryCta: "Enforcement-Engine ansehen", heroEvidenceCta: "Nachweiskette ansehen", runtimeSeal: "Runtime-Siegel", liveCommandRail: "Live-Kommandoschiene", footerProduct: "Produkt", footerSecurity: "Sicherheit", footerLegal: "Recht", footerContact: "Kontakt", enterpriseDemos: "Enterprise-Demos", securityReviews: "Security Reviews", support: "Support", footerStrip: "AI CONTROL GRID — Developed by ACTURUS • Runtime-Richtlinie • Incident-Betrieb • Nachweise", enterpriseDemoCta: "ACTURUS-Demo buchen" } },
  bookDemo: { ...ENGLISH_PAGES.bookDemo, title: "Demo von AI CONTROL GRID buchen", description: "Sehen Sie, wie anspruchsvolle Teams KI-Governance mit Workflow, Nachweisen und auditfähiger Transparenz betreiben.", badges: { ...ENGLISH_PAGES.bookDemo.badges, ctaLabel: "Demo buchen", fullName: "Vollständiger Name", workEmail: "Geschäftliche E-Mail", company: "Unternehmen", role: "Rolle", teamSize: "Teamgröße", primaryChallenge: "Wichtigste Governance-Herausforderung", submitting: "Wird gesendet..." } },
  startPilot: { ...ENGLISH_PAGES.startPilot, title: "KI-Governance-Pilot starten", description: "Starten Sie einen praktischen Piloten mit klarem Umfang, Verantwortung und messbaren Ergebnissen.", badges: { ...ENGLISH_PAGES.startPilot.badges, ctaLabel: "Pilot starten", fullName: "Vollständiger Name", workEmail: "Geschäftliche E-Mail", company: "Unternehmen", role: "Rolle", teamSize: "Teamgröße", primaryChallenge: "Wichtigste Governance-Herausforderung", submitting: "Wird gesendet..." } },
  notFound: { ...ENGLISH_PAGES.notFound, title: "Seite nicht gefunden", description: "Die angeforderte Seite existiert nicht oder ist nicht mehr verfügbar.", badges: { dashboard: "Zum Dashboard", home: "Zur Startseite" } },
  systemDetail: { ...ENGLISH_PAGES.systemDetail, title: "Details zum KI-System", description: "Prüfen Sie Eigentümerschaft, Kontrollen, Workflows, Nachweise und Runtime-Governance-Konfiguration des Systems.", badges: { ...ENGLISH_PAGES.systemDetail.badges, owner: "Verantwortlich", exportEvidence: "Nachweise exportieren", overview: "Überblick", controls: "Kontrollen", workflows: "Workflows", evidence: "Nachweise", audit: "Audit", notFound: "System nicht gefunden", evidenceFiles: "Systemnachweise" } },
  integrations: { ...ENGLISH_PAGES.integrations, title: "Integrationen", description: "Verwalten Sie Konnektoren, Event-Routing, Threat Intelligence und externe Automatisierung.", badges: { ...ENGLISH_PAGES.integrations.badges, connectorExpansion: "Konnektorerweiterung aktiviert", disabled: "Deaktiviert", configurationIncomplete: "Konfiguration unvollständig", jiraReady: "Hochriskante Freigaben öffnen Jira-Tickets", connectors: "Konnektoren", automationRule: "Automatisierungsregel", highRiskWorkflow: "Workflow mit hoher Priorität oder hohem Risiko", currentState: "Aktueller Zustand", connectorCatalog: "Konnektorkatalog", threatIntel: "Threat Intelligence", jiraConnection: "Jira-Verbindung", eventStream: "Governance-Eventstream", remediationHooks: "Automatisierte Remediation-Hooks", automationBuilder: "Automatisierungs-Builder" } },
  knowledgeCenter: { title: "Wissenscenter", description: "Zentrale Dokumentation, Lernpfade und Reifeleitfäden für Control Grid-Operatoren." },
  governanceMaturity: { title: "Governance-Reifegrad", description: "Prüfen Sie Reifegradscore, Stärken, Lücken und Roadmap des Programms." },
  trustCenter: { ...ENGLISH_PAGES.trustCenter, title: "Sicherheits-, Governance- und Due-Diligence-Position", description: "Prüfen Sie Vertrauensstatus, Kontrollhighlights und Due-Diligence-Unterlagen.", badges: { trustCenter: "Trust Center" } },
  security: { title: "Sicherheitspraktiken", description: "Prüfen Sie Sicherheitskontrollen, Härtung und operative Schutzmaßnahmen." },
  privacy: { title: "Datenschutzerklärung", description: "Verstehen Sie, wie die Plattform Daten, Aufbewahrung und Datenschutzpflichten behandelt." },
  terms: { title: "Nutzungsbedingungen", description: "Prüfen Sie die rechtlichen Bedingungen für die Nutzung der Plattform und zugehöriger Dienste." },
  resetPassword: { title: "Passwort zurücksetzen", description: "Setzen Sie ein neues Passwort und stellen Sie den Kontozugang sicher wieder her." },
  inviteAccept: { title: "Einladung annehmen", description: "Treten Sie dem Organisationsarbeitsbereich bei und schließen Sie die Zugangs-Einrichtung ab." },
  thankYou: { title: "Danke, Ihre Anfrage wurde empfangen.", description: "Das Team hat Ihre Anfrage erhalten und meldet sich mit den angegebenen Daten." },
  auth: { title: "Governed AI Operations ohne blinde Flecken", description: "Melden Sie sich an oder erstellen Sie ein Konto, um Register, Risiko, Freigaben, Runtime-Kontrollen und Audit-Nachweise zu verwalten." },
};

const ES_PAGES: PageCopyCatalog = {
  ...ENGLISH_PAGES,
  dashboard: { ...ENGLISH_PAGES.dashboard, title: "Operaciones de gobernanza de un vistazo", description: "Supervisa preparación, presión de cola, postura de riesgo y rutas de acción desde una sola superficie operativa.", badges: { product: "AI CONTROL GRID", queuePending: "Cola pendiente" } },
  registry: { title: "Registro de sistemas IA", description: "Registra los sistemas en alcance, sus responsables, lo que hacen y cómo se gobiernan." },
  compliance: { title: "Gestión de cumplimiento", description: "Seguimiento de controles basado en evidencia para EU AI Act, NIST AI RMF e ISO/IEC 42001." },
  approvals: { title: "Flujos de aprobación", description: "Enruta decisiones de IA por flujos de revisión según impacto financiero, privacidad, seguridad y estrategia." },
  incidents: { ...ENGLISH_PAGES.incidents, title: "Respuesta a incidentes de IA", description: "Gestiona eventos de privacidad, seguridad, sesgo y fiabilidad con objetivos claros de contención y propiedad.", badges: { open: "Abiertos", urgent: "Urgente", highSeverity: "Alta severidad", slaBreached: "SLA incumplido" } },
  telemetryPolicy: { ...ENGLISH_PAGES.telemetryPolicy, title: "Política de telemetría", description: "Configura umbrales en tiempo real, reglas de bloqueo, comportamiento de escalado y excepciones por tenant.", badges: { scope: "Alcance", source: "Fuente", inheritedFrom: "Heredado de" } },
  runtimeMonitoring: { ...ENGLISH_PAGES.runtimeMonitoring, title: "Monitorización en tiempo real", description: "Revisa decisiones de runtime en vivo y valida qué permitirá, advertirá, escalará o bloqueará la plataforma antes de llegar al usuario.", badges: { hero: "Superficie de control runtime", adapterEnabled: "Adaptador activo", adapterDisabled: "Adaptador inactivo", blockedEvents: "Eventos bloqueados", noSystemOverride: "Sin override de sistema", system: "Sistema" } },
  analytics: { ...ENGLISH_PAGES.analytics, title: "Centro analítico", description: "Sigue actividad de gobernanza, presión de incidentes, movimiento de flujos y postura de informes.", badges: { generatedLive: "Generado en vivo" } },
  settings: { title: "Configuración", description: "Gestiona identidad, dominios, invitaciones, actividad, operaciones y preferencias del espacio de gobernanza." },
  landing: { ...ENGLISH_PAGES.landing, title: "AI CONTROL GRID", description: "Gobernanza de IA en runtime de Acturus: intercepta prompts, aplica políticas y sella cada decisión antes de producción.", badges: { ...ENGLISH_PAGES.landing.badges, productNav: "Producto", solutionsNav: "Soluciones", frameworksNav: "Marcos", pricingNav: "Precios", docsNav: "Documentos", signIn: "Iniciar sesión", bookDemo: "Reservar demo", runtimeGovernance: "Developed by ACTURUS", heroRibbon: "Grid runtime ACTURUS • políticas • incidentes • evidencia", heroHeadline: "AI CONTROL GRID", heroBody: "Gobernanza de IA en runtime de Acturus: intercepta prompts, aplica políticas y sella cada decisión antes de producción.", heroAudience: "Construido por Revanth Meda para fondos PE y empresas reguladas que no pueden permitirse improvisar con IA.", heroSecondaryCta: "Inspeccionar el motor de control", heroEvidenceCta: "Ver la cadena de evidencia", runtimeSeal: "Sello runtime", liveCommandRail: "Rail de mando en vivo", footerProduct: "Producto", footerSecurity: "Seguridad", footerLegal: "Legal", footerContact: "Contacto", enterpriseDemos: "Demos empresariales", securityReviews: "Revisiones de seguridad", support: "Soporte", footerStrip: "AI CONTROL GRID — Developed by ACTURUS • política runtime • incidentes • evidencia criptográfica", enterpriseDemoCta: "Reservar demo de ACTURUS" } },
  bookDemo: { ...ENGLISH_PAGES.bookDemo, title: "Reserva una demo de AI CONTROL GRID", description: "Descubre cómo los equipos exigentes operan la gobernanza de IA con workflow, evidencia y visibilidad lista para auditoría.", badges: { ...ENGLISH_PAGES.bookDemo.badges, ctaLabel: "Reservar demo", fullName: "Nombre completo", workEmail: "Correo laboral", company: "Empresa", role: "Rol", teamSize: "Tamaño del equipo", primaryChallenge: "Principal reto de gobernanza", submitting: "Enviando..." } },
  startPilot: { ...ENGLISH_PAGES.startPilot, title: "Inicia un piloto de gobernanza de IA", description: "Lanza un piloto práctico con alcance acotado, responsabilidad clara y resultados medibles.", badges: { ...ENGLISH_PAGES.startPilot.badges, ctaLabel: "Iniciar piloto", fullName: "Nombre completo", workEmail: "Correo laboral", company: "Empresa", role: "Rol", teamSize: "Tamaño del equipo", primaryChallenge: "Principal reto de gobernanza", submitting: "Enviando..." } },
  notFound: { ...ENGLISH_PAGES.notFound, title: "Página no encontrada", description: "La página solicitada no existe o ya no está disponible.", badges: { dashboard: "Ir al panel", home: "Volver al inicio" } },
  systemDetail: { ...ENGLISH_PAGES.systemDetail, title: "Detalle del sistema de IA", description: "Revisa propiedad, controles, workflows, evidencia y configuración runtime del sistema registrado.", badges: { ...ENGLISH_PAGES.systemDetail.badges, owner: "Responsable", exportEvidence: "Exportar evidencia", overview: "Resumen", controls: "Controles", workflows: "Workflows", evidence: "Evidencia", audit: "Auditoría", notFound: "Sistema no encontrado", evidenceFiles: "Archivos de evidencia del sistema" } },
  integrations: { ...ENGLISH_PAGES.integrations, title: "Integraciones", description: "Gestiona conectores, enrutamiento de eventos, threat intelligence y automatización externa.", badges: { ...ENGLISH_PAGES.integrations.badges, connectorExpansion: "Expansión de conectores activa", disabled: "Desactivado", configurationIncomplete: "Configuración incompleta", jiraReady: "Las aprobaciones de alto riesgo abrirán tickets en Jira", connectors: "Conectores", automationRule: "Regla de automatización", highRiskWorkflow: "Workflow de alta prioridad o alto riesgo", currentState: "Estado actual", connectorCatalog: "Catálogo de conectores", threatIntel: "Threat intelligence", jiraConnection: "Conexión Jira", eventStream: "Flujo de eventos de gobernanza", remediationHooks: "Ganchos de remediación automatizada", automationBuilder: "Constructor de automatización" } },
  knowledgeCenter: { title: "Centro de conocimiento", description: "Documentación centralizada, rutas de aprendizaje y guías de preparación para operadores de Control Grid." },
  governanceMaturity: { title: "Madurez de gobernanza", description: "Revisa puntuación, fortalezas, brechas y hoja de ruta del programa." },
  trustCenter: { ...ENGLISH_PAGES.trustCenter, title: "Postura de seguridad, gobernanza y diligencia del comprador", description: "Revisa la postura de confianza del producto, controles destacados y materiales de diligencia.", badges: { trustCenter: "Trust Center" } },
  security: { title: "Prácticas de seguridad", description: "Revisa controles de seguridad, endurecimiento y salvaguardas operativas." },
  privacy: { title: "Política de privacidad", description: "Comprende cómo la plataforma gestiona datos, retención y obligaciones de privacidad." },
  terms: { title: "Términos del servicio", description: "Revisa las condiciones legales para usar la plataforma y servicios relacionados." },
  resetPassword: { title: "Restablecer contraseña", description: "Define una nueva contraseña y recupera el acceso de forma segura." },
  inviteAccept: { title: "Aceptar invitación", description: "Únete al espacio de trabajo de la organización y completa la configuración de acceso." },
  thankYou: { title: "Gracias, hemos recibido tu solicitud.", description: "El equipo ya tiene tu solicitud y responderá usando los datos proporcionados." },
  auth: { title: "Operaciones de IA gobernadas sin puntos ciegos", description: "Inicia sesión o crea una cuenta para gestionar registro, riesgo, aprobaciones, controles runtime y evidencia de auditoría." },
};

const COPY_BY_LOCALE: Record<WorkspaceLocale, PageCopyCatalog> = {
  "en-GB": ENGLISH_PAGES,
  "en-US": ENGLISH_PAGES,
  "fr-FR": FR_PAGES,
  "de-DE": DE_PAGES,
  "es-ES": ES_PAGES,
};

export function resolvePageCopy(locale?: WorkspaceLocale | null) {
  const resolvedLocale = resolveRuntimeWorkspaceLocale(locale);
  return COPY_BY_LOCALE[resolvedLocale] ?? COPY_BY_LOCALE[DEFAULT_WORKSPACE_LOCALE];
}

export function usePageCopy() {
  const { user } = useAuth();
  const locale = resolveRuntimeWorkspaceLocale(user?.currentOrganizationOnboarding?.workspaceLocale);
  return useMemo(() => resolvePageCopy(locale), [locale]);
}
