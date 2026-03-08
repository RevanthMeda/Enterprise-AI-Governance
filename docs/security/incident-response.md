# Incident Response Runbook

## Severity Levels
- `Low`: isolated issue, no sensitive data exposure, no tenant boundary impact.
- `Medium`: confirmed security control failure with limited impact.
- `High`: unauthorized access attempt succeeded for a user/org scope.
- `Critical`: cross-tenant data exposure, credential compromise, or active breach.

## Roles
- Incident Commander: coordinates response and decisions.
- Security Lead: triage, containment strategy, forensics coordination.
- Engineering Lead: implements mitigations and fixes.
- Communications Lead: internal/external stakeholder updates.

## Response Workflow
1. Detect and triage alert.
2. Classify severity.
3. Contain:
   - disable affected endpoints/keys/sessions
   - enforce temporary deny rules
4. Eradicate root cause.
5. Recover service safely.
6. Validate controls and regression tests.
7. Publish post-incident review.

## Immediate Actions by Incident Type
- Auth brute force:
  - verify rate limiting behavior
  - block abusive IP ranges upstream (WAF/CDN)
- Session compromise:
  - invalidate active sessions
  - rotate session secret if needed
- Cross-tenant access issue:
  - disable impacted route(s)
  - patch tenant scoping
  - run tenant isolation + route matrix tests
- Evidence/export leakage:
  - suspend download endpoint
  - verify org ownership checks before re-enable

## Evidence and Retention
- Preserve logs, request traces, and DB audit data for 12 months for high/critical incidents.
- Capture timeline:
  - detection time
  - containment time
  - recovery time
  - final closure time

## Post-Incident SLA
- Root cause analysis completed within 5 business days.
- Control enhancement plan committed within 30 days.
- Add regression test for each confirmed gap.
