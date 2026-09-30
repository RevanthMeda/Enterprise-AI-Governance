# Local development

This guide provides the shortest supported path for contributors who want to run AI CONTROL GRID with a local PostgreSQL database.

## Prerequisites

- Node.js 20.x
- npm
- Docker with Docker Compose

## 1. Install dependencies

```bash
npm ci
```

## 2. Start PostgreSQL

```bash
npm run dev:db:up
```

The development compose file exposes PostgreSQL on `localhost:5432` using:

```text
database: enterprise_ai_governance
user:     postgres
password: postgres
```

These values are for local development only.

The matching connection string is already shown in `.env.example`:

```text
postgresql://postgres:postgres@localhost:5432/enterprise_ai_governance
```

## 3. Create local environment configuration

Copy the example:

```bash
cp .env.example .env.local
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Replace placeholder values needed by the feature you are testing. Never commit `.env.local`.

For a minimal database-backed development session, make sure these security-sensitive values are set to long, local-only random strings:

- `SESSION_SECRET`
- `CONTROL_TOWER_VAULT_SECRET`
- `PASSWORD_RESET_SECRET`

Do not reuse production values.

## 4. Apply the schema

```bash
npm run db:push -- --force
```

## 5. Start the application

```bash
npm run dev
```

Open:

- app: `http://localhost:5000/`
- login: `http://localhost:5000/auth/login`
- API docs: `http://localhost:5000/api-docs`

## 6. Run validation

```bash
npm run check
npm run build
npm run test:regression:all
```

Some regression/security tests require test-only environment secrets. GitHub Actions supplies explicit non-production values for CI. Locally, use dedicated test values rather than production secrets.

## Database lifecycle

Stop the database without deleting data:

```bash
npm run dev:db:down
```

Reset the local database volume:

```bash
npm run dev:db:reset
```

The reset command permanently deletes the local development database volume.

## Troubleshooting

### Port 5432 is already in use

If PostgreSQL is already installed locally, either stop the existing service or edit `docker-compose.dev.yml` to expose a different host port and update `DATABASE_URL` accordingly.

### Database schema errors

```bash
npm run dev:db:reset
npm run db:push -- --force
```

### Docker is unavailable

You can use any PostgreSQL 16-compatible local instance. Point `DATABASE_URL` at that database and continue from the schema step.
