import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldAlert,
  AlertTriangle,
  ShieldCheck,
  Shield,
  ChevronRight,
  ChevronLeft,
  Check,
  CircleDot,
  Building2,
  Users,
  Scale,
  Eye,
  FileText,
  Plus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AiSystem, RiskAssessment as RiskAssessmentType } from "@shared/schema";

interface WizardAnswers {
  systemId: string;
  systemName: string;
  intendedUse: string;
  domain: string;
  purpose: string;
  personalData: string;
  usersImpacted: string;
  decisionImpact: string;
  autonomyLevel: string;
  humanOversight: string;
  geography: string;
  biometricUse: string;
  vulnerableGroups: string;
}

const defaultAnswers: WizardAnswers = {
  systemId: "",
  systemName: "",
  intendedUse: "",
  domain: "",
  purpose: "",
  personalData: "",
  usersImpacted: "",
  decisionImpact: "",
  autonomyLevel: "",
  humanOversight: "",
  geography: "",
  biometricUse: "",
  vulnerableGroups: "",
};

const steps = [
  { title: "System Selection", icon: Building2 },
  { title: "Intended Use & Purpose", icon: FileText },
  { title: "Data & Users Affected", icon: Users },
  { title: "Decision Impact & Autonomy", icon: Scale },
  { title: "Human Oversight", icon: Eye },
  { title: "Review & Submit", icon: Check },
];

const riskIcons: Record<string, typeof ShieldAlert> = {
  unacceptable: ShieldAlert,
  high: AlertTriangle,
  medium: Shield,
  limited: Shield,
  low: ShieldCheck,
  minimal: ShieldCheck,
};

const riskColors: Record<string, string> = {
  unacceptable: "text-red-600 dark:text-red-400",
  high: "text-orange-600 dark:text-orange-400",
  medium: "text-amber-600 dark:text-amber-400",
  limited: "text-yellow-600 dark:text-yellow-400",
  low: "text-emerald-600 dark:text-emerald-400",
  minimal: "text-green-600 dark:text-green-400",
};

const riskBgColors: Record<string, string> = {
  unacceptable: "bg-red-50 dark:bg-red-950/20",
  high: "bg-orange-50 dark:bg-orange-950/20",
  medium: "bg-amber-50 dark:bg-amber-950/20",
  limited: "bg-yellow-50 dark:bg-yellow-950/20",
  low: "bg-emerald-50 dark:bg-emerald-950/20",
  minimal: "bg-green-50 dark:bg-green-950/20",
};

function getRiskMeta(riskOutcome: string) {
  const labelMap: Record<string, string> = {
    unacceptable: "Unacceptable",
    high: "High",
    medium: "Medium",
    limited: "Limited",
    low: "Low",
    minimal: "Minimal",
  };

  return {
    label: labelMap[riskOutcome] ?? riskOutcome,
    icon: riskIcons[riskOutcome] || Shield,
    color: riskColors[riskOutcome] || "text-slate-600 dark:text-slate-400",
    bg: riskBgColors[riskOutcome] || "bg-slate-50 dark:bg-slate-950/20",
    framework: riskOutcome === "medium" || riskOutcome === "low" ? "Operational" : "EU AI Act",
  };
}

function OptionCard({
  value,
  selected,
  title,
  description,
  onSelect,
  testId,
}: {
  value: string;
  selected: boolean;
  title: string;
  description: string;
  onSelect: (val: string) => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`text-left p-3 rounded-md border transition-colors w-full ${
        selected
          ? "border-primary bg-primary/5"
          : "border-border hover-elevate"
      }`}
      data-testid={testId}
    >
      <div className="flex items-start gap-2">
        <CircleDot
          className={`h-4 w-4 mt-0.5 shrink-0 ${
            selected ? "text-primary" : "text-muted-foreground"
          }`}
        />
        <div>
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
        </div>
      </div>
    </button>
  );
}

export default function RiskAssessment() {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<WizardAnswers>(defaultAnswers);
  const [result, setResult] = useState<RiskAssessmentType | null>(null);
  const [showWizard, setShowWizard] = useState(false);

  const { data: systems = [], isLoading: systemsLoading } = useQuery<AiSystem[]>({
    queryKey: ["/api/ai-systems"],
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const { data: pastAssessments = [], isLoading: assessmentsLoading } = useQuery<RiskAssessmentType[]>({
    queryKey: ["/api/risk-assessments"],
    refetchInterval: 15_000,
    staleTime: 5_000,
  });

  const submitMutation = useMutation({
    mutationFn: async (data: { answers: Partial<WizardAnswers>; systemId: string | null; systemName: string }) => {
      const res = await apiRequest("POST", "/api/risk-assessments", data);
      return res.json();
    },
    onSuccess: (data: RiskAssessmentType) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/risk-assessments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai-systems"] });
      toast({
        title: "Assessment Complete",
        description: `Risk level: ${data.riskOutcome.toUpperCase()}`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const createSystemMutation = useMutation({
    mutationFn: async () => {
      if (!result) return;
      const res = await apiRequest("POST", "/api/ai-systems", {
        name: answers.systemName,
        description: answers.purpose || "",
        owner: result.completedBy,
        riskLevel: result.riskOutcome,
        status: "draft",
        geography: answers.geography || null,
        purpose: answers.purpose || null,
        deploymentContext: answers.domain || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-systems"] });
      toast({
        title: "System Created",
        description: `"${answers.systemName}" has been added to the AI Registry`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Error creating system",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const updateAnswer = (key: keyof WizardAnswers, value: string) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const canAdvance = (): boolean => {
    switch (currentStep) {
      case 0:
        return !!answers.systemName;
      case 1:
        return !!answers.intendedUse && !!answers.domain;
      case 2:
        return !!answers.personalData && !!answers.usersImpacted;
      case 3:
        return !!answers.decisionImpact && !!answers.humanOversight;
      case 4:
        return !!answers.geography && !!answers.biometricUse && !!answers.vulnerableGroups;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  };

  const handleSubmit = () => {
    const { systemId, systemName, purpose, ...wizardAnswers } = answers;
    submitMutation.mutate({
      answers: { ...wizardAnswers, purpose },
      systemId: systemId || null,
      systemName,
    });
  };

  const handleStartNew = () => {
    setAnswers(defaultAnswers);
    setCurrentStep(0);
    setResult(null);
    setShowWizard(true);
  };

  const isLoading = systemsLoading || assessmentsLoading;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-md" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-md" />
      </div>
    );
  }

  if (result) {
    const riskMeta = getRiskMeta(result.riskOutcome);
    const RiskIcon = riskMeta.icon;
    const suggestedControls = (result.suggestedControls as string[]) || [];

    return (
      <div className="p-6 space-y-6 max-w-[900px] mx-auto" data-testid="page-risk-result">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Assessment Result</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Governance assessment for "{result.systemName}"
            </p>
          </div>
          <Button onClick={handleStartNew} data-testid="button-new-assessment">
            <Plus className="h-4 w-4 mr-1" />
            New Assessment
          </Button>
        </div>

        <Card className={riskMeta.bg} data-testid="card-risk-result">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <RiskIcon className={`h-8 w-8 ${riskMeta.color}`} />
              <div>
                <div className="text-lg font-bold capitalize" data-testid="text-risk-outcome">
                  {riskMeta.label} risk
                </div>
                <div className="text-sm text-muted-foreground">
                  Score: {result.riskScore}/100
                </div>
              </div>
              <Badge
                variant="secondary"
                className="ml-auto"
                data-testid="badge-risk-score"
              >
                {result.riskScore} points
              </Badge>
              <Badge variant="outline">{riskMeta.framework}</Badge>
            </div>

            <Separator className="my-4" />

            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Explanation</h3>
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans" data-testid="text-risk-explanation">
                {result.riskExplanation}
              </pre>
            </div>
          </CardContent>
        </Card>

        {suggestedControls.length > 0 && (
          <Card data-testid="card-suggested-controls">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Suggested Controls ({suggestedControls.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {suggestedControls.map((ctrl, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2"
                    data-testid={`text-suggested-control-${i}`}
                  >
                    <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="text-xs">{ctrl}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {!answers.systemId && (
          <Card data-testid="card-create-system">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="text-sm font-semibold">Add to AI Registry</div>
                  <div className="text-xs text-muted-foreground">
                    Create a new system entry from this assessment
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => createSystemMutation.mutate()}
                  disabled={createSystemMutation.isPending || createSystemMutation.isSuccess}
                  data-testid="button-create-system"
                >
                  {createSystemMutation.isSuccess ? (
                    <>
                      <Check className="h-4 w-4 mr-1" />
                      Created
                    </>
                  ) : createSystemMutation.isPending ? (
                    "Creating..."
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-1" />
                      Create System
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  if (showWizard) {
    return (
      <div className="p-6 space-y-6 max-w-[900px] mx-auto" data-testid="page-risk-wizard">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Risk Assessment Wizard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Step {currentStep + 1} of {steps.length}: {steps[currentStep].title}
          </p>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {steps.map((step, i) => {
            const StepIcon = step.icon;
            const isActive = i === currentStep;
            const isComplete = i < currentStep;
            return (
              <button
                key={i}
                type="button"
                onClick={() => i <= currentStep && setCurrentStep(i)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isComplete
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground"
                }`}
                disabled={i > currentStep}
                data-testid={`step-indicator-${i}`}
              >
                <StepIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{step.title}</span>
                <span className="sm:hidden">{i + 1}</span>
              </button>
            );
          })}
        </div>

        <Card data-testid="card-wizard-step">
          <CardContent className="p-6">
            {currentStep === 0 && (
              <div className="space-y-4" data-testid="wizard-step-0">
                <div>
                  <h2 className="text-base font-semibold mb-1">Select or Name an AI System</h2>
                  <p className="text-xs text-muted-foreground">
                    Choose an existing system from the registry or enter a new system name.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Existing System (optional)</Label>
                    <Select
                      value={answers.systemId}
                      onValueChange={(val) => {
                        const sys = systems.find((s) => s.id === val);
                        updateAnswer("systemId", val);
                        if (sys) {
                          updateAnswer("systemName", sys.name);
                        }
                      }}
                    >
                      <SelectTrigger data-testid="select-system">
                        <SelectValue placeholder="Select a system..." />
                      </SelectTrigger>
                      <SelectContent>
                        {systems.map((sys) => (
                          <SelectItem key={sys.id} value={sys.id}>
                            {sys.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />

                  <div className="space-y-1.5">
                    <Label className="text-xs">System Name</Label>
                    <Input
                      value={answers.systemName}
                      onChange={(e) => updateAnswer("systemName", e.target.value)}
                      placeholder="e.g., Customer Churn Predictor"
                      data-testid="input-system-name"
                    />
                  </div>
                </div>
              </div>
            )}

            {currentStep === 1 && (
              <div className="space-y-4" data-testid="wizard-step-1">
                <div>
                  <h2 className="text-base font-semibold mb-1">Intended Use & Purpose</h2>
                  <p className="text-xs text-muted-foreground">
                    Describe how the AI system will be used and in what domain.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Primary Use</Label>
                  <div className="grid grid-cols-1 gap-2">
                    <OptionCard
                      value="autonomous_decisions"
                      selected={answers.intendedUse === "autonomous_decisions"}
                      title="Autonomous Decisions"
                      description="System makes decisions without human intervention"
                      onSelect={(v) => updateAnswer("intendedUse", v)}
                      testId="option-use-autonomous"
                    />
                    <OptionCard
                      value="decision_support"
                      selected={answers.intendedUse === "decision_support"}
                      title="Decision Support"
                      description="System provides recommendations for human decision-makers"
                      onSelect={(v) => updateAnswer("intendedUse", v)}
                      testId="option-use-support"
                    />
                    <OptionCard
                      value="automation"
                      selected={answers.intendedUse === "automation"}
                      title="Task Automation"
                      description="System automates routine tasks without significant decisions"
                      onSelect={(v) => updateAnswer("intendedUse", v)}
                      testId="option-use-automation"
                    />
                    <OptionCard
                      value="analytics"
                      selected={answers.intendedUse === "analytics"}
                      title="Analytics / Insights"
                      description="System generates insights and reports from data"
                      onSelect={(v) => updateAnswer("intendedUse", v)}
                      testId="option-use-analytics"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Application Domain</Label>
                  <Select
                    value={answers.domain}
                    onValueChange={(v) => updateAnswer("domain", v)}
                  >
                    <SelectTrigger data-testid="select-domain">
                      <SelectValue placeholder="Select domain..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="healthcare">Healthcare</SelectItem>
                      <SelectItem value="finance">Finance</SelectItem>
                      <SelectItem value="employment">Employment / HR</SelectItem>
                      <SelectItem value="education">Education</SelectItem>
                      <SelectItem value="law_enforcement">Law Enforcement</SelectItem>
                      <SelectItem value="critical_infrastructure">Critical Infrastructure</SelectItem>
                      <SelectItem value="general">General / Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Purpose Description (optional)</Label>
                  <Textarea
                    value={answers.purpose}
                    onChange={(e) => updateAnswer("purpose", e.target.value)}
                    placeholder="Briefly describe the system's purpose..."
                    className="resize-none text-sm"
                    rows={3}
                    data-testid="input-purpose"
                  />
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-4" data-testid="wizard-step-2">
                <div>
                  <h2 className="text-base font-semibold mb-1">Data & Users Affected</h2>
                  <p className="text-xs text-muted-foreground">
                    What type of personal data does the system process and how many users are affected?
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Personal Data Processed</Label>
                  <div className="grid grid-cols-1 gap-2">
                    <OptionCard
                      value="special_category"
                      selected={answers.personalData === "special_category"}
                      title="Special Category Data"
                      description="Biometric, health, racial/ethnic, political, or religious data"
                      onSelect={(v) => updateAnswer("personalData", v)}
                      testId="option-data-special"
                    />
                    <OptionCard
                      value="sensitive"
                      selected={answers.personalData === "sensitive"}
                      title="Sensitive Personal Data"
                      description="Financial records, location data, behavioral profiles"
                      onSelect={(v) => updateAnswer("personalData", v)}
                      testId="option-data-sensitive"
                    />
                    <OptionCard
                      value="basic"
                      selected={answers.personalData === "basic"}
                      title="Basic Personal Data"
                      description="Names, email addresses, general preferences"
                      onSelect={(v) => updateAnswer("personalData", v)}
                      testId="option-data-basic"
                    />
                    <OptionCard
                      value="none"
                      selected={answers.personalData === "none"}
                      title="No Personal Data"
                      description="System does not process personal data"
                      onSelect={(v) => updateAnswer("personalData", v)}
                      testId="option-data-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Users Impacted</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <OptionCard
                      value="over_100k"
                      selected={answers.usersImpacted === "over_100k"}
                      title="100,000+"
                      description="Large-scale deployment"
                      onSelect={(v) => updateAnswer("usersImpacted", v)}
                      testId="option-users-100k"
                    />
                    <OptionCard
                      value="10k_100k"
                      selected={answers.usersImpacted === "10k_100k"}
                      title="10,000 - 100,000"
                      description="Medium-scale deployment"
                      onSelect={(v) => updateAnswer("usersImpacted", v)}
                      testId="option-users-10k"
                    />
                    <OptionCard
                      value="1k_10k"
                      selected={answers.usersImpacted === "1k_10k"}
                      title="1,000 - 10,000"
                      description="Small-scale deployment"
                      onSelect={(v) => updateAnswer("usersImpacted", v)}
                      testId="option-users-1k"
                    />
                    <OptionCard
                      value="under_1k"
                      selected={answers.usersImpacted === "under_1k"}
                      title="Under 1,000"
                      description="Limited deployment"
                      onSelect={(v) => updateAnswer("usersImpacted", v)}
                      testId="option-users-under1k"
                    />
                  </div>
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-4" data-testid="wizard-step-3">
                <div>
                  <h2 className="text-base font-semibold mb-1">Decision Impact & Autonomy</h2>
                  <p className="text-xs text-muted-foreground">
                    What is the impact of the system's decisions and how autonomous is it?
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Decision Impact Level</Label>
                  <div className="grid grid-cols-1 gap-2">
                    <OptionCard
                      value="legal_significant"
                      selected={answers.decisionImpact === "legal_significant"}
                      title="Legal / Significant Effects"
                      description="Decisions produce legal effects or significantly impact rights, services, or opportunities"
                      onSelect={(v) => updateAnswer("decisionImpact", v)}
                      testId="option-impact-legal"
                    />
                    <OptionCard
                      value="material"
                      selected={answers.decisionImpact === "material"}
                      title="Material Impact"
                      description="Decisions have meaningful but not legally significant effects on individuals"
                      onSelect={(v) => updateAnswer("decisionImpact", v)}
                      testId="option-impact-material"
                    />
                    <OptionCard
                      value="minor"
                      selected={answers.decisionImpact === "minor"}
                      title="Minor Impact"
                      description="Decisions have limited or no direct impact on individuals"
                      onSelect={(v) => updateAnswer("decisionImpact", v)}
                      testId="option-impact-minor"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Human Oversight Level</Label>
                  <div className="grid grid-cols-1 gap-2">
                    <OptionCard
                      value="none"
                      selected={answers.humanOversight === "none"}
                      title="No Human Oversight"
                      description="System operates fully autonomously with no human review"
                      onSelect={(v) => updateAnswer("humanOversight", v)}
                      testId="option-oversight-none"
                    />
                    <OptionCard
                      value="post_hoc"
                      selected={answers.humanOversight === "post_hoc"}
                      title="Post-hoc Review"
                      description="Humans review decisions after they are made"
                      onSelect={(v) => updateAnswer("humanOversight", v)}
                      testId="option-oversight-posthoc"
                    />
                    <OptionCard
                      value="in_loop"
                      selected={answers.humanOversight === "in_loop"}
                      title="Human-in-the-Loop"
                      description="Human approval required before decisions take effect"
                      onSelect={(v) => updateAnswer("humanOversight", v)}
                      testId="option-oversight-inloop"
                    />
                  </div>
                </div>
              </div>
            )}

            {currentStep === 4 && (
              <div className="space-y-4" data-testid="wizard-step-4">
                <div>
                  <h2 className="text-base font-semibold mb-1">Additional Risk Factors</h2>
                  <p className="text-xs text-muted-foreground">
                    Geographic scope and special characteristics of the system.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Geographic Scope</Label>
                  <Select
                    value={answers.geography}
                    onValueChange={(v) => updateAnswer("geography", v)}
                  >
                    <SelectTrigger data-testid="select-geography">
                      <SelectValue placeholder="Select geography..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="eu">European Union</SelectItem>
                      <SelectItem value="global">Global</SelectItem>
                      <SelectItem value="non_eu">Non-EU Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Biometric Data Use</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <OptionCard
                      value="yes"
                      selected={answers.biometricUse === "yes"}
                      title="Yes"
                      description="Uses biometric identification or categorization"
                      onSelect={(v) => updateAnswer("biometricUse", v)}
                      testId="option-biometric-yes"
                    />
                    <OptionCard
                      value="no"
                      selected={answers.biometricUse === "no"}
                      title="No"
                      description="Does not use biometric data"
                      onSelect={(v) => updateAnswer("biometricUse", v)}
                      testId="option-biometric-no"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Affects Vulnerable Groups?</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <OptionCard
                      value="yes"
                      selected={answers.vulnerableGroups === "yes"}
                      title="Yes"
                      description="Affects children, elderly, or disabled individuals"
                      onSelect={(v) => updateAnswer("vulnerableGroups", v)}
                      testId="option-vulnerable-yes"
                    />
                    <OptionCard
                      value="no"
                      selected={answers.vulnerableGroups === "no"}
                      title="No"
                      description="General adult population only"
                      onSelect={(v) => updateAnswer("vulnerableGroups", v)}
                      testId="option-vulnerable-no"
                    />
                  </div>
                </div>
              </div>
            )}

            {currentStep === 5 && (
              <div className="space-y-4" data-testid="wizard-step-5">
                <div>
                  <h2 className="text-base font-semibold mb-1">Review Your Answers</h2>
                  <p className="text-xs text-muted-foreground">
                    Confirm all details before submitting for risk classification.
                  </p>
                </div>

                <div className="space-y-3">
                  <ReviewRow label="System" value={answers.systemName} />
                  <ReviewRow label="Intended Use" value={formatLabel(answers.intendedUse)} />
                  <ReviewRow label="Domain" value={formatLabel(answers.domain)} />
                  {answers.purpose && <ReviewRow label="Purpose" value={answers.purpose} />}
                  <Separator />
                  <ReviewRow label="Personal Data" value={formatLabel(answers.personalData)} />
                  <ReviewRow label="Users Impacted" value={formatLabel(answers.usersImpacted)} />
                  <Separator />
                  <ReviewRow label="Decision Impact" value={formatLabel(answers.decisionImpact)} />
                  <ReviewRow label="Human Oversight" value={formatLabel(answers.humanOversight)} />
                  <Separator />
                  <ReviewRow label="Geography" value={formatLabel(answers.geography)} />
                  <ReviewRow label="Biometric Use" value={answers.biometricUse === "yes" ? "Yes" : "No"} />
                  <ReviewRow label="Vulnerable Groups" value={answers.vulnerableGroups === "yes" ? "Yes" : "No"} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            onClick={currentStep === 0 ? () => setShowWizard(false) : handleBack}
            data-testid="button-wizard-back"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            {currentStep === 0 ? "Cancel" : "Back"}
          </Button>

          {currentStep < steps.length - 1 ? (
            <Button
              onClick={handleNext}
              disabled={!canAdvance()}
              data-testid="button-wizard-next"
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={submitMutation.isPending}
              data-testid="button-wizard-submit"
            >
              {submitMutation.isPending ? "Submitting..." : "Submit Assessment"}
            </Button>
          )}
        </div>
      </div>
    );
  }

  const riskCounts = {
    unacceptable: systems.filter((s) => s.riskLevel === "unacceptable").length,
    high: systems.filter((s) => s.riskLevel === "high").length,
    moderate: systems.filter((s) => s.riskLevel === "medium" || s.riskLevel === "limited").length,
    baseline: systems.filter((s) => s.riskLevel === "low" || s.riskLevel === "minimal").length,
  };

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto" data-testid="page-risk-assessment">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Risk Assessment</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Governance classification and assessment history across EU AI Act and operational telemetry models
          </p>
        </div>
        <Button onClick={handleStartNew} data-testid="button-start-wizard">
          <Plus className="h-4 w-4 mr-1" />
          New Assessment
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {([
          { key: "unacceptable", label: "Unacceptable", icon: ShieldAlert, color: riskColors.unacceptable, bg: riskBgColors.unacceptable },
          { key: "high", label: "High", icon: AlertTriangle, color: riskColors.high, bg: riskBgColors.high },
          { key: "moderate", label: "Moderate / Limited", icon: Shield, color: riskColors.medium, bg: riskBgColors.medium },
          { key: "baseline", label: "Low / Minimal", icon: ShieldCheck, color: riskColors.low, bg: riskBgColors.low },
        ] as const).map((level) => {
          const RIcon = level.icon;
          const count = riskCounts[level.key];
          return (
            <Card key={level.key} className={level.bg} data-testid={`card-risk-${level.key}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <RIcon className={`h-5 w-5 ${level.color}`} />
                  <span className="text-sm font-semibold">{level.label}</span>
                </div>
                <div className="text-2xl font-bold mb-1">{count}</div>
                <span className="text-[11px] text-muted-foreground">
                  {count === 1 ? "system" : "systems"} classified
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card data-testid="card-past-assessments">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">
            Past Assessments ({pastAssessments.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pastAssessments.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground mb-3">
                No assessments have been completed yet.
              </p>
              <Button variant="outline" onClick={handleStartNew} data-testid="button-start-wizard-empty">
                Start Your First Assessment
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {pastAssessments.map((a) => {
                const riskMeta = getRiskMeta(a.riskOutcome);
                const AIcon = riskMeta.icon;
                return (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2.5 flex-wrap"
                    data-testid={`row-assessment-${a.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <AIcon className={`h-4 w-4 ${riskMeta.color}`} />
                      <div>
                        <span className="text-sm font-medium" data-testid={`text-assessment-name-${a.id}`}>
                          {a.systemName}
                        </span>
                        <span className="text-xs text-muted-foreground ml-2">
                          by {a.completedBy}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px] capitalize" data-testid={`badge-assessment-risk-${a.id}`}>
                        {riskMeta.label}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {riskMeta.framework}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        Score: {a.riskScore}
                      </span>
                      {a.createdAt && (
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(a.createdAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4" data-testid={`review-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs font-medium text-right">{value}</span>
    </div>
  );
}

function formatLabel(val: string): string {
  if (!val) return "";
  return val
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
