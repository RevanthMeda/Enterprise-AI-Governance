export const workspaceSearchResultKinds = [
  "system",
  "workflow",
  "incident",
  "decision_trace",
] as const;

export type WorkspaceSearchResultKind = (typeof workspaceSearchResultKinds)[number];

export type WorkspaceSearchResult = {
  kind: WorkspaceSearchResultKind;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  meta?: string | null;
};

export type WorkspaceSearchResponse = {
  query: string;
  results: WorkspaceSearchResult[];
};
