export class TenantAttributionError extends Error {
  readonly status = 400;
  readonly code = "INVALID_TENANT_ATTRIBUTION";

  constructor(message: string) {
    super(message);
    this.name = "TenantAttributionError";
  }
}

export function assertTenantAttribution(input: {
  subject: "Telemetry event" | "Incident";
  requestedSystemId?: string | null;
  requestedWorkflowId?: string | null;
  system?: { id: string } | null;
  workflow?: { id: string; systemId?: string | null } | null;
}): void {
  if (input.requestedSystemId && !input.system) {
    throw new TenantAttributionError(
      `${input.subject} system was not found in the active organization`,
    );
  }
  if (input.requestedWorkflowId && !input.workflow) {
    throw new TenantAttributionError(
      `${input.subject} workflow was not found in the active organization`,
    );
  }
  if (input.requestedWorkflowId && !input.requestedSystemId) {
    throw new TenantAttributionError(
      `${input.subject} workflow requires an explicit AI system`,
    );
  }
  if (
    input.requestedSystemId &&
    input.requestedWorkflowId &&
    input.system &&
    input.workflow &&
    input.workflow.systemId !== input.system.id
  ) {
    throw new TenantAttributionError(
      `${input.subject} workflow does not belong to the selected AI system`,
    );
  }
}
