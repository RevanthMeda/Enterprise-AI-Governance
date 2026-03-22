export const governanceMaturityLevels = [
  "ad_hoc",
  "reactive",
  "proactive",
  "optimized",
  "predictive",
] as const;

export type GovernanceMaturityLevel = (typeof governanceMaturityLevels)[number];

export type GovernanceMaturityDomain = {
  key: string;
  label: string;
  score: number;
  maxScore: number;
  percent: number;
  summary: string;
  nextActions: string[];
};

export type GovernanceMaturityResponse = {
  generatedAt: string;
  overallScore: number;
  maxScore: number;
  percent: number;
  level: GovernanceMaturityLevel;
  headline: string;
  strengths: string[];
  gaps: string[];
  domains: GovernanceMaturityDomain[];
};
