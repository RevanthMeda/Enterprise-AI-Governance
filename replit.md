# AI Control Tower - Enterprise AI Governance & Compliance

## Overview
Enterprise AI governance platform for managing AI systems compliance with EU AI Act, NIST AI RMF, and ISO/IEC 42001 frameworks. Built as a full-stack TypeScript application.

## Architecture
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui + TanStack Query
- **Backend**: Express.js with RESTful API
- **Database**: PostgreSQL with Drizzle ORM
- **Routing**: wouter (client-side)

## Key Features
1. **Dashboard** - Executive overview with key metrics, risk distribution, compliance status
2. **AI System Registry** - CRUD inventory of all AI systems with risk classification
3. **Risk Assessment** - EU AI Act risk classification framework with system mapping
4. **Compliance Management** - Control mapping across EU AI Act, NIST AI RMF, ISO 42001
5. **Approval Workflows** - Review and approve AI system deployments
6. **Audit Log** - Complete audit trail of all governance activities
7. **Settings** - Platform configuration and compliance settings

## Data Models
- `aiSystems` - AI system inventory with risk levels, status, ownership
- `complianceControls` - Framework-specific control definitions
- `systemControls` - Mapping of controls to systems with status tracking
- `approvalWorkflows` - Approval request lifecycle management
- `auditLogs` - Complete activity audit trail

## File Structure
- `shared/schema.ts` - All data models and Zod schemas
- `server/db.ts` - Database connection
- `server/storage.ts` - Storage interface and DatabaseStorage implementation
- `server/routes.ts` - API endpoints
- `server/seed.ts` - Database seed data
- `client/src/pages/` - Page components (dashboard, registry, risk, compliance, approvals, audit, settings)
- `client/src/components/` - Shared components (app-sidebar, theme-provider, theme-toggle)

## API Endpoints
- `GET/POST /api/ai-systems` - List/create AI systems
- `GET/PATCH/DELETE /api/ai-systems/:id` - Get/update/delete system
- `GET /api/compliance-controls` - List compliance controls
- `GET/POST /api/system-controls` - List/create system-control mappings
- `PATCH /api/system-controls/:id` - Update control status
- `GET/POST /api/approval-workflows` - List/create workflows
- `PATCH /api/approval-workflows/:id` - Update workflow status
- `GET /api/audit-logs` - List audit logs
