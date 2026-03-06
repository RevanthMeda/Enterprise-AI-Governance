# AI Control Tower - Enterprise AI Governance & Compliance

## Overview
Enterprise AI governance platform for managing AI systems compliance with EU AI Act, NIST AI RMF, and ISO/IEC 42001 frameworks. Built as a full-stack TypeScript application with user authentication and role-based access control.

## Architecture
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui + TanStack Query
- **Backend**: Express.js with RESTful API + Passport.js authentication
- **Database**: PostgreSQL with Drizzle ORM
- **Routing**: wouter (client-side)
- **Auth**: Passport.js + express-session + bcrypt + connect-pg-simple
- **Export**: jsPDF + jspdf-autotable (PDF), custom CSV generator

## Key Features
1. **User Authentication** - Login/registration with role-based access (Admin, CRO, CISO, Compliance Lead, Reviewer, System Owner, Auditor)
2. **Dashboard** - Executive overview with key metrics, risk distribution, compliance status
3. **AI System Registry** - CRUD inventory of all AI systems with risk classification + CSV export
4. **System Detail Page** - Per-system profile with tabs: Overview, Controls, Workflows, Audit History + PDF evidence export
5. **Risk Assessment** - EU AI Act risk classification framework with system mapping
6. **Compliance Management** - Control mapping across EU AI Act, NIST AI RMF, ISO 42001 + CSV export
7. **Approval Workflows** - Review and approve AI system deployments
8. **Audit Log** - Complete audit trail of all governance activities + CSV export
9. **Settings** - Platform configuration and compliance settings
10. **Export/Reporting** - PDF evidence reports per system, CSV exports for registry, compliance, and audit trail

## Data Models
- `users` - User accounts with roles (admin, cro, ciso, compliance_lead, reviewer, system_owner, auditor)
- `aiSystems` - AI system inventory with risk levels, status, ownership
- `complianceControls` - Framework-specific control definitions
- `systemControls` - Mapping of controls to systems with status tracking
- `approvalWorkflows` - Approval request lifecycle management
- `auditLogs` - Complete activity audit trail

## File Structure
- `shared/schema.ts` - All data models and Zod schemas
- `server/auth.ts` - Passport.js authentication setup, middleware (requireAuth, requireRole)
- `server/db.ts` - Database connection
- `server/storage.ts` - Storage interface and DatabaseStorage implementation
- `server/routes.ts` - API endpoints (all protected with requireAuth)
- `server/seed.ts` - Database seed data (creates default admin user: admin/admin123)
- `client/src/hooks/use-auth.tsx` - AuthProvider context and useAuth hook
- `client/src/lib/export-utils.ts` - CSV and PDF export utilities
- `client/src/pages/auth-page.tsx` - Login/registration page
- `client/src/pages/system-detail.tsx` - Per-system detail page with tabs
- `client/src/pages/` - Other pages (dashboard, registry, risk, compliance, approvals, audit, settings)
- `client/src/components/` - Shared components (app-sidebar, theme-provider, theme-toggle)

## API Endpoints
### Auth
- `POST /api/auth/register` - Register new user (first user becomes admin)
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/user` - Get current user

### Protected Routes (require auth)
- `GET/POST /api/ai-systems` - List/create AI systems
- `GET/PATCH/DELETE /api/ai-systems/:id` - Get/update/delete system
- `GET /api/ai-systems/:id/controls` - System's mapped controls
- `GET /api/ai-systems/:id/workflows` - System's approval workflows
- `GET /api/ai-systems/:id/audit-logs` - System's audit history
- `GET /api/compliance-controls` - List compliance controls
- `GET/POST /api/system-controls` - List/create system-control mappings
- `PATCH /api/system-controls/:id` - Update control status
- `GET/POST /api/approval-workflows` - List/create workflows
- `PATCH /api/approval-workflows/:id` - Update workflow status
- `GET /api/audit-logs` - List audit logs

## Default Admin
- Username: `admin`
- Password: `admin123`

## Important Notes
- apiRequest takes (method, url, data) — NOT (url, options)
- TanStack Query queryFn joins queryKey with "/" for URL construction
- seed.ts checks for existing data before seeding to avoid duplicates
- All mutating routes attribute audit logs to authenticated user's fullName
