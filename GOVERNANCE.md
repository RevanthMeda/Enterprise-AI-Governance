# Project Governance

AI CONTROL GRID is an open-source project maintained under a maintainer-led model.

## Roles

### Primary maintainer

**Revanth Meda (@RevanthMeda)** is the primary maintainer and project lead.

The primary maintainer is responsible for:

- repository direction and roadmap;
- release decisions;
- issue triage and prioritization;
- pull-request review and merge decisions;
- security-response coordination;
- contributor onboarding;
- governance and architecture decisions.

### Contributors

Contributors propose changes through issues and pull requests. Consistent contributors may be invited to take ownership of components, triage areas, or review responsibilities.

### Core maintainers

Core-maintainer status is earned through sustained, high-quality project work and trusted maintenance responsibility. Core maintainers may be delegated review, triage, release, or component-ownership responsibilities.

## Decision process

Most changes are decided through normal issue and pull-request discussion.

For significant changes—especially those affecting authorization, tenant isolation, policy evaluation, legal-source handling, auditability, security boundaries, or public APIs—the maintainer may request an issue or design note before implementation.

The project favors:

1. reproducible evidence over assumptions;
2. focused changes over broad rewrites;
3. backward-compatible evolution where practical;
4. explicit security and governance trade-offs;
5. tests for critical behavior.

## Releases

Releases are cut from reviewed code on `main`. Release notes should describe user-visible changes, security-relevant changes, breaking changes, and migration requirements.

## Changes to governance

This document may evolve as the contributor base grows. Material governance changes should be made publicly through a pull request.
