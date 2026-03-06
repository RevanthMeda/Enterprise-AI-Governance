import { useQuery } from "@tanstack/react-query";
import {
  ShieldAlert,
  AlertTriangle,
  ShieldCheck,
  Shield,
  Info,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { AiSystem } from "@shared/schema";

const riskDefinitions = [
  {
    level: "unacceptable",
    title: "Unacceptable Risk",
    icon: ShieldAlert,
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-50 dark:bg-red-950/20",
    borderColor: "border-red-200 dark:border-red-900/30",
    description: "AI systems that pose a clear threat to safety, livelihoods, or fundamental rights. These are prohibited under the EU AI Act.",
    examples: [
      "Social scoring by governments",
      "Real-time biometric identification in public spaces",
      "Manipulation of vulnerable groups",
      "Subliminal manipulation techniques",
    ],
    obligations: [
      "These systems are banned and must not be deployed",
      "Existing systems must be decommissioned",
      "Violations carry the highest penalties",
    ],
  },
  {
    level: "high",
    title: "High Risk",
    icon: AlertTriangle,
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-50 dark:bg-orange-950/20",
    borderColor: "border-orange-200 dark:border-orange-900/30",
    description: "AI systems used in critical areas that significantly impact people's safety or fundamental rights. Subject to strict requirements.",
    examples: [
      "Credit scoring and lending decisions",
      "Employment screening and hiring",
      "Healthcare diagnostics and triage",
      "Critical infrastructure management",
      "Educational assessment",
      "Law enforcement predictive policing",
    ],
    obligations: [
      "Risk management system required",
      "Data governance and quality measures",
      "Technical documentation and logging",
      "Human oversight mechanisms",
      "Accuracy, robustness, cybersecurity standards",
      "Conformity assessment before deployment",
    ],
  },
  {
    level: "limited",
    title: "Limited Risk",
    icon: Shield,
    color: "text-yellow-600 dark:text-yellow-400",
    bgColor: "bg-yellow-50 dark:bg-yellow-950/20",
    borderColor: "border-yellow-200 dark:border-yellow-900/30",
    description: "AI systems with specific transparency obligations. Users must be informed they are interacting with AI.",
    examples: [
      "Chatbots and virtual assistants",
      "Emotion recognition systems",
      "Deepfake generation tools",
      "AI-generated content systems",
    ],
    obligations: [
      "Transparency obligations to end users",
      "Clear disclosure of AI interaction",
      "Labeling of AI-generated content",
      "User notification requirements",
    ],
  },
  {
    level: "minimal",
    title: "Minimal Risk",
    icon: ShieldCheck,
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-50 dark:bg-green-950/20",
    borderColor: "border-green-200 dark:border-green-900/30",
    description: "AI systems that pose minimal or no risk. No specific obligations under the EU AI Act, but voluntary codes of conduct encouraged.",
    examples: [
      "Spam filters",
      "AI-enhanced video games",
      "Inventory management systems",
      "Content recommendation engines",
    ],
    obligations: [
      "No mandatory requirements",
      "Voluntary codes of conduct encouraged",
      "General best practices recommended",
    ],
  },
];

export default function RiskAssessment() {
  const { data: systems = [], isLoading } = useQuery<AiSystem[]>({
    queryKey: ["/api/ai-systems"],
  });

  const riskCounts = {
    unacceptable: systems.filter((s) => s.riskLevel === "unacceptable").length,
    high: systems.filter((s) => s.riskLevel === "high").length,
    limited: systems.filter((s) => s.riskLevel === "limited").length,
    minimal: systems.filter((s) => s.riskLevel === "minimal").length,
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-md" />)}
        </div>
        <Skeleton className="h-96 rounded-md" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto" data-testid="page-risk-assessment">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Risk Assessment</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          EU AI Act risk classification framework and system mapping
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {riskDefinitions.map((risk) => {
          const count = riskCounts[risk.level as keyof typeof riskCounts];
          return (
            <Card key={risk.level} className={`${risk.bgColor}`} data-testid={`card-risk-${risk.level}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <risk.icon className={`h-5 w-5 ${risk.color}`} />
                  <span className="text-sm font-semibold">{risk.title}</span>
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

      <Card data-testid="card-risk-framework">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Info className="h-4 w-4 text-muted-foreground" />
            EU AI Act Risk Classification Framework
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="w-full">
            {riskDefinitions.map((risk) => (
              <AccordionItem key={risk.level} value={risk.level}>
                <AccordionTrigger className="text-sm" data-testid={`accordion-${risk.level}`}>
                  <div className="flex items-center gap-2">
                    <risk.icon className={`h-4 w-4 ${risk.color}`} />
                    <span>{risk.title}</span>
                    <Badge variant="secondary" className="ml-2 text-[10px]">
                      {riskCounts[risk.level as keyof typeof riskCounts]} systems
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 pl-6">
                    <p className="text-sm text-muted-foreground">{risk.description}</p>
                    <div>
                      <h4 className="text-xs font-semibold mb-2">Examples</h4>
                      <ul className="space-y-1">
                        {risk.examples.map((ex) => (
                          <li key={ex} className="text-xs text-muted-foreground flex items-start gap-1.5">
                            <span className="mt-1.5 h-1 w-1 rounded-full bg-muted-foreground shrink-0" />
                            {ex}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold mb-2">Key Obligations</h4>
                      <ul className="space-y-1">
                        {risk.obligations.map((ob) => (
                          <li key={ob} className="text-xs text-muted-foreground flex items-start gap-1.5">
                            <span className="mt-1.5 h-1 w-1 rounded-full bg-primary shrink-0" />
                            {ob}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {systems.filter((s) => s.riskLevel === risk.level).length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold mb-2">Your Systems at this Risk Level</h4>
                        <div className="space-y-1.5">
                          {systems.filter((s) => s.riskLevel === risk.level).map((sys) => (
                            <div key={sys.id} className="flex items-center justify-between gap-1 rounded-md bg-muted/50 px-2.5 py-1.5">
                              <span className="text-xs font-medium">{sys.name}</span>
                              <span className="text-[10px] text-muted-foreground">{sys.owner}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
