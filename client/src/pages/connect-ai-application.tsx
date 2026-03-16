import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronLeft,
  Cpu,
  Fingerprint,
  PlugZap,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const booleanOptions = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
] as const;

const defaultForm = {
  systemName: "",
  owner: "",
  department: "",
  purpose: "",
  vendor: "",
  provider: "",
  modelName: "",
  modelType: "",
  gateway: "",
  deploymentContext: "Production",
  intendedUse: "decision_support",
  domain: "general",
  personalData: "none",
  usersImpacted: "under_1k",
  decisionImpact: "minor",
  humanOversight: "in_loop",
  geography: "other",
  biometricUse: "no",
  vulnerableGroups: "no",
  customerFacing: "no",
  productionTraffic: "yes",
  piiExposureObserved: "no",
  safetyAlertsObserved: "no",
  biasAlertsObserved: "no",
};

const wizardSteps = [
  {
    key: "discovery",
    title: "Discovery snapshot",
    description: "Review the runtime and integration context already inferred from the SDK or telemetry adapter.",
  },
  {
    key: "business",
    title: "Business context",
    description: "Confirm the purpose, owner, and operating context of the AI application.",
  },
  {
    key: "governance",
    title: "Governance confirmation",
    description: "Finish the compliance-impact fields needed for defensible classification.",
  },
] as const;

type InferenceConfidence = "high" | "medium" | "review";

type FieldInference = {
  confidence: InferenceConfidence;
  reason: string;
};

function badgeVariantForConfidence(confidence: InferenceConfidence) {
  if (confidence === "high") return "default" as const;
  if (confidence === "medium") return "secondary" as const;
  return "outline" as const;
}

function confidenceLabel(confidence: InferenceConfidence) {
  if (confidence === "high") return "Auto-detected";
  if (confidence === "medium") return "Inferred";
  return "Review needed";
}

function buildFieldInferences(searchParams: URLSearchParams): Partial<Record<keyof typeof defaultForm, FieldInference>> {
  const fields: Partial<Record<keyof typeof defaultForm, FieldInference>> = {};
  const set = (key: keyof typeof defaultForm, confidence: InferenceConfidence, reason: string) => {
    fields[key] = { confidence, reason };
  };

  if (searchParams.get("provider")) set("provider", "high", "Observed from runtime telemetry or SDK onboarding context.");
  if (searchParams.get("modelName")) set("modelName", "high", "Observed from runtime telemetry or SDK onboarding context.");
  if (searchParams.get("gateway")) set("gateway", "high", "Observed from the connected gateway configuration.");
  if (searchParams.get("deploymentContext")) set("deploymentContext", "medium", "Inferred from runtime environment or SDK connection path.");
  if (searchParams.get("purpose")) set("purpose", "medium", "Prefilled from runtime summary text and should be confirmed.");
  if (searchParams.get("domain")) set("domain", "medium", "Inferred from runtime channel, summary, or prompt content.");
  if (searchParams.get("customerFacing") === "yes") set("customerFacing", "medium", "Inferred from runtime channel and interaction pattern.");
  if (searchParams.get("personalData") && searchParams.get("personalData") !== "none") set("personalData", "medium", "Inferred from observed data-sensitivity signals.");
  if (searchParams.get("decisionImpact")) set("decisionImpact", "review", "Suggested from runtime purpose and domain. Confirm before classification.");
  if (searchParams.get("geography") && searchParams.get("geography") !== "other") set("geography", "medium", "Inferred from runtime region or deployment context.");
  if (searchParams.get("productionTraffic") === "yes") set("productionTraffic", "high", "Observed from runtime telemetry.");
  if (searchParams.get("piiExposureObserved") === "yes") set("piiExposureObserved", "high", "Observed in runtime telemetry.");
  if (searchParams.get("safetyAlertsObserved") === "yes") set("safetyAlertsObserved", "high", "Observed in runtime telemetry.");
  if (searchParams.get("biasAlertsObserved") === "yes") set("biasAlertsObserved", "high", "Observed in runtime telemetry.");

  return fields;
}

function derivePreviewAnswers(form: typeof defaultForm) {
  let personalData = form.personalData;
  if (form.piiExposureObserved === "yes") {
    personalData = personalData === "none" ? "basic" : personalData === "basic" ? "sensitive" : personalData;
  }

  let humanOversight = form.humanOversight;
  if (form.customerFacing === "yes" && humanOversight === "full_control") {
    humanOversight = "in_loop";
  }

  let intendedUse = form.intendedUse;
  if (form.customerFacing === "yes" && intendedUse === "automation") {
    intendedUse = "decision_support";
  }

  return {
    intendedUse,
    domain: form.domain,
    personalData,
    usersImpacted: form.usersImpacted,
    decisionImpact: form.decisionImpact,
    humanOversight,
    geography: form.geography,
    biometricUse: form.biometricUse,
    vulnerableGroups: form.vulnerableGroups,
    purpose: form.purpose,
  };
}

function buildRiskPreview(answers: ReturnType<typeof derivePreviewAnswers>) {
  let score = 0;
  const factors: string[] = [];
  const suggestedControls: string[] = [];

  if (answers.intendedUse === "autonomous_decisions") {
    score += 30;
    factors.push("Autonomous decision-making");
  } else if (answers.intendedUse === "decision_support") {
    score += 15;
    factors.push("Decision-support usage");
  } else if (answers.intendedUse === "automation") {
    score += 10;
    factors.push("Operational automation");
  }

  if (answers.domain === "healthcare" || answers.domain === "law_enforcement") {
    score += 25;
    factors.push(`High-stakes domain: ${answers.domain}`);
  } else if (["finance", "employment", "education"].includes(answers.domain)) {
    score += 20;
    factors.push(`Regulated domain: ${answers.domain}`);
  } else if (answers.domain === "critical_infrastructure") {
    score += 25;
    factors.push("Critical infrastructure usage");
  } else if (answers.domain === "general") {
    score += 5;
    factors.push("General-purpose application");
  }

  if (answers.personalData === "special_category") {
    score += 20;
    factors.push("Special category personal data");
  } else if (answers.personalData === "sensitive") {
    score += 15;
    factors.push("Sensitive personal data");
  } else if (answers.personalData === "basic") {
    score += 8;
    factors.push("Basic personal data");
  }

  if (answers.usersImpacted === "over_100k") {
    score += 15;
    factors.push("Large user impact");
  } else if (answers.usersImpacted === "10k_100k") {
    score += 10;
    factors.push("Medium-large user impact");
  } else if (answers.usersImpacted === "1k_10k") {
    score += 5;
    factors.push("Moderate user impact");
  }

  if (answers.decisionImpact === "legal_significant") {
    score += 20;
    factors.push("Legally or materially significant decisions");
  } else if (answers.decisionImpact === "material") {
    score += 10;
    factors.push("Material decision impact");
  } else if (answers.decisionImpact === "minor") {
    score += 4;
    factors.push("Minor decision impact");
  }

  if (answers.humanOversight === "none") {
    score += 15;
    factors.push("No human oversight");
  } else if (answers.humanOversight === "post_hoc") {
    score += 10;
    factors.push("Post-hoc oversight only");
  } else if (answers.humanOversight === "in_loop") {
    score += 5;
    factors.push("Human in the loop");
  }

  if (answers.geography === "eu" || answers.geography === "global") {
    score += 5;
    factors.push("Cross-border or EU governance exposure");
  }

  if (answers.biometricUse === "yes") {
    score += 20;
    factors.push("Biometric usage");
  }

  if (answers.vulnerableGroups === "yes") {
    score += 15;
    factors.push("Affects vulnerable groups");
  }

  if (score >= 80) {
    suggestedControls.push(
      "Governance committee approval",
      "Continuous telemetry monitoring",
      "Decision trace and outcome logging",
      "Human-in-the-loop review",
    );
    return { riskLevel: "high", score, factors, suggestedControls };
  }

  if (score >= 45) {
    suggestedControls.push(
      "Risk owner review",
      "Documented oversight procedure",
      "Quarterly reassessment cadence",
    );
    return { riskLevel: "medium", score, factors, suggestedControls };
  }

  suggestedControls.push(
    "Baseline control mapping",
    "Standard operational logging",
    "Annual reassessment",
  );
  return { riskLevel: "low", score, factors, suggestedControls };
}

function calculateIntakeConfidence(
  form: typeof defaultForm,
  fieldInferences: Partial<Record<keyof typeof defaultForm, FieldInference>>,
) {
  const keys: Array<keyof typeof defaultForm> = [
    "systemName",
    "owner",
    "purpose",
    "provider",
    "modelName",
    "gateway",
    "domain",
    "personalData",
    "decisionImpact",
    "humanOversight",
    "geography",
    "customerFacing",
  ];

  let total = 0;
  let resolved = 0;
  let autoDetected = 0;
  let inferred = 0;
  let reviewNeeded = 0;
  let manual = 0;

  for (const key of keys) {
    total += 1;
    const rawValue = form[key];
    const value = typeof rawValue === "string" ? rawValue.trim() : rawValue;
    if (!value) continue;

    const inference = fieldInferences[key];
    if (!inference) {
      resolved += 0.85;
      manual += 1;
      continue;
    }

    if (inference.confidence === "high") {
      resolved += 1;
      autoDetected += 1;
    } else if (inference.confidence === "medium") {
      resolved += 0.75;
      inferred += 1;
    } else {
      resolved += 0.5;
      reviewNeeded += 1;
    }
  }

  return {
    score: Math.round((resolved / total) * 100),
    autoDetected,
    inferred,
    reviewNeeded,
    manual,
  };
}

type AutoRegistrationResponse = {
  system: {
    id: string;
    name: string;
    riskLevel: string;
    status: string;
  };
  assessment: {
    id: string;
    riskOutcome: string;
    riskScore: number;
    riskExplanation: string;
    suggestedControls: string[] | null;
  };
  derivedAnswers: Record<string, unknown>;
};

export default function ConnectAiApplicationPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [form, setForm] = useState(() => {
    const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
    return {
      ...defaultForm,
      systemName: searchParams.get("systemName") ?? defaultForm.systemName,
      owner: searchParams.get("owner") ?? defaultForm.owner,
      department: searchParams.get("department") ?? defaultForm.department,
      purpose: searchParams.get("purpose") ?? defaultForm.purpose,
      vendor: searchParams.get("vendor") ?? defaultForm.vendor,
      provider: searchParams.get("provider") ?? defaultForm.provider,
      modelName: searchParams.get("modelName") ?? defaultForm.modelName,
      modelType: searchParams.get("modelType") ?? defaultForm.modelType,
      gateway: searchParams.get("gateway") ?? defaultForm.gateway,
      deploymentContext: searchParams.get("deploymentContext") ?? defaultForm.deploymentContext,
      intendedUse: searchParams.get("intendedUse") ?? defaultForm.intendedUse,
      domain: searchParams.get("domain") ?? defaultForm.domain,
      personalData: searchParams.get("personalData") ?? defaultForm.personalData,
      usersImpacted: searchParams.get("usersImpacted") ?? defaultForm.usersImpacted,
      decisionImpact: searchParams.get("decisionImpact") ?? defaultForm.decisionImpact,
      humanOversight: searchParams.get("humanOversight") ?? defaultForm.humanOversight,
      geography: searchParams.get("geography") ?? defaultForm.geography,
      biometricUse: searchParams.get("biometricUse") === "yes" ? "yes" : defaultForm.biometricUse,
      vulnerableGroups: searchParams.get("vulnerableGroups") === "yes" ? "yes" : defaultForm.vulnerableGroups,
      customerFacing: searchParams.get("customerFacing") === "yes" ? "yes" : defaultForm.customerFacing,
      productionTraffic: searchParams.get("productionTraffic") === "no" ? "no" : defaultForm.productionTraffic,
      piiExposureObserved: searchParams.get("piiExposureObserved") === "yes" ? "yes" : defaultForm.piiExposureObserved,
      safetyAlertsObserved: searchParams.get("safetyAlertsObserved") === "yes" ? "yes" : defaultForm.safetyAlertsObserved,
      biasAlertsObserved: searchParams.get("biasAlertsObserved") === "yes" ? "yes" : defaultForm.biasAlertsObserved,
    };
  });
  const [result, setResult] = useState<AutoRegistrationResponse | null>(null);
  const [currentStep, setCurrentStep] = useState(0);

  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const isSdkPrefilled = searchParams.get("source") === "sdk";
  const fieldInferences = buildFieldInferences(searchParams);

  const discoverySummary = useMemo(() => {
    const signals = [] as string[];
    if (form.productionTraffic === "yes") signals.push("production traffic observed");
    if (form.customerFacing === "yes") signals.push("customer-facing experience");
    if (form.piiExposureObserved === "yes") signals.push("PII exposure observed");
    if (form.safetyAlertsObserved === "yes") signals.push("safety alerts observed");
    if (form.biasAlertsObserved === "yes") signals.push("bias alerts observed");
    return signals;
  }, [form]);

  const discoveryFields = useMemo(
    () =>
      [
        { label: "Provider", value: form.provider || "Not detected yet" },
        { label: "Model", value: form.modelName || "Not detected yet" },
        { label: "Gateway", value: form.gateway || "Not detected yet" },
        { label: "Deployment context", value: form.deploymentContext || "Not detected yet" },
        { label: "Traffic", value: form.productionTraffic === "yes" ? "Production observed" : "No production signal yet" },
        { label: "PII signal", value: form.piiExposureObserved === "yes" ? "Observed" : "Not observed" },
        { label: "Safety signal", value: form.safetyAlertsObserved === "yes" ? "Observed" : "Not observed" },
        { label: "Bias signal", value: form.biasAlertsObserved === "yes" ? "Observed" : "Not observed" },
      ] as const,
    [form],
  );

  const resolvedFieldCount = useMemo(() => {
    return [
      form.systemName,
      form.owner,
      form.department,
      form.purpose,
      form.provider,
      form.modelName,
      form.gateway,
      form.domain,
      form.personalData,
      form.usersImpacted,
      form.decisionImpact,
      form.humanOversight,
      form.geography,
    ].filter(Boolean).length;
  }, [form]);

  const completionPercent = Math.round((resolvedFieldCount / 13) * 100);
  const intakeConfidence = useMemo(() => calculateIntakeConfidence(form, fieldInferences), [form, fieldInferences]);
  const previewAnswers = useMemo(() => derivePreviewAnswers(form), [form]);
  const riskPreview = useMemo(() => buildRiskPreview(previewAnswers), [previewAnswers]);

  const stepCanAdvance = useMemo(() => {
    if (currentStep === 0) return Boolean(form.systemName || form.provider || form.gateway || form.modelName);
    if (currentStep === 1) return Boolean(form.systemName && form.owner && form.purpose);
    return true;
  }, [currentStep, form]);

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/ai-systems/auto-register", {
        systemName: form.systemName,
        owner: form.owner,
        department: form.department || undefined,
        purpose: form.purpose,
        vendor: form.vendor || undefined,
        provider: form.provider || undefined,
        modelName: form.modelName || undefined,
        modelType: form.modelType || undefined,
        gateway: form.gateway || undefined,
        deploymentContext: form.deploymentContext || undefined,
        intendedUse: form.intendedUse,
        domain: form.domain,
        personalData: form.personalData,
        usersImpacted: form.usersImpacted,
        decisionImpact: form.decisionImpact,
        humanOversight: form.humanOversight,
        geography: form.geography,
        biometricUse: form.biometricUse,
        vulnerableGroups: form.vulnerableGroups,
        customerFacing: form.customerFacing === "yes",
        telemetrySignals: {
          productionTraffic: form.productionTraffic === "yes",
          piiExposureObserved: form.piiExposureObserved === "yes",
          safetyAlertsObserved: form.safetyAlertsObserved === "yes",
          biasAlertsObserved: form.biasAlertsObserved === "yes",
        },
      });
      return response.json();
    },
    onSuccess: (data: AutoRegistrationResponse) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/ai-systems"] });
      queryClient.invalidateQueries({ queryKey: ["/api/risk-assessments"] });
      toast({
        title: "AI application connected",
        description: `${data.system.name} created with ${data.assessment.riskOutcome.toUpperCase()} risk (${data.assessment.riskScore}/100).`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Auto-registration failed", description: error.message, variant: "destructive" });
    },
  });

  const goNext = () => {
    if (currentStep < wizardSteps.length - 1) {
      setCurrentStep((step) => step + 1);
    }
  };

  const goBack = () => {
    if (currentStep > 0) {
      setCurrentStep((step) => step - 1);
    }
  };

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto" data-testid="page-connect-ai-application">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <Button asChild variant="ghost" className="-ml-3 w-fit px-3">
            <Link href="/registry">
              <ChevronLeft className="mr-2 h-4 w-4" />
              Back to registry
            </Link>
          </Button>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
            <PlugZap className="h-3.5 w-3.5" />
            SDK-assisted onboarding
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Connect AI Application</h1>
            <p className="text-sm text-muted-foreground">
              Start with the runtime context already discovered from the integration, confirm the missing governance facts, and then generate a draft registry record plus baseline risk assessment.
            </p>
            {isSdkPrefilled ? (
              <p className="text-sm text-muted-foreground">
                SDK onboarding context detected. Provider, model, gateway, and runtime signal defaults were prefilled from the telemetry adapter flow.
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">Discovery-first wizard</Badge>
          <Badge variant="outline">Draft system creation</Badge>
          <Badge variant="outline">Assessment history preserved</Badge>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <Card>
          <CardHeader>
            <CardTitle>Connected application intake</CardTitle>
            <CardDescription>
              This wizard is intentionally not API-key-only. Technical integration data is auto-detected first, then the unresolved business and regulatory facts are confirmed before classification.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-3 md:grid-cols-3">
              {wizardSteps.map((step, index) => {
                const isActive = index === currentStep;
                const isComplete = index < currentStep;
                return (
                  <button
                    key={step.key}
                    type="button"
                    onClick={() => setCurrentStep(index)}
                    className={`rounded-xl border p-4 text-left transition ${
                      isActive
                        ? "border-primary bg-primary/5"
                        : isComplete
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : "border-border bg-background"
                    }`}
                  >
                    <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                      {isComplete ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border text-xs">{index + 1}</span>}
                      {step.title}
                    </div>
                    <p className="text-xs text-muted-foreground">{step.description}</p>
                  </button>
                );
              })}
            </div>

            {currentStep === 0 ? (
              <div className="space-y-5">
                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <Bot className="h-4 w-4" />
                    Auto-detected runtime context
                  </div>
                  <p className="text-sm text-muted-foreground">
                    This data came from the integration context. Confirm it before moving to business classification.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="System name" value={form.systemName} onChange={(value) => setForm((current) => ({ ...current, systemName: value }))} inference={fieldInferences.systemName} />
                  <Field label="Deployment context" value={form.deploymentContext} onChange={(value) => setForm((current) => ({ ...current, deploymentContext: value }))} inference={fieldInferences.deploymentContext} />
                  <Field label="Provider" value={form.provider} onChange={(value) => setForm((current) => ({ ...current, provider: value }))} inference={fieldInferences.provider} />
                  <Field label="Model name" value={form.modelName} onChange={(value) => setForm((current) => ({ ...current, modelName: value }))} inference={fieldInferences.modelName} />
                  <Field label="Model type" value={form.modelType} onChange={(value) => setForm((current) => ({ ...current, modelType: value }))} />
                  <Field label="Gateway" value={form.gateway} onChange={(value) => setForm((current) => ({ ...current, gateway: value }))} inference={fieldInferences.gateway} />
                  <Field label="Vendor" value={form.vendor} onChange={(value) => setForm((current) => ({ ...current, vendor: value }))} />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <YesNoField label="Production traffic observed" value={form.productionTraffic} onChange={(value) => setForm((current) => ({ ...current, productionTraffic: value }))} inference={fieldInferences.productionTraffic} />
                  <YesNoField label="PII exposure observed" value={form.piiExposureObserved} onChange={(value) => setForm((current) => ({ ...current, piiExposureObserved: value }))} inference={fieldInferences.piiExposureObserved} />
                  <YesNoField label="Safety alerts observed" value={form.safetyAlertsObserved} onChange={(value) => setForm((current) => ({ ...current, safetyAlertsObserved: value }))} inference={fieldInferences.safetyAlertsObserved} />
                  <YesNoField label="Bias alerts observed" value={form.biasAlertsObserved} onChange={(value) => setForm((current) => ({ ...current, biasAlertsObserved: value }))} inference={fieldInferences.biasAlertsObserved} />
                </div>
              </div>
            ) : null}

            {currentStep === 1 ? (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Owner" value={form.owner} onChange={(value) => setForm((current) => ({ ...current, owner: value }))} />
                  <Field label="Department" value={form.department} onChange={(value) => setForm((current) => ({ ...current, department: value }))} />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Purpose</Label>
                    {fieldInferences.purpose ? (
                      <Badge variant={badgeVariantForConfidence(fieldInferences.purpose.confidence)}>
                        {confidenceLabel(fieldInferences.purpose.confidence)}
                      </Badge>
                    ) : null}
                  </div>
                  <Textarea
                    value={form.purpose}
                    onChange={(event) => setForm((current) => ({ ...current, purpose: event.target.value }))}
                    className="min-h-[120px]"
                    placeholder="Describe what the application does, who it affects, and what decision it supports or automates."
                  />
                  {fieldInferences.purpose ? <p className="text-xs text-muted-foreground">{fieldInferences.purpose.reason}</p> : null}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <EnumField label="Intended use" value={form.intendedUse} onChange={(value) => setForm((current) => ({ ...current, intendedUse: value }))} options={[
                    ["autonomous_decisions", "Autonomous decisions"],
                    ["decision_support", "Decision support"],
                    ["automation", "Automation"],
                    ["analytics", "Analytics"],
                  ]} />
                  <EnumField label="Domain" value={form.domain} onChange={(value) => setForm((current) => ({ ...current, domain: value }))} inference={fieldInferences.domain} options={[
                    ["healthcare", "Healthcare"],
                    ["law_enforcement", "Law enforcement"],
                    ["finance", "Finance"],
                    ["employment", "Employment"],
                    ["education", "Education"],
                    ["critical_infrastructure", "Critical infrastructure"],
                    ["general", "General"],
                  ]} />
                  <YesNoField label="Customer-facing" value={form.customerFacing} onChange={(value) => setForm((current) => ({ ...current, customerFacing: value }))} inference={fieldInferences.customerFacing} />
                </div>
              </div>
            ) : null}

            {currentStep === 2 ? (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <EnumField label="Personal data" value={form.personalData} onChange={(value) => setForm((current) => ({ ...current, personalData: value }))} inference={fieldInferences.personalData} options={[
                    ["special_category", "Special category"],
                    ["sensitive", "Sensitive"],
                    ["basic", "Basic personal data"],
                    ["none", "None"],
                  ]} />
                  <EnumField label="Users impacted" value={form.usersImpacted} onChange={(value) => setForm((current) => ({ ...current, usersImpacted: value }))} options={[
                    ["over_100k", "Over 100k"],
                    ["10k_100k", "10k to 100k"],
                    ["1k_10k", "1k to 10k"],
                    ["under_1k", "Under 1k"],
                  ]} />
                  <EnumField label="Decision impact" value={form.decisionImpact} onChange={(value) => setForm((current) => ({ ...current, decisionImpact: value }))} inference={fieldInferences.decisionImpact} options={[
                    ["legal_significant", "Legal or significant"],
                    ["material", "Material"],
                    ["minor", "Minor"],
                    ["none", "None"],
                  ]} />
                  <EnumField label="Human oversight" value={form.humanOversight} onChange={(value) => setForm((current) => ({ ...current, humanOversight: value }))} options={[
                    ["none", "None"],
                    ["post_hoc", "Post hoc"],
                    ["in_loop", "In the loop"],
                    ["full_control", "Full control"],
                  ]} />
                  <EnumField label="Geography" value={form.geography} onChange={(value) => setForm((current) => ({ ...current, geography: value }))} inference={fieldInferences.geography} options={[
                    ["eu", "EU"],
                    ["global", "Global"],
                    ["us", "US"],
                    ["other", "Other"],
                  ]} />
                  <YesNoField label="Biometric use" value={form.biometricUse} onChange={(value) => setForm((current) => ({ ...current, biometricUse: value }))} />
                  <YesNoField label="Affects vulnerable groups" value={form.vulnerableGroups} onChange={(value) => setForm((current) => ({ ...current, vulnerableGroups: value }))} />
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={goBack} disabled={currentStep === 0}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Previous
                </Button>
                {currentStep < wizardSteps.length - 1 ? (
                  <Button onClick={goNext} disabled={!stepCanAdvance}>
                    Next step
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    onClick={() => mutation.mutate()}
                    disabled={mutation.isPending || !form.systemName || !form.owner || !form.purpose}
                    data-testid="button-auto-register-application"
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    {mutation.isPending ? "Generating draft system..." : "Generate draft system and risk assessment"}
                  </Button>
                )}
              </div>
              <Button variant="ghost" onClick={() => { setForm(defaultForm); setCurrentStep(0); }}>
                Reset intake
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="h-4 w-4" />
                Intake progress
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Resolved baseline fields</span>
                  <span className="font-medium">{completionPercent}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${completionPercent}%` }} />
                </div>
              </div>
              <div className="rounded-md border bg-muted/20 p-3 text-sm">
                <div className="font-medium text-foreground">Current step</div>
                <div className="mt-1 text-muted-foreground">{wizardSteps[currentStep].description}</div>
              </div>
              <div className="rounded-md border bg-muted/20 p-3 text-sm">
                <div className="font-medium text-foreground">Inference model</div>
                <div className="mt-1 text-muted-foreground">
                  High-confidence values came directly from integration context. Medium-confidence values were inferred from runtime payload patterns. Review-needed values are suggestions only and should be confirmed by the user.
                </div>
              </div>
              <div className="rounded-md border bg-muted/20 p-3 text-sm">
                <div className="font-medium text-foreground">Overall intake confidence</div>
                <div className="mt-1 text-muted-foreground">
                  {intakeConfidence.score}% based on the mix of auto-detected, inferred, and manually confirmed fields.
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" />
                Classification preview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge>{riskPreview.riskLevel.toUpperCase()}</Badge>
                <Badge variant="outline">Score {riskPreview.score}/100</Badge>
                <Badge variant="outline">Confidence {intakeConfidence.score}%</Badge>
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <div className="mb-2 text-sm font-medium text-foreground">Why this level</div>
                <div className="flex flex-wrap gap-2">
                  {riskPreview.factors.length ? riskPreview.factors.map((factor) => (
                    <Badge key={factor} variant="outline">{factor}</Badge>
                  )) : <span className="text-sm text-muted-foreground">Add more business context to preview classification drivers.</span>}
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <SummaryDetail label="Auto-detected" value={`${intakeConfidence.autoDetected}`} />
                <SummaryDetail label="Inferred" value={`${intakeConfidence.inferred}`} />
                <SummaryDetail label="Review needed" value={`${intakeConfidence.reviewNeeded}`} />
                <SummaryDetail label="Manual confirmations" value={`${intakeConfidence.manual}`} />
              </div>
              <div className="rounded-md border bg-muted/20 p-3 text-sm">
                <div className="mb-2 font-medium text-foreground">Suggested controls</div>
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                  {riskPreview.suggestedControls.map((control) => (
                    <li key={control}>{control}</li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Fingerprint className="h-4 w-4" />
                Discovery signals
              </CardTitle>
              <CardDescription>
                Signals currently being used to derive the initial classification.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="grid gap-2">
                {discoveryFields.map((field) => (
                  <div key={field.label} className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2">
                    <span>{field.label}</span>
                    <span className="max-w-[55%] truncate text-right font-medium text-foreground">{field.value}</span>
                  </div>
                ))}
              </div>
              {discoverySummary.length ? discoverySummary.map((signal) => (
                <div key={signal} className="rounded-md border bg-muted/20 px-3 py-2">{signal}</div>
              )) : <div className="rounded-md border bg-muted/20 px-3 py-2">No runtime signals selected yet.</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="h-4 w-4" />
                What this flow does
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>1. Starts from discovered runtime integration data instead of a blank form.</p>
              <p>2. Captures only the missing governance facts needed for defensible classification.</p>
              <p>3. Creates a draft AI system in the registry and derives the baseline risk assessment.</p>
              <p>4. Preserves future reassessment history in the normal assessment table.</p>
            </CardContent>
          </Card>

          {result ? (
            <Card data-testid="card-auto-registration-result">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4" />
                  Derived result
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge>{result.assessment.riskOutcome.toUpperCase()}</Badge>
                  <Badge variant="outline">Score {result.assessment.riskScore}/100</Badge>
                  <Badge variant="outline">Status {result.system.status}</Badge>
                </div>
                <div className="rounded-md border bg-muted/20 p-3 text-sm">
                  <div className="mb-2 font-medium text-foreground">Detected signals</div>
                  <div className="flex flex-wrap gap-2">
                    {discoverySummary.length ? discoverySummary.map((signal) => (
                      <Badge key={signal} variant="outline">{signal}</Badge>
                    )) : <span className="text-muted-foreground">No elevated runtime signals detected during intake.</span>}
                  </div>
                </div>
                <div className="rounded-md border bg-muted/20 p-3 text-sm">
                  <div className="mb-2 font-medium text-foreground">Confirmed business context</div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <SummaryDetail label="Owner" value={form.owner} />
                    <SummaryDetail label="Department" value={form.department || "Not set"} />
                    <SummaryDetail label="Domain" value={labelForOption(form.domain, [["healthcare", "Healthcare"], ["law_enforcement", "Law enforcement"], ["finance", "Finance"], ["employment", "Employment"], ["education", "Education"], ["critical_infrastructure", "Critical infrastructure"], ["general", "General"]])} />
                    <SummaryDetail label="Decision impact" value={labelForOption(form.decisionImpact, [["legal_significant", "Legal or significant"], ["material", "Material"], ["minor", "Minor"], ["none", "None"]])} />
                    <SummaryDetail label="Human oversight" value={labelForOption(form.humanOversight, [["none", "None"], ["post_hoc", "Post hoc"], ["in_loop", "In the loop"], ["full_control", "Full control"]])} />
                    <SummaryDetail label="Geography" value={labelForOption(form.geography, [["eu", "EU"], ["global", "Global"], ["us", "US"], ["other", "Other"]])} />
                  </div>
                </div>
                <div className="rounded-md border bg-muted/20 p-3 text-sm">
                  <div className="mb-2 font-medium text-foreground">Resulting risk posture</div>
                  <div className="whitespace-pre-wrap text-muted-foreground">{result.assessment.riskExplanation}</div>
                </div>
                {result.assessment.suggestedControls?.length ? (
                  <div className="rounded-md border bg-muted/20 p-3 text-sm">
                    <div className="font-medium text-foreground mb-2">Suggested controls</div>
                    <ul className="list-disc pl-5 space-y-1">
                      {result.assessment.suggestedControls.map((control) => (
                        <li key={control}>{control}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button asChild>
                    <Link href={`/systems/${result.system.id}`}>Open system record</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/risk">Open risk assessments</Link>
                  </Button>
                  <Button variant="outline" onClick={() => navigate(`/systems/${result.system.id}`)}>
                    Review in registry
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  inference,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inference?: FieldInference;
}) {
  return (
    <label className="space-y-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{label}</span>
        {inference ? <Badge variant={badgeVariantForConfidence(inference.confidence)}>{confidenceLabel(inference.confidence)}</Badge> : null}
      </div>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
      {inference ? <p className="text-xs text-muted-foreground">{inference.reason}</p> : null}
    </label>
  );
}

function EnumField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<readonly [string, string]>;
  inference?: FieldInference;
}) {
  return (
    <label className="space-y-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{label}</span>
        {inference ? <Badge variant={badgeVariantForConfidence(inference.confidence)}>{confidenceLabel(inference.confidence)}</Badge> : null}
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([optionValue, optionLabel]) => (
            <SelectItem key={optionValue} value={optionValue}>
              {optionLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {inference ? <p className="text-xs text-muted-foreground">{inference.reason}</p> : null}
    </label>
  );
}

function YesNoField({
  label,
  value,
  onChange,
  inference,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inference?: FieldInference;
}) {
  return <EnumField label={label} value={value} onChange={onChange} options={booleanOptions.map((option) => [option.value, option.label] as const)} inference={inference} />;
}

function SummaryDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium">{value}</div>
    </div>
  );
}

function labelForOption(value: string, options: ReadonlyArray<readonly [string, string]>) {
  return options.find(([optionValue]) => optionValue === value)?.[1] ?? value;
}
