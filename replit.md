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
- **File Upload**: multer (disk storage in /uploads directory)

## Key Features
1. **User Authentication** - Login/registration with role-based access (Admin, CRO, CISO, Compliance Lead, Reviewer, System Owner, Auditor)
2. **Dashboard** - Executive overview with key metrics, risk distribution, compliance status
3. **AI System Registry** - CRUD inventory with server-side search & filtering (risk, status, sensitivity, geography, department) + CSV export
4. **System Detail Page** - Per-system profile with tabs: Overview, Controls, Workflows, Evidence, Audit History + PDF evidence export
5. **Risk Assessment** - EU AI Act risk classification framework with system mapping
6. **Compliance Management** - Control mapping across EU AI Act, NIST AI RMF, ISO 42001 + CSV export
7. **Approval Workflows** - Review and approve AI system deployments with server-side filtering
8. **Audit Log** - Complete audit trail with server-side filtering (action, entity type, actor, date range) + CSV export
9. **Notification System** - In-app notifications for approval assignments, workflow status changes, high-risk system registration; bell icon with unread count, mark-as-read, mark-all-read; 30s polling
10. **Evidence File Uploads** - Upload evidence files against systems, controls, or workflows; drag-and-drop zone; file download/delete; per-control attach buttons on system detail page
11. **Settings** - Platform configuration and compliance settings
12. **Export/Reporting** - PDF evidence reports per system, CSV exports for registry, compliance, and audit trail

## Data Models
- `users` - User accounts with roles (admin, cro, ciso, compliance_lead, reviewer, system_owner, auditor)
- `aiSystems` - AI system inventory with risk levels, status, ownership
- `complianceControls` - Framework-specific control definitions
- `systemControls` - Mapping of controls to systems with status tracking
- `approvalWorkflows` - Approval request lifecycle management
- `auditLogs` - Complete activity audit trail
- `notifications` - In-app notifications per user (type, read status, entity link)
- `evidenceFiles` - Evidence file metadata (linked to system, optional control/workflow)

## File Structure
- `shared/schema.ts` - All data models and Zod schemas
- `server/auth.ts` - Passport.js authentication setup, middleware (requireAuth, requireRole)
- `server/db.ts` - Database connection
- `server/storage.ts` - Storage interface and DatabaseStorage implementation with filter support
- `server/routes.ts` - API endpoints (all protected with requireAuth), includes multer file upload
- `server/seed.ts` - Database seed data (creates default admin user: admin/admin123)
- `client/src/hooks/use-auth.tsx` - AuthProvider context and useAuth hook
- `client/src/lib/export-utils.ts` - CSV and PDF export utilities
- `client/src/pages/auth-page.tsx` - Login/registration page
- `client/src/pages/system-detail.tsx` - Per-system detail page with tabs
- `client/src/components/notification-bell.tsx` - Notification bell with popover dropdown
- `client/src/components/evidence-upload.tsx` - Evidence upload with drag-and-drop, file list, compact mode
- `client/src/pages/` - Other pages (dashboard, registry, risk, compliance, approvals, audit, settings)
- `client/src/components/` - Shared components (app-sidebar, theme-provider, theme-toggle)
- `uploads/` - Evidence file storage directory

## API Endpoints
### Auth
- `POST /api/auth/register` - Register new user (first user becomes admin)
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/user` - Get current user

### Protected Routes (require auth)
- `GET /api/ai-systems?search=&riskLevel=&status=&dataSensitivity=&geography=&department=` - List with server-side filtering
- `POST /api/ai-systems` - Create system (admin/cro/ciso/compliance_lead/system_owner)
- `GET/PATCH/DELETE /api/ai-systems/:id` - Get/update/delete system
- `GET /api/ai-systems/:id/controls` - System's mapped controls
- `GET /api/ai-systems/:id/workflows` - System's approval workflows
- `GET /api/ai-systems/:id/audit-logs` - System's audit history
- `GET /api/compliance-controls` - List compliance controls
- `GET/POST /api/system-controls` - List/create system-control mappings
- `PATCH /api/system-controls/:id` - Update control status
- `GET /api/approval-workflows?status=&priority=&systemId=` - List with filtering
- `POST /api/approval-workflows` - Create workflow
- `PATCH /api/approval-workflows/:id` - Update workflow status
- `GET /api/audit-logs?action=&entityType=&performedBy=&dateFrom=&dateTo=` - List with filtering
- `GET /api/notifications` - Get current user's notifications
- `GET /api/notifications/unread-count` - Get unread count
- `PATCH /api/notifications/:id/read` - Mark notification as read
- `POST /api/notifications/read-all` - Mark all read
- `GET /api/evidence?systemId=&controlId=&workflowId=` - List evidence files
- `POST /api/evidence` - Upload evidence file (multipart form)
- `GET /api/evidence/:id/download` - Download evidence file
- `DELETE /api/evidence/:id` - Delete evidence file

## Default Admin
- Username: `admin`
- Password: `admin123`

## Important Notes
- apiRequest takes (method, url, data) — NOT (url, options)
- TanStack Query queryFn joins queryKey with "/" for URL construction; custom queryFn used for filtered endpoints
- seed.ts checks for existing data before seeding to avoid duplicates
- All mutating routes attribute audit logs to authenticated user's fullName
- Notifications are auto-created on: high-risk system creation, workflow approval assignment, workflow status change
- Evidence files stored in /uploads directory with unique filenames, max 50MB per file
