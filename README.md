# Multi Dashboard SaaS Kit

A production-oriented full-stack dashboard starter kit for multi-tenant SaaS products. It includes ten real-world dashboards, reusable React components, JWT authentication, RBAC, tenant-scoped APIs, PostgreSQL models, and realistic seed data.

## Stack

- Frontend: React, Vite, Tailwind CSS, React Query, Recharts
- Backend: Node.js, Express, Prisma, PostgreSQL
- Security: JWT access tokens, refresh tokens, bcrypt password hashing, RBAC middleware, rate limiting, Helmet
- Architecture: npm workspaces monorepo with shared TypeScript dashboard types

## Dashboards

- Analytics: KPIs, revenue trend, order volume, growth signals
- E-commerce: orders, products, fulfillment status, channel revenue
- User Management: members, roles, statuses, protected CRUD invitation flow
- Finance / Billing: transaction ledger, invoice aging, payment status
- Inventory: stock levels, warehouses, reorder alerts
- Project Management: task board, priority mix, assignments
- Marketing: campaign ROI, clicks, conversions, channel comparison
- System Monitoring: logs, service health, error and latency views
- CRM: leads, contacts, deal pipeline, forecast widgets
- AI / Insights: recommendations, predicted trends, confidence scoring

## Quick Start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example apps/backend/.env
   cp .env.example apps/frontend/.env
   ```

3. Start PostgreSQL and create a database named `multi_dashboard_saas`.

4. Run Prisma migration and seed demo data:

   ```bash
   npm run db:migrate
   npm run db:seed
   ```

5. Start the backend and frontend in separate terminals:

   ```bash
   npm run dev:backend
   npm run dev:frontend
   ```

6. Open `http://localhost:5173` and sign in with:

   ```text
   avery@northstar.test
   Password123!
   ```

## API Modules

- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/users`
- `POST /api/users`
- `PATCH /api/users/:id`
- `DELETE /api/users/:id`
- `GET /api/organizations/current`
- `GET /api/dashboard-data/:dashboard`
- `GET /api/logs`
- `GET /api/transactions`

Every business endpoint is scoped to the authenticated user's organization. Admin-only mutations use the RBAC middleware.

## Folder Structure

```text
apps/
  backend/
    prisma/
      schema.prisma
      seed.ts
    src/
      middleware/
      routes/
      services/
      utils/
  frontend/
    src/
      components/
      lib/
      pages/
      providers/
packages/
  shared/
    src/index.ts
```

## Notes For Production

- Replace JWT secrets with long random values.
- Put refresh tokens in secure, httpOnly cookies if your deployment allows same-site cookie auth.
- Add audit logs around admin mutations.
- Wire the AI insights service to your ML or analytics backend when replacing the seeded mock scoring.
- Add CI for `npm run build`, migrations, and API integration tests.

## Personal notes for next run

docker start multi-dashboard-postgres-55432
npm run dev
in another terminal npm run dev:frontend

avery@northstar.test
Password123!
